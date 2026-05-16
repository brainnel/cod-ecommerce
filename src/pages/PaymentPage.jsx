import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FiCreditCard, FiMapPin } from 'react-icons/fi'
import { districtAPI, orderAPI, bundleAPI } from '../services/api'
import { useAdId } from '../hooks/useAdTrackingHooks.js'
import { trackPurchaseEvent, getClientInfo } from '../services/facebookConversions'
import {
  buildCheckoutProductProperties,
  getCheckoutQuantityExperiment,
  getCheckoutSessionId,
  isCodTrustCheckoutVariant,
  isInlineCheckoutVariant,
  resumeCheckoutSession,
  startCheckoutSession,
  trackCheckoutEvent,
  updateCheckoutContext
} from '../services/checkoutFunnelAnalytics'
import MapSelector from '../components/MapSelector'
import MapGuideModal from '../components/MapGuideModal'
import { DISTRICT_CENTERS, DEFAULT_CENTER, DEFAULT_ZOOM } from '../constants/districtCenters'
import {
  getLocalPreviewBrowserContext as getPreviewBrowserContext,
  syncLocalPreviewBrowserContextFromSearch
} from '../utils/checkoutBrowserContextPreview'
import './PaymentPage.css'

const GEOLOCATION_CACHE_MAX_AGE_MS = 5 * 60 * 1000
const GEOLOCATION_MANUAL_HINT_MS = 4000
const GEOLOCATION_FAST_TIMEOUT_MS = 6000
const CHECKOUT_MIN_STEP = 1
const CHECKOUT_MAX_STEP = 3

const clampCheckoutStep = (step) => {
  const parsedStep = Number(step)
  if (!Number.isFinite(parsedStep)) return CHECKOUT_MIN_STEP
  return Math.min(Math.max(parsedStep, CHECKOUT_MIN_STEP), CHECKOUT_MAX_STEP)
}

const getCheckoutStepFromSearch = (search) => {
  const params = new URLSearchParams(search)
  return clampCheckoutStep(params.get('step'))
}

const hasCheckoutStepInSearch = (search) => {
  const params = new URLSearchParams(search)
  return params.has('step')
}

const buildCheckoutStepSearch = (step, currentSearch = '') => {
  const params = new URLSearchParams()
  params.set('step', String(clampCheckoutStep(step)))

  const previewContext = getPreviewBrowserContext(currentSearch)
  if (previewContext) {
    params.set('browser_context', previewContext)
  }

  return `?${params.toString()}`
}

const getProductStockLimit = (product) => {
  const stock = Number(product?.stock)
  return Number.isFinite(stock) && stock > 0 ? Math.floor(stock) : 99
}

const clampQuantity = (value, product) => {
  const parsedQuantity = Number.parseInt(value, 10)
  const stockLimit = getProductStockLimit(product)
  if (!Number.isFinite(parsedQuantity)) return 1
  return Math.min(Math.max(parsedQuantity, 1), stockLimit)
}

const getBrowserContext = () => {
  const previewContext = getPreviewBrowserContext()

  if (previewContext === 'instagram_in_app') {
    return {
      browser_context: 'instagram_in_app',
      is_meta_in_app_browser: true
    }
  }

  if (previewContext === 'facebook_in_app') {
    return {
      browser_context: 'facebook_in_app',
      is_meta_in_app_browser: true
    }
  }

  if (typeof navigator === 'undefined') {
    return {
      browser_context: 'unknown',
      is_meta_in_app_browser: false
    }
  }

  const userAgent = navigator.userAgent || navigator.vendor || ''
  const isInstagram = /Instagram/i.test(userAgent)
  const isFacebook = /FBAN|FBAV|FB_IAB|FB4A|FBIOS/i.test(userAgent)

  if (isInstagram) {
    return {
      browser_context: 'instagram_in_app',
      is_meta_in_app_browser: true
    }
  }

  if (isFacebook) {
    return {
      browser_context: 'facebook_in_app',
      is_meta_in_app_browser: true
    }
  }

  return {
    browser_context: 'standard_browser',
    is_meta_in_app_browser: false
  }
}

const PaymentPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    product: productFromState,
    bundle: bundleFromState,
    quantity: routeQuantity,
    productType: productTypeFromState,
    checkoutSessionId: routeCheckoutSessionId,
    checkoutQuantityExperiment: routeCheckoutQuantityExperiment,
    quantityConfirmed: routeQuantityConfirmed
  } = location.state || {}

  // Detect flow: 'bundle' or 'product' (default).
  const productType = productTypeFromState || (bundleFromState ? 'bundle' : 'product')
  const isBundleFlow = productType === 'bundle'

  // In bundle flow, build a synthetic product-like object so the rest of the page
  // (analytics, price calculations, summary rendering) can stay product-shaped.
  const product = useMemo(() => {
    if (isBundleFlow && bundleFromState) {
      return {
        product_id: `bundle:${bundleFromState.id}`,
        name_fr: bundleFromState.title_fr,
        price: bundleFromState.cfa_price,
        image_url: bundleFromState.cover_image_url ? [bundleFromState.cover_image_url] : [],
        stock: 99,
        skus: [],
        product_type: 'bundle'
      }
    }
    return productFromState
  }, [isBundleFlow, bundleFromState, productFromState])

  const bundle = isBundleFlow ? bundleFromState : null
  const checkoutQuantityExperiment = useMemo(
    () => routeCheckoutQuantityExperiment || getCheckoutQuantityExperiment(),
    [routeCheckoutQuantityExperiment]
  )
  const adId = useAdId()
  const checkoutSessionIdRef = useRef(routeCheckoutSessionId || null)
  const inlineQuantityConfirmedRef = useRef(Boolean(routeQuantityConfirmed))
  const infoStepTrackedRef = useRef(false)
  const completedFieldsRef = useRef(new Set())
  const fieldRefs = useRef({})
  const currentLocationRequestRef = useRef(0)
  const currentLocationTrackedRequestRef = useRef(null)
  const currentLocationHintTimerRef = useRef(null)
  const markerSelectionSourceRef = useRef('none')
  const browserContext = useMemo(() => getBrowserContext(), [])
  const isMetaInAppBrowser = browserContext.is_meta_in_app_browser
  const isInlineQuantityVariant = isInlineCheckoutVariant(checkoutQuantityExperiment)
  const isCodTrustVariant = isCodTrustCheckoutVariant(checkoutQuantityExperiment)

  // 三步流程：1=选大区, 2=地图标记, 3=填写信息
  const [currentStep, setCurrentStep] = useState(() => getCheckoutStepFromSearch(location.search))
  const [loading, setLoading] = useState(false)
  const [quantity, setQuantity] = useState(() => clampQuantity(routeQuantity || 1, product))

  // 步顢1：大区选择
  const [districts, setDistricts] = useState([])
  const [selectedDistrict, setSelectedDistrict] = useState(null)

  // 步顢2：地图标记
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER)
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM)
  const [customMarker, setCustomMarker] = useState(null)
  const [userLocation, setUserLocation] = useState(null)  // 用户当前位置
  const [markerSelectionSource, setMarkerSelectionSourceState] = useState('none')
  const [locationRequestStatus, setLocationRequestStatus] = useState('idle')
  const [locationRequestMessage, setLocationRequestMessage] = useState('')
  const [showGuideModal, setShowGuideModal] = useState(false)

  // 步骤3：用户信息
  const [userInfo, setUserInfo] = useState({
    fullName: '',
    phone: '',
    whatsapp: '',
    addressDescription: ''
  })
  const [whatsappSameAsPhone, setWhatsappSameAsPhone] = useState(true)
  const [errors, setErrors] = useState({})
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [clientInfo, setClientInfo] = useState({})

  const mapSelectedNoteText = markerSelectionSource === 'district_center_fallback'
    ? 'Adresse prise en compte. Appuyez sur Suivant.'
    : 'Position marquée. Appuyez sur Suivant.'

  const setMarkerSelectionSource = (source) => {
    markerSelectionSourceRef.current = source
    setMarkerSelectionSourceState(source)
  }

  const ensureCheckoutSession = () => {
    if (checkoutSessionIdRef.current) return checkoutSessionIdRef.current

    const storedSessionId = getCheckoutSessionId()
    if (storedSessionId) {
      checkoutSessionIdRef.current = storedSessionId
      return storedSessionId
    }

    if (!product) return null

    const totalPrice = product.price * (quantity || 1)
    checkoutSessionIdRef.current = startCheckoutSession(product, {
      quantity: quantity || 1,
      total_price: totalPrice,
      ad_id: adId,
      ...checkoutQuantityExperiment
    })
    trackCheckoutEvent('checkout_start', buildCheckoutProductProperties(product, {
      quantity: quantity || 1,
      total_price: totalPrice,
      ad_id: adId,
      ...checkoutQuantityExperiment
    }), { sessionId: checkoutSessionIdRef.current })
    return checkoutSessionIdRef.current
  }

  const getDistrictAnalyticsProps = (district = selectedDistrict) => {
    if (!district) return {}
    return {
      district_id: district.id ? String(district.id) : null,
      district_name: district.name || null,
      city_id: district.city_id ? String(district.city_id) : null,
      city_name: district.city_name || null
    }
  }

  const getDistrictCenterMarker = (district = selectedDistrict) => {
    const districtLat = Number.parseFloat(district?.latitude)
    const districtLng = Number.parseFloat(district?.longitude)
    const fallbackCenter = mapCenter || DEFAULT_CENTER

    return {
      lat: Number.isFinite(districtLat) ? districtLat : fallbackCenter.lat,
      lng: Number.isFinite(districtLng) ? districtLng : fallbackCenter.lng
    }
  }

  const getDeliveryMarkerForOrder = () => {
    if (markerSelectionSourceRef.current === 'district_center_fallback') {
      return getDistrictCenterMarker(selectedDistrict)
    }
    return customMarker
  }

  const getCheckoutAnalyticsProps = (extra = {}) => {
    const totalPrice = product ? product.price * (quantity || 1) : 0
    return {
      ...buildCheckoutProductProperties(product, {
        quantity: quantity || 1,
        total_price: totalPrice,
        ad_id: adId,
        ...checkoutQuantityExperiment
      }),
      browser_context: browserContext.browser_context,
      is_meta_in_app_browser: isMetaInAppBrowser,
      ...getDistrictAnalyticsProps(),
      ...extra
    }
  }

  const trackPaymentEvent = (eventName, properties = {}) => {
    const checkoutSessionId = ensureCheckoutSession()
    if (!checkoutSessionId) return

    trackCheckoutEvent(eventName, getCheckoutAnalyticsProps(properties), {
      sessionId: checkoutSessionId
    })
  }

  const handleInlineQuantityChange = (nextQuantity) => {
    const normalizedQuantity = clampQuantity(nextQuantity, product)
    if (normalizedQuantity === quantity) return

    const previousQuantity = quantity
    const totalPrice = product.price * normalizedQuantity
    setQuantity(normalizedQuantity)
    updateCheckoutContext(product, {
      quantity: normalizedQuantity,
      total_price: totalPrice,
      ad_id: adId,
      ...checkoutQuantityExperiment
    })
    trackPaymentEvent('quantity_changed', {
      quantity: normalizedQuantity,
      previous_quantity: previousQuantity,
      total_price: totalPrice,
      quantity_change_method: 'district_stepper',
      ...checkoutQuantityExperiment
    })
  }

  const getPaymentNavigationState = () => ({
    ...(location.state || {}),
    product: productFromState,
    bundle: bundleFromState,
    quantity,
    productType: productTypeFromState,
    checkoutSessionId: checkoutSessionIdRef.current || routeCheckoutSessionId || getCheckoutSessionId(),
    checkoutQuantityExperiment,
    quantityConfirmed: inlineQuantityConfirmedRef.current
  })

  const navigateToCheckoutStep = (step, options = {}) => {
    const nextStep = clampCheckoutStep(step)
    const nextSearch = buildCheckoutStepSearch(nextStep, location.search)

    if (location.pathname === '/payment' && location.search === nextSearch && currentStep === nextStep) {
      return
    }

    navigate(
      {
        pathname: '/payment',
        search: nextSearch
      },
      {
        replace: Boolean(options.replace),
        state: getPaymentNavigationState()
      }
    )
  }

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [])

  useEffect(() => {
    syncLocalPreviewBrowserContextFromSearch(location.search)
  }, [location.search])

  useEffect(() => () => {
    if (currentLocationHintTimerRef.current) {
      clearTimeout(currentLocationHintTimerRef.current)
    }
  }, [])

  // 重定向检查
  useEffect(() => {
    if (!product || !quantity) {
      navigate('/')
      return
    }
    const info = getClientInfo()
    setClientInfo(info)

    const totalPrice = product.price * quantity
    if (routeCheckoutSessionId) {
      checkoutSessionIdRef.current = routeCheckoutSessionId
      resumeCheckoutSession(routeCheckoutSessionId, product, {
        quantity,
        total_price: totalPrice,
        ad_id: adId,
        ...checkoutQuantityExperiment
      })
    } else {
      const storedSessionId = getCheckoutSessionId()
      if (storedSessionId) {
        checkoutSessionIdRef.current = storedSessionId
      }
      updateCheckoutContext(product, {
        quantity,
        total_price: totalPrice,
        ad_id: adId,
        ...checkoutQuantityExperiment
      })
    }
  }, [product, quantity, navigate, routeCheckoutSessionId, adId, checkoutQuantityExperiment])

  useEffect(() => {
    if (!product) return
    setQuantity((currentQuantity) => clampQuantity(currentQuantity || routeQuantity || 1, product))
  }, [product, routeQuantity])

  useEffect(() => {
    if (!product || !quantity) return

    const requestedStep = getCheckoutStepFromSearch(location.search)
    const hasStepInUrl = hasCheckoutStepInSearch(location.search)
    const maxAllowedStep = selectedDistrict ? (customMarker ? 3 : 2) : 1
    const nextStep = Math.min(requestedStep, maxAllowedStep)
    const canonicalSearch = buildCheckoutStepSearch(nextStep, location.search)

    if (!hasStepInUrl || nextStep !== requestedStep || location.search !== canonicalSearch) {
      navigateToCheckoutStep(nextStep, { replace: true })
      return
    }

    if (currentStep !== nextStep) {
      setCurrentStep(nextStep)
    }
  }, [location.search, product, quantity, selectedDistrict, customMarker, currentStep])

  // 加载大区列表（扁平化）
  useEffect(() => {
    const fetchDistricts = async () => {
      try {
        setLoading(true)
        const citiesData = await districtAPI.getAllDistricts()
        
        // 扁平化：将所有districts展开，保留城市信息
        const allDistricts = []
        citiesData.forEach(city => {
          if (city.districts && city.districts.length > 0) {
            city.districts.forEach(district => {
              allDistricts.push({
                ...district,
                city_id: city.id,
                city_name: city.name,
                all_city_districts: city.districts  // 保存同城市所有districts用于计算中心点
              })
            })
          }
        })
        
        setDistricts(allDistricts)
      } catch (err) {
        console.error('获取大区列表失败:', err)
        alert('Impossible de charger la liste des districts')
      } finally {
        setLoading(false)
      }
    }
    fetchDistricts()
  }, [])

  const requestBrowserLocation = (options) => (
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject({ code: 2, message: 'Geolocation is not supported' })
        return
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, options)
    })
  )

  const positionToMarker = (position) => ({
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : null
  })

  const getMonotonicNow = () => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now()
    }
    return Date.now()
  }

  const getLocationDurationMs = (startedAtMs) => {
    if (!startedAtMs) return 0
    return Math.max(0, Math.round(getMonotonicNow() - startedAtMs))
  }

  const clearCurrentLocationHintTimer = () => {
    if (!currentLocationHintTimerRef.current) return
    clearTimeout(currentLocationHintTimerRef.current)
    currentLocationHintTimerRef.current = null
  }

  const buildPositionAnalyticsProps = (position, startedAtMs, stage) => ({
    geolocation_stage: stage,
    geolocation_duration_ms: getLocationDurationMs(startedAtMs),
    geolocation_accuracy_m: typeof position?.coords?.accuracy === 'number'
      ? Math.round(position.coords.accuracy)
      : null,
    geolocation_timeout_ms: stage === 'cached' ? 0 : GEOLOCATION_FAST_TIMEOUT_MS,
    geolocation_enable_high_accuracy: false,
    geolocation_position_age_ms: typeof position?.timestamp === 'number'
      ? Math.max(0, Date.now() - position.timestamp)
      : null
  })

  const buildLocationErrorAnalyticsProps = (error, startedAtMs, stage) => ({
    error_code: error?.code || 2,
    error_message: error?.message ? String(error.message).slice(0, 160) : '',
    geolocation_stage: stage,
    geolocation_duration_ms: getLocationDurationMs(startedAtMs),
    geolocation_timeout_ms: GEOLOCATION_FAST_TIMEOUT_MS,
    geolocation_enable_high_accuracy: false
  })

  const applyCurrentLocation = (position, requestId, stage, startedAtMs) => {
    if (requestId !== currentLocationRequestRef.current) return false
    clearCurrentLocationHintTimer()

    const userPos = positionToMarker(position)
    setUserLocation(userPos)

    if (markerSelectionSourceRef.current === 'manual') {
      console.log('用户已手动选择位置，跳过自动覆盖:', userPos)
      return false
    }

    setMarkerSelectionSource('current')
    setCustomMarker(userPos)
    setMapCenter(userPos)
    setLocationRequestStatus('success')
    setLocationRequestMessage('Position trouvée. Vous pouvez ajuster sur la carte si nécessaire.')

    if (currentLocationTrackedRequestRef.current !== requestId) {
      currentLocationTrackedRequestRef.current = requestId
      trackPaymentEvent('location_selected', {
        ...getDistrictAnalyticsProps(),
        location_method: 'current_location',
        ...buildPositionAnalyticsProps(position, startedAtMs, stage)
      })
    }

    console.log('用户位置:', userPos)
    return true
  }

  const trackCurrentLocationFailure = (error, requestId, stage, startedAtMs) => {
    if (requestId !== currentLocationRequestRef.current) return
    if (currentLocationTrackedRequestRef.current === requestId) return

    trackPaymentEvent('location_current_failed', {
      ...getDistrictAnalyticsProps(),
      ...buildLocationErrorAnalyticsProps(error, startedAtMs, stage)
    })
  }

  const handleUseCurrentLocation = () => {
    const requestId = currentLocationRequestRef.current + 1
    currentLocationRequestRef.current = requestId
    currentLocationTrackedRequestRef.current = null
    setMarkerSelectionSource('current_pending')
    clearCurrentLocationHintTimer()
    setLocationRequestStatus('locating')
    setLocationRequestMessage('Recherche de votre position...')
    trackPaymentEvent('location_current_attempt', getDistrictAnalyticsProps())

    const startedAtMs = getMonotonicNow()

    if (userLocation) {
      applyCurrentLocation({
        coords: {
          latitude: userLocation.lat,
          longitude: userLocation.lng,
          accuracy: userLocation.accuracy ?? null
        }
      }, requestId, 'cached', startedAtMs)
      return
    }

    currentLocationHintTimerRef.current = setTimeout(() => {
      if (
        requestId === currentLocationRequestRef.current &&
        currentLocationTrackedRequestRef.current !== requestId &&
        markerSelectionSourceRef.current !== 'manual'
      ) {
        setLocationRequestStatus('slow')
        setLocationRequestMessage('La localisation prend plus de temps. Vous pouvez sélectionner votre position sur la carte.')
      }
    }, GEOLOCATION_MANUAL_HINT_MS)

    requestBrowserLocation({
      enableHighAccuracy: false,
      timeout: GEOLOCATION_FAST_TIMEOUT_MS,
      maximumAge: GEOLOCATION_CACHE_MAX_AGE_MS
    })
      .then((position) => {
        applyCurrentLocation(position, requestId, 'fast', startedAtMs)
      })
      .catch((error) => {
        console.log('快速定位失败:', error.message)
        if (requestId !== currentLocationRequestRef.current) return
        clearCurrentLocationHintTimer()
        trackCurrentLocationFailure(error, requestId, 'fast', startedAtMs)
        if (markerSelectionSourceRef.current !== 'manual') {
          setLocationRequestStatus('failed')
          setLocationRequestMessage('Impossible d’obtenir votre position. Veuillez sélectionner votre position sur la carte.')
        }
      })
  }

  // 选择大区
  const handleSelectDistrict = (district) => {
    setSelectedDistrict(district)
    updateCheckoutContext(product, {
      quantity,
      total_price: product.price * quantity,
      ad_id: adId,
      ...checkoutQuantityExperiment,
      ...getDistrictAnalyticsProps(district)
    })
    trackPaymentEvent('district_selected', getDistrictAnalyticsProps(district))
    
    // 直接使用大区自己的坐标作为地图中心
    const districtCenter = {
      lat: parseFloat(district.latitude),
      lng: parseFloat(district.longitude)
    }
    setMapCenter(districtCenter)
    setMapZoom(14)  // 大区级别，用更高的缩放
    setCustomMarker(null)
    setMarkerSelectionSource('none')
    clearCurrentLocationHintTimer()
    setLocationRequestStatus('idle')
    setLocationRequestMessage('')
    
    navigateToCheckoutStep(2)
    // 显示引导动画
    setTimeout(() => setShowGuideModal(true), 500)
  }

  // 地图标记
  const handleMapClick = (marker) => {
    setMarkerSelectionSource('manual')
    clearCurrentLocationHintTimer()
    setLocationRequestStatus('idle')
    setLocationRequestMessage('')
    setCustomMarker(marker)
    trackPaymentEvent('location_selected', {
      ...getDistrictAnalyticsProps(),
      location_method: 'manual_map'
    })
  }

  // 确认标记，进入步骤3
  const handleConfirmMarker = () => {
    if (!customMarker) {
      alert('Veuillez cliquer sur la carte pour choisir un emplacement')
      return
    }
    trackPaymentEvent('location_confirmed', getDistrictAnalyticsProps())
    navigateToCheckoutStep(3)
  }

  const handleUseDistrictCenterFallback = () => {
    if (!selectedDistrict) return

    const hadManualMapSelection = markerSelectionSourceRef.current === 'manual' || Boolean(customMarker)
    currentLocationRequestRef.current += 1
    clearCurrentLocationHintTimer()
    const fallbackMarker = getDistrictCenterMarker(selectedDistrict)
    setMarkerSelectionSource('district_center_fallback')
    setCustomMarker(fallbackMarker)
    setMapCenter(fallbackMarker)
    setLocationRequestStatus('idle')
    setLocationRequestMessage('')

    const fallbackProps = {
      ...getDistrictAnalyticsProps(selectedDistrict),
      location_method: 'district_center_fallback',
      location_fallback_requires_address_detail: true,
      location_fallback_after_manual_map: hadManualMapSelection
    }
    trackPaymentEvent('location_fallback_used', fallbackProps)
    trackPaymentEvent('location_selected', fallbackProps)
    trackPaymentEvent('location_confirmed', fallbackProps)
    navigateToCheckoutStep(3)
  }

  // 表单输入处理
  const trackFieldCompletedOnce = (field, extra = {}) => {
    if (completedFieldsRef.current.has(field)) return
    completedFieldsRef.current.add(field)
    trackPaymentEvent('field_completed', {
      ...getDistrictAnalyticsProps(),
      field,
      ...extra
    })
  }

  const handleInputChange = (field, value) => {
    let nextValue = value

    if (field === 'phone' || field === 'whatsapp') {
      nextValue = value.replace(/\D/g, '').slice(0, 10)
    } else if (field === 'addressDescription') {
      nextValue = value.slice(0, 200)
    }

    setUserInfo(prev => ({
      ...prev,
      [field]: nextValue,
      ...(field === 'phone' && whatsappSameAsPhone ? { whatsapp: nextValue } : {})
    }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
    if (field === 'phone' && whatsappSameAsPhone && errors.whatsapp) {
      setErrors(prev => ({ ...prev, whatsapp: '' }))
    }

    const isFieldComplete = (
      (field === 'fullName' && nextValue.trim().length > 0) ||
      ((field === 'phone' || field === 'whatsapp') && nextValue.length === 10) ||
      (field === 'addressDescription' && nextValue.trim().length >= 5)
    )

    if (isFieldComplete) {
      trackFieldCompletedOnce(field, {
        ...(field === 'whatsapp' ? { whatsapp_same_as_phone: false } : {})
      })
    }

    if (field === 'phone' && whatsappSameAsPhone && nextValue.length === 10) {
      trackFieldCompletedOnce('whatsapp', { whatsapp_same_as_phone: true })
    }
  }

  const handleWhatsappSameAsPhoneChange = (checked) => {
    setWhatsappSameAsPhone(checked)
    setUserInfo(prev => ({
      ...prev,
      whatsapp: checked ? prev.phone : prev.whatsapp
    }))
    setErrors(prev => ({ ...prev, whatsapp: '' }))

    trackPaymentEvent('whatsapp_same_as_phone_changed', {
      ...getDistrictAnalyticsProps(),
      whatsapp_same_as_phone: checked
    })

    if (checked && userInfo.phone.length === 10) {
      trackFieldCompletedOnce('whatsapp', { whatsapp_same_as_phone: true })
    }
  }

  const scrollToFirstMissingField = (missingFields) => {
    if (!isInlineQuantityVariant || missingFields.length === 0) return

    const field = missingFields[0]
    const fieldNode = fieldRefs.current[field]
    if (!fieldNode) return

    window.requestAnimationFrame(() => {
      fieldNode.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (typeof fieldNode.focus === 'function') {
        fieldNode.focus({ preventScroll: true })
      }
    })
  }

  // 验证表单
  const validateForm = () => {
    const newErrors = {}
    const effectiveWhatsapp = whatsappSameAsPhone ? userInfo.phone : userInfo.whatsapp
    
    if (!userInfo.fullName.trim()) {
      newErrors.fullName = 'Le nom complet est requis'
    }
    
    if (!userInfo.phone.trim()) {
      newErrors.phone = 'Le numéro de téléphone est requis'
    } else if (userInfo.phone.length !== 10) {
      newErrors.phone = 'Le numéro doit contenir 10 chiffres'
    }
    
    if (!whatsappSameAsPhone && !effectiveWhatsapp.trim()) {
      newErrors.whatsapp = 'Le numéro WhatsApp est requis'
    } else if (!whatsappSameAsPhone && effectiveWhatsapp.length !== 10) {
      newErrors.whatsapp = 'Le numéro doit contenir 10 chiffres'
    }
    
    if (!userInfo.addressDescription.trim()) {
      newErrors.addressDescription = isInlineQuantityVariant
        ? 'Ajoutez votre adresse et un repère pour le livreur'
        : 'La description de l\'adresse est requise'
    } else if (userInfo.addressDescription.trim().length < 5) {
      newErrors.addressDescription = isInlineQuantityVariant
        ? 'Ajoutez une adresse plus précise'
        : 'Au moins 5 caractères requis'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  useEffect(() => {
    if (currentStep !== 3 || infoStepTrackedRef.current) return

    infoStepTrackedRef.current = true
    trackPaymentEvent('info_step_view', getDistrictAnalyticsProps())
  }, [currentStep])

  // 提交订单
  const handlePlaceOrder = async () => {
    const effectiveWhatsapp = whatsappSameAsPhone ? userInfo.phone : userInfo.whatsapp
    const effectiveUserInfo = {
      ...userInfo,
      whatsapp: effectiveWhatsapp
    }

    if (!validateForm()) {
      const missingFields = []
      if (!userInfo.fullName.trim()) missingFields.push('fullName')
      if (userInfo.phone.length !== 10) missingFields.push('phone')
      if (!whatsappSameAsPhone && effectiveWhatsapp.length !== 10) missingFields.push('whatsapp')
      if (userInfo.addressDescription.trim().length < 5) missingFields.push('addressDescription')
      trackPaymentEvent('submit_validation_failed', {
        ...getDistrictAnalyticsProps(),
        missing_fields: missingFields,
        whatsapp_same_as_phone: whatsappSameAsPhone
      })
      scrollToFirstMissingField(missingFields)
      return
    }
    
    trackPaymentEvent('submit_order_click', {
      ...getDistrictAnalyticsProps(),
      whatsapp_same_as_phone: whatsappSameAsPhone
    })
    setIsPlacingOrder(true)

    try {
      let response
      const deliveryMarker = getDeliveryMarkerForOrder()
      if (!deliveryMarker) {
        throw new Error('Delivery location is missing')
      }

      if (isBundleFlow && bundle) {
        // Bundle flow: backend builds child SKU items from bundle definition.
        const bundleOrderData = {
          district_id: selectedDistrict.id,
          full_name: userInfo.fullName,
          phone: `225${userInfo.phone}`,
          whatsapp: `225${effectiveWhatsapp}`,
          receiver_address: userInfo.addressDescription,
          latitude: deliveryMarker.lat,
          longitude: deliveryMarker.lng,
          payment_method: "cod",
          currency: "FCFA",
          is_web: 1,
          quantity,
          ad_id: adId
        }
        console.log('提交组合产品订单:', bundleOrderData)
        response = await bundleAPI.createBundleOrder(bundle.id, bundleOrderData)
      } else {
        const orderData = {
          items: [{
            product_id: product.product_id.toString(),
            sku_id: product.skus && product.skus.length > 0 ? product.skus[0].sku_id : product.product_id.toString(),
            quantity: quantity,
            unit_price: product.price,
            total_price: product.price * quantity
          }],
          district_id: selectedDistrict.id,
          full_name: userInfo.fullName,
          phone: `225${userInfo.phone}`,
          whatsapp: `225${effectiveWhatsapp}`,
          receiver_address: userInfo.addressDescription,
          latitude: deliveryMarker.lat,
          longitude: deliveryMarker.lng,
          payment_method: "cod",
          total_amount: product.price * quantity,
          actual_amount: product.price * quantity,
          discount_amount: 0,
          currency: "FCFA",
          is_web: 1,
          ad_id: adId
        }

        console.log('提交订单:', orderData)
        response = await orderAPI.createOrder(orderData)
      }
      console.log('订单响应:', response)

      // 发送Facebook购买事件
      if (response?.data && response.status >= 200 && response.status < 300) {
        trackPaymentEvent('order_create_success', {
          ...getDistrictAnalyticsProps(),
          order_no: response.data.order_no || response.data.order_id || null,
          order_status: response.status,
          whatsapp_same_as_phone: whatsappSameAsPhone
        })

        try {
          trackPurchaseEvent({
            productId: product.product_id,
            quantity: quantity,
            totalPrice: product.price * quantity,
            unitPrice: product.price,
            orderNo: response.data.order_no || response.data.order_id
          }, effectiveUserInfo, clientInfo).catch(err => console.warn('Facebook事件失败:', err))
        } catch (fbError) {
          console.warn('Facebook事件错误:', fbError)
        }
      }

      // 跳转到订单成功页面
      navigate('/order-success', {
        state: {
          product,
          quantity,
          userInfo: effectiveUserInfo,
          selectedLocation: selectedDistrict,
          totalPrice: product.price * quantity,
          orderResponse: response.data,
          checkoutQuantityExperiment
        }
      })

    } catch (err) {
      console.error('订单失败:', err)
      trackPaymentEvent('order_create_failed', {
        ...getDistrictAnalyticsProps(),
        error_status: err.response?.status || null,
        error_type: err.code || 'order_api_error',
        whatsapp_same_as_phone: whatsappSameAsPhone
      })
      alert(err.response?.data?.message || 'Une erreur est survenue')
    } finally {
      setIsPlacingOrder(false)
    }
  }

  if (!product || !quantity) return null

  const totalPrice = product.price * quantity

  return (
    <div className="payment-page">
      {/* 顶部标题栏 */}
      <div className="payment-header">
        <button type="button" className="back-btn" onClick={() => navigate(-1)}>←</button>
        <h1 className="payment-title">Finaliser la commande</h1>
      </div>

      <div className="payment-content">
        {/* 步骤指示器 */}
        <div className="steps-indicator">
          <div className={`step ${currentStep >= 1 ? 'active' : ''} ${selectedDistrict ? 'completed' : ''}`}>
            <div className="step-icon">{selectedDistrict ? '✓' : '1'}</div>
            <span className="step-label">District</span>
          </div>
          <div className="step-divider"></div>
          <div className={`step ${currentStep >= 2 ? 'active' : ''} ${customMarker ? 'completed' : ''}`}>
            <div className="step-icon">{customMarker ? '✓' : '2'}</div>
            <span className="step-label">Position</span>
          </div>
          <div className="step-divider"></div>
          <div className={`step ${currentStep >= 3 ? 'active' : ''}`}>
            <div className="step-icon">3</div>
            <span className="step-label">Informations</span>
          </div>
        </div>

        {/* 步顢1: 选择大区 */}
        {currentStep === 1 && (
          <div className="section district-section">
            <h2 className="section-title">Sélectionnez votre district</h2>
            {isInlineQuantityVariant && (
              <div className="inline-quantity-card">
                <img
                  src={product.image_url?.[0]}
                  alt={product.name_fr}
                  className="inline-quantity-image"
                />
                <div className="inline-quantity-info">
                  <div className="inline-quantity-title">{product.name_fr}</div>
                  <div className="inline-quantity-price">{product.price} FCFA</div>
                </div>
                <div className="inline-quantity-control" aria-label="Quantité">
                  <span className="inline-quantity-label">Quantité</span>
                  <div className="inline-quantity-stepper">
                    <button
                      type="button"
                      className="inline-quantity-btn"
                      onClick={() => handleInlineQuantityChange(quantity - 1)}
                      disabled={quantity <= 1}
                      aria-label="Réduire la quantité"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      className="inline-quantity-input"
                      value={quantity}
                      min="1"
                      max={getProductStockLimit(product)}
                      onChange={(event) => handleInlineQuantityChange(event.target.value)}
                      aria-label="Quantité"
                    />
                    <button
                      type="button"
                      className="inline-quantity-btn"
                      onClick={() => handleInlineQuantityChange(quantity + 1)}
                      disabled={quantity >= getProductStockLimit(product)}
                      aria-label="Augmenter la quantité"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="inline-quantity-total">
                  <span>Total</span>
                  <strong>{totalPrice} FCFA</strong>
                </div>
              </div>
            )}
            {loading ? (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Chargement...</p>
              </div>
            ) : (
              <div className="district-list">
                {districts.map((district) => (
                  <div
                    key={district.id}
                    className="district-card"
                    onClick={() => handleSelectDistrict(district)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="district-icon"><FiMapPin aria-hidden="true" /></div>
                    <div className="district-info">
                      <div className="district-name">{district.name}</div>
                      <div className="district-city">{district.city_name}</div>
                    </div>
                    <div className="district-arrow">›</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 步顢2: 地图标记 */}
        {currentStep === 2 && (
          <div className={`section map-section ${isInlineQuantityVariant ? 'with-location-fallback' : ''}`}>
            {/* 橙色提示条 */}
            <div className={`location-hint ${isMetaInAppBrowser ? 'map-only' : ''}`}>
              <div className="hint-content">
                <span className="hint-text">
                  {isMetaInAppBrowser
                    ? 'Veuillez choisir votre adresse de livraison sur la carte.'
                    : 'Si vous êtes à l’adresse de livraison, appuyez sur « Utiliser ma position ». Sinon, choisissez l’adresse sur la carte.'}
                </span>
              </div>
              {!isMetaInAppBrowser && (
                <button
                  className={`use-location-btn ${locationRequestStatus === 'locating' || locationRequestStatus === 'slow' ? 'loading' : ''}`}
                  onClick={handleUseCurrentLocation}
                  disabled={locationRequestStatus === 'locating' || locationRequestStatus === 'slow'}
                  type="button"
                  title="Utiliser ma position actuelle"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <circle cx="12" cy="12" r="3"/>
                    <line x1="12" y1="2" x2="12" y2="4"/>
                    <line x1="12" y1="20" x2="12" y2="22"/>
                    <line x1="2" y1="12" x2="4" y2="12"/>
                    <line x1="20" y1="12" x2="22" y2="12"/>
                  </svg>
                  <span>
                    {locationRequestStatus === 'locating' || locationRequestStatus === 'slow'
                      ? 'Recherche...'
                      : 'Utiliser ma position'}
                  </span>
                </button>
              )}
            </div>

            {locationRequestMessage && (
              <div className={`location-status ${locationRequestStatus}`}>
                {locationRequestMessage}
              </div>
            )}
            
            <div className="map-container">
              <MapSelector
                center={mapCenter}
                zoom={mapZoom}
                onMarkerSet={handleMapClick}
                customMarker={customMarker}
                userLocation={userLocation}
              />
            </div>

            {selectedDistrict && (
              <div className="map-district-note">
                <span className="badge-icon"><FiMapPin aria-hidden="true" /></span>
                <span>{selectedDistrict.name} - {selectedDistrict.city_name}</span>
              </div>
            )}

            {customMarker && (
              <div className="marker-info">
                <span className="marker-check">✓</span>
                <span>Position marquée</span>
              </div>
            )}

            <div className={`step-actions map-actions ${isInlineQuantityVariant ? 'with-location-fallback' : ''} ${customMarker ? 'has-selected-marker' : ''}`}>
              {customMarker && (
                <div className="map-selected-note">
                  <span className="marker-check">✓</span>
                  <span>{mapSelectedNoteText}</span>
                </div>
              )}
              <button type="button" className="prev-btn" onClick={() => navigate(-1)}>
                Précédent
              </button>
              <button
                type="button"
                className={`next-btn ${customMarker ? 'enabled' : 'disabled'}`}
                onClick={handleConfirmMarker}
                disabled={!customMarker}
              >
                Suivant
              </button>
              {isInlineQuantityVariant && !customMarker && (
                <button
                  type="button"
                  className="location-fallback-btn"
                  onClick={handleUseDistrictCenterFallback}
                >
                  <span className="location-fallback-copy">
                    <span className="location-fallback-title">Je n’arrive pas à choisir sur la carte</span>
                    <span className="location-fallback-subtitle">Utiliser l’adresse et un repère</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 步骤3: 填写信息 */}
        {currentStep === 3 && (
          <div className="section info-section">
            <h2 className="section-title">Informations de livraison</h2>
            
            <div className="form-group">
              <label htmlFor="fullName" className="form-label">Nom complet *</label>
              <input
                id="fullName"
                type="text"
                ref={(node) => { fieldRefs.current.fullName = node }}
                className={`form-input ${errors.fullName ? 'error' : ''}`}
                value={userInfo.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                placeholder="Entrez votre nom complet"
              />
              {errors.fullName && <div className="error-message">{errors.fullName}</div>}
            </div>

            <div className="form-group">
              <label htmlFor="phone" className="form-label">Téléphone *</label>
              <div className={`phone-input-group ${errors.phone ? 'error' : ''}`}>
                <div className="country-code-prefix">+225</div>
                <input
                  id="phone"
                  type="tel"
                  ref={(node) => { fieldRefs.current.phone = node }}
                  className="form-input phone-input"
                  value={userInfo.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="XXXXXXXX"
                />
              </div>
              {errors.phone && <div className="error-message">{errors.phone}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">WhatsApp *</label>
              <label className="same-whatsapp-option">
                <input
                  type="checkbox"
                  checked={whatsappSameAsPhone}
                  onChange={(e) => handleWhatsappSameAsPhoneChange(e.target.checked)}
                />
                <span>WhatsApp identique au téléphone</span>
              </label>
              {!whatsappSameAsPhone && (
                <div className={`phone-input-group whatsapp-manual-input ${errors.whatsapp ? 'error' : ''}`}>
                  <div className="country-code-prefix">+225</div>
                  <input
                    id="whatsapp"
                    type="tel"
                    ref={(node) => { fieldRefs.current.whatsapp = node }}
                    className="form-input phone-input"
                    value={userInfo.whatsapp}
                    onChange={(e) => handleInputChange('whatsapp', e.target.value)}
                    placeholder="XXXXXXXX"
                  />
                </div>
              )}
              {errors.whatsapp && <div className="error-message">{errors.whatsapp}</div>}
            </div>

            <div className="form-group">
              <label htmlFor="addressDescription" className="form-label">
                {isInlineQuantityVariant ? 'Adresse détaillée et repère *' : 'Description de l\'adresse *'}
              </label>
              <textarea
                id="addressDescription"
                ref={(node) => { fieldRefs.current.addressDescription = node }}
                className={`form-textarea ${errors.addressDescription ? 'error' : ''}`}
                value={userInfo.addressDescription}
                onChange={(e) => handleInputChange('addressDescription', e.target.value)}
                placeholder={isCodTrustVariant
                  ? 'Ex: quartier, pharmacie proche, portail bleu, immeuble, boutique à côté'
                  : isInlineQuantityVariant
                  ? 'Ex: rue, quartier, portail bleu, près de la pharmacie'
                  : 'Ex: Près de l\'université, à côté du bâtiment rouge'}
                rows={4}
              />
              {isCodTrustVariant && (
                <div className="address-assurance-note">
                  Ajoutez un repère clair. Si le livreur ne trouve pas, nous vous contactons par téléphone ou WhatsApp.
                </div>
              )}
              <div className="char-count">{userInfo.addressDescription.length}/200</div>
              {errors.addressDescription && <div className="error-message">{errors.addressDescription}</div>}
            </div>

            {/* 订单摘要 */}
            <div className="order-summary">
              <h3>Récapitulatif</h3>
              <div className="order-item">
                <img src={product.image_url?.[0]} alt={product.name_fr} className="order-item-image" />
                <div className="order-item-details">
                  <div className="order-item-name">{product.name_fr}</div>
                  <div className="order-item-price">{product.price} FCFA × {quantity}</div>
                </div>
                <div className="order-item-total">{totalPrice} FCFA</div>
              </div>
              
              <div className="order-totals">
                <div className="total-row">
                  <span>Sous-total</span>
                  <span>{totalPrice} FCFA</span>
                </div>
                <div className="total-row shipping">
                  <span>Livraison</span>
                  <span className="free-shipping">Gratuite</span>
                </div>
                <div className="total-row final-total">
                  <span>Total</span>
                  <span>{totalPrice} FCFA</span>
                </div>
              </div>

              <div className="payment-method">
                <span className="payment-icon" aria-hidden="true"><FiCreditCard /></span>
                <span>{isCodTrustVariant ? 'Aucun paiement maintenant. Cash ou Wave à la livraison.' : 'Paiement à la livraison'}</span>
              </div>
            </div>

            <div className="step-actions">
              <button type="button" className="prev-btn" onClick={() => navigate(-1)}>
                Précédent
              </button>
              <button
                type="button"
                className={`place-order-btn ${!isPlacingOrder ? 'enabled' : 'loading'}`}
                onClick={handlePlaceOrder}
                disabled={isPlacingOrder}
              >
                {isPlacingOrder ? (
                  <>
                    <span className="btn-spinner"></span>
                    <span>Commande en cours...</span>
                  </>
                ) : (
                  'Passer la commande'
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 引导动画Modal */}
      <MapGuideModal visible={showGuideModal} onClose={() => setShowGuideModal(false)} />
    </div>
  )
}

export default PaymentPage
