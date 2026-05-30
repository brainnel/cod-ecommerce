import { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FiCreditCard, FiMapPin, FiSearch, FiX } from 'react-icons/fi'
import { districtAPI, orderAPI, bundleAPI } from '../services/api'
import { useAdId } from '../hooks/useAdTrackingHooks.js'
import { trackPurchaseEvent, getClientInfo } from '../services/facebookConversions'
import {
  buildCheckoutProductProperties,
  getCheckoutQuantityExperiment,
  getCheckoutSessionId,
  isAddressFirstCheckoutVariant,
  isCodTrustCheckoutVariant,
  isInlineCheckoutVariant,
  isInlineMapSearchCheckoutVariant,
  isSinglePageCheckoutVariant,
  isSinglePageReviewCheckoutVariant,
  resumeCheckoutSession,
  startCheckoutSession,
  trackCheckoutEvent,
  updateCheckoutContext
} from '../services/checkoutFunnelAnalytics'
import { DISTRICT_CENTERS, DEFAULT_CENTER, DEFAULT_ZOOM } from '../constants/districtCenters'
import {
  getLocalPreviewBrowserContext as getPreviewBrowserContext,
  syncLocalPreviewBrowserContextFromSearch
} from '../utils/checkoutBrowserContextPreview'
import {
  loadCheckoutCustomerInfo,
  saveCheckoutCustomerInfo
} from '../utils/checkoutCustomerInfoCache'
import {
  isValidCheckoutPhone,
  normalizeCheckoutPhone,
  validateCheckoutPhone
} from '../utils/checkoutPhone'
import {
  buildCheckoutDistrictCacheEntry,
  getCachedManualMarkerForDistrict,
  isSameCheckoutDistrict,
  loadCheckoutLocationMemory,
  saveCheckoutLocationMemory
} from '../utils/checkoutLocationCache'
import {
  clearCheckoutPaymentState,
  loadCheckoutPaymentState,
  saveCheckoutPaymentState
} from '../utils/checkoutPaymentStateCache'
import './PaymentPage.css'

const CHECKOUT_MIN_STEP = 1
const CHECKOUT_MAX_STEP = 3
const MapSelector = lazy(() => import('../components/MapSelector'))
const LOCATION_SEARCH_SCOPE_TEXT = 'Abidjan, Côte d’Ivoire'
const LOCATION_SEARCH_GENERIC_LABELS = new Set([
  'abidjan',
  'cote divoire',
  'cote d ivoire',
  'cote d ivoire abidjan'
])

const getDistrictDisplayName = (district) => (
  district?.display_name || district?.name || ''
)

const normalizeLocationSearchText = (value) => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
)

const isGenericLocationPrediction = (result) => {
  const primaryText = normalizeLocationSearchText(result.primaryText || result.label)
  const label = normalizeLocationSearchText(result.label)
  return LOCATION_SEARCH_GENERIC_LABELS.has(primaryText) || LOCATION_SEARCH_GENERIC_LABELS.has(label)
}

const buildDistrictMemoryEntry = (district) => (
  buildCheckoutDistrictCacheEntry({
    ...district,
    districtId: district?.id,
    districtName: district?.name,
    displayName: getDistrictDisplayName(district),
    cityId: district?.city_id,
    cityName: district?.city_name
  })
)

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
  const paymentRouteState = useMemo(() => {
    const routeState = location.state || {}
    if (routeState.product || routeState.bundle) return routeState
    return loadCheckoutPaymentState() || {}
  }, [location.state])
  const {
    product: productFromState,
    bundle: bundleFromState,
    quantity: routeQuantity,
    productType: productTypeFromState,
    checkoutSessionId: routeCheckoutSessionId,
    checkoutQuantityExperiment: routeCheckoutQuantityExperiment,
    quantityConfirmed: routeQuantityConfirmed
  } = paymentRouteState

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
  const singlePageCachedDistrictAppliedRef = useRef(false)
  const initialMarkerSelectionSource = paymentRouteState.markerSelectionSource || 'none'
  const markerSelectionSourceRef = useRef(initialMarkerSelectionSource)
  const cachedFieldCompletionTrackedRef = useRef(false)
  const browserContext = useMemo(() => getBrowserContext(), [])
  const cachedCustomerInfo = useMemo(() => loadCheckoutCustomerInfo(), [])
  const [cachedLocationMemory, setCachedLocationMemory] = useState(() => loadCheckoutLocationMemory())
  const initialLastDistrictRef = useRef(cachedLocationMemory?.lastDistrict || null)
  const isInlineQuantityVariant = isInlineCheckoutVariant(checkoutQuantityExperiment)
  const isCodTrustVariant = isCodTrustCheckoutVariant(checkoutQuantityExperiment)
  const isAddressFirstVariant = isAddressFirstCheckoutVariant(checkoutQuantityExperiment)
  const isMapSearchVariant = isInlineMapSearchCheckoutVariant(checkoutQuantityExperiment)
  const isSinglePageVariant = isSinglePageCheckoutVariant(checkoutQuantityExperiment)
  const isSinglePageReviewVariant = isSinglePageReviewCheckoutVariant(checkoutQuantityExperiment)
  const hasMapSearchFeature = isMapSearchVariant || isSinglePageVariant || isAddressFirstVariant
  const hasInitialSinglePageCachedDistrict = isSinglePageVariant && Boolean(initialLastDistrictRef.current)

  // 三步流程：1=选大区, 2=地图标记, 3=填写信息
  const [currentStep, setCurrentStep] = useState(() => getCheckoutStepFromSearch(location.search))
  const [loading, setLoading] = useState(false)
  const [quantity, setQuantity] = useState(() => clampQuantity(routeQuantity || 1, product))

  // 步顢1：大区选择
  const [districts, setDistricts] = useState([])
  const [selectedDistrict, setSelectedDistrict] = useState(() => paymentRouteState.selectedDistrict || null)
  const [showSinglePageDistrictPicker, setShowSinglePageDistrictPicker] = useState(() => {
    if (paymentRouteState.selectedDistrict) return false
    if (hasInitialSinglePageCachedDistrict) return false
    return true
  })

  // 步顢2：地图标记
  const [mapCenter, setMapCenter] = useState(() => paymentRouteState.mapCenter || paymentRouteState.customMarker || DEFAULT_CENTER)
  const [mapZoom, setMapZoom] = useState(() => paymentRouteState.mapZoom || (paymentRouteState.customMarker ? 15 : DEFAULT_ZOOM))
  const [customMarker, setCustomMarker] = useState(() => paymentRouteState.customMarker || null)
  const [markerSelectionSource, setMarkerSelectionSourceState] = useState(initialMarkerSelectionSource)
  const [locationSearchQuery, setLocationSearchQuery] = useState(() => (
    paymentRouteState.locationSearchQuery || paymentRouteState.customMarker?.label || ''
  ))
  const [locationSearchResults, setLocationSearchResults] = useState([])
  const [locationSearchStatus, setLocationSearchStatus] = useState(() => (
    paymentRouteState.locationSearchQuery || paymentRouteState.customMarker?.label ? 'selected' : 'idle'
  ))
  const [locationSearchMessage, setLocationSearchMessage] = useState(() => (
    paymentRouteState.locationSearchQuery || paymentRouteState.customMarker?.label
      ? 'Position choisie. Vous pouvez ajuster sur la carte.'
      : ''
  ))
  const locationSearchDebounceRef = useRef(null)
  const locationSearchRequestRef = useRef(0)
  const locationAutocompleteSessionRef = useRef(null)
  const locationSearchLabelRestoreSuppressedRef = useRef(false)

  // 步骤3：用户信息
  const [userInfo, setUserInfo] = useState(() => ({
    fullName: cachedCustomerInfo?.fullName || '',
    phone: cachedCustomerInfo?.phone || '',
    whatsapp: cachedCustomerInfo?.whatsapp || cachedCustomerInfo?.phone || '',
    addressDescription: cachedCustomerInfo?.addressDescription || ''
  }))
  const [whatsappSameAsPhone] = useState(true)
  const [errors, setErrors] = useState({})
  const orderSubmitLockRef = useRef(false)
  const touchSubmitHandledRef = useRef(false)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [clientInfo, setClientInfo] = useState({})
  const singlePageCachedDistrictPending = (
    isSinglePageVariant
    && !showSinglePageDistrictPicker
    && !selectedDistrict
    && Boolean(initialLastDistrictRef.current)
  )
  const singlePageInfoVisible = (
    isSinglePageVariant
    && (selectedDistrict || singlePageCachedDistrictPending)
    && currentStep !== 2
    && !showSinglePageDistrictPicker
  )
  const isSinglePageOptionalMapStep = isSinglePageVariant && currentStep === 2
  const showDistrictSection = currentStep === 1 || (isSinglePageVariant && currentStep !== 2)
  const showInfoSection = currentStep === 3 || singlePageInfoVisible
  const hasManualMarkerSelection = Boolean(
    customMarker && (markerSelectionSource === 'manual' || markerSelectionSource === 'manual_cached')
  )
  const selectedMarkerText = hasManualMarkerSelection
    ? customMarker.label || (
      Number.isFinite(Number(customMarker.lat)) && Number.isFinite(Number(customMarker.lng))
        ? `${Number(customMarker.lat).toFixed(5)}, ${Number(customMarker.lng).toFixed(5)}`
        : ''
    )
    : ''
  const initialCachedDistrictLabel = initialLastDistrictRef.current
    ? `${initialLastDistrictRef.current.displayName}${initialLastDistrictRef.current.cityName ? ` - ${initialLastDistrictRef.current.cityName}` : ''}`
    : ''

  const mapSelectedNoteText = markerSelectionSource === 'district_center_fallback'
    ? 'Adresse prise en compte. Appuyez sur Suivant.'
    : markerSelectionSource === 'manual_cached'
      ? 'Position choisie la dernière fois. Vous pouvez la modifier.'
      : 'Position marquée. Appuyez sur Suivant.'

  const getLocationMethodForMarkerSource = (source) => {
    if (source === 'manual') return 'manual_map'
    if (source === 'manual_cached') return 'manual_map_cached'
    if (source === 'district_center_fallback') return 'district_center_fallback'
    if (source === 'district_center_auto_skip') return 'district_center_auto_skip'
    return source || null
  }

  const setMarkerSelectionSource = (source) => {
    markerSelectionSourceRef.current = source
    setMarkerSelectionSourceState(source)
  }

  const rememberCheckoutLocation = (locationMemory) => {
    const saved = saveCheckoutLocationMemory(locationMemory)
    if (saved) {
      setCachedLocationMemory(loadCheckoutLocationMemory())
    }
    return saved
  }

  const persistManualMarkerSelection = (marker, options = {}) => {
    if (!marker) return

    const district = options.district || selectedDistrict
    const districtMemoryEntry = buildDistrictMemoryEntry(district)
    const markerSource = options.markerSelectionSource || 'manual'
    const nextMapCenter = options.mapCenter || marker
    const nextMapZoom = options.mapZoom || mapZoom
    const markerLabel = options.markerLabel || marker.label || ''
    const markerPlaceId = options.placeId || marker.placeId || ''

    if (districtMemoryEntry) {
      rememberCheckoutLocation({
        lastDistrict: districtMemoryEntry,
        manualMarker: {
          ...marker,
          source: 'manual',
          label: markerLabel,
          placeId: markerPlaceId,
          district: districtMemoryEntry
        }
      })
    }

    saveCheckoutPaymentState(getPaymentNavigationState({
      selectedDistrict: district,
      customMarker: {
        ...marker,
        label: markerLabel,
        placeId: markerPlaceId
      },
      markerSelectionSource: markerSource,
      mapCenter: nextMapCenter,
      mapZoom: nextMapZoom,
      locationSearchQuery: markerLabel,
      locationSearchStatus: markerLabel ? 'selected' : 'idle'
    }))
  }

  const getCachedManualMarker = (district) => (
    getCachedManualMarkerForDistrict(buildDistrictMemoryEntry(district), cachedLocationMemory)
  )

  const getCustomMarkerForPaymentState = (overrides = {}) => {
    const resolvedMarker = 'customMarker' in overrides ? overrides.customMarker : customMarker
    if (!resolvedMarker) return resolvedMarker

    const resolvedMarkerSource = overrides.markerSelectionSource || markerSelectionSource
    const isManualMarker = resolvedMarkerSource === 'manual' || resolvedMarkerSource === 'manual_cached'
    if (!isManualMarker) return resolvedMarker

    const resolvedDistrict = 'selectedDistrict' in overrides ? overrides.selectedDistrict : selectedDistrict
    const resolvedSearchStatus = overrides.locationSearchStatus || locationSearchStatus
    const resolvedSearchQuery = (
      'locationSearchQuery' in overrides
        ? overrides.locationSearchQuery
        : locationSearchQuery
    )
    const cachedManualMarker = getCachedManualMarker(resolvedDistrict)
    const cachedLabel = cachedManualMarker?.label || ''
    const selectedSearchLabel = resolvedSearchStatus === 'selected' ? resolvedSearchQuery : ''
    const markerLabel = resolvedMarker.label || cachedLabel || selectedSearchLabel
    const markerPlaceId = resolvedMarker.placeId || cachedManualMarker?.placeId || ''

    if (!markerLabel && !markerPlaceId) return resolvedMarker

    return {
      ...resolvedMarker,
      label: markerLabel,
      placeId: markerPlaceId
    }
  }

  const districtsForDisplay = useMemo(() => {
    const lastDistrict = cachedLocationMemory?.lastDistrict
    if (!lastDistrict || districts.length === 0) return districts

    const lastIndex = districts.findIndex((district) => (
      isSameCheckoutDistrict(buildDistrictMemoryEntry(district), lastDistrict)
    ))
    if (lastIndex <= 0) return districts

    const lastDistrictItem = districts[lastIndex]
    return [
      lastDistrictItem,
      ...districts.filter((_, index) => index !== lastIndex)
    ]
  }, [cachedLocationMemory, districts])

  const isLastSelectedDistrict = (district) => (
    isSameCheckoutDistrict(buildDistrictMemoryEntry(district), cachedLocationMemory?.lastDistrict)
  )

  const wasLastSelectedDistrictOnEntry = (district) => (
    isSameCheckoutDistrict(buildDistrictMemoryEntry(district), initialLastDistrictRef.current)
  )

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
      is_meta_in_app_browser: browserContext.is_meta_in_app_browser,
      location_entry_mode: 'map_only',
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

  useEffect(() => {
    saveCheckoutCustomerInfo({
      ...userInfo,
      whatsappSameAsPhone
    })
  }, [userInfo, whatsappSameAsPhone])

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

  const getPaymentNavigationState = (overrides = {}) => {
    const nextState = {
      ...paymentRouteState,
      product: productFromState,
      bundle: bundleFromState,
      quantity,
      productType: productTypeFromState,
      checkoutSessionId: checkoutSessionIdRef.current || routeCheckoutSessionId || getCheckoutSessionId(),
      checkoutQuantityExperiment,
      quantityConfirmed: inlineQuantityConfirmedRef.current,
      selectedDistrict,
      markerSelectionSource,
      mapCenter,
      mapZoom,
      locationSearchQuery,
      locationSearchStatus,
      ...overrides
    }

    return {
      ...nextState,
      customMarker: getCustomMarkerForPaymentState(overrides)
    }
  }

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
        state: getPaymentNavigationState(options.stateOverrides)
      }
    )
  }

  const getProductReviewPath = () => {
    if (isBundleFlow && bundle?.id) return `/bundle/${bundle.id}`
    const productId = productFromState?.product_id || product?.product_id
    return productId ? `/product/${productId}` : '/'
  }

  const handleReviewProductClick = () => {
    trackPaymentEvent('checkout_review_product_click', {
      checkout_single_page_review: true
    })

    if (location.key && location.key !== 'default') {
      navigate(-1)
      return
    }

    navigate(getProductReviewPath())
  }

  const replaceCheckoutHistoryWithHome = () => {
    if (typeof window === 'undefined') return

    try {
      window.history.replaceState(window.history.state, '', '/')
    } catch (error) {
      console.warn('替换 checkout 历史记录失败:', error)
    }
  }

  useEffect(() => {
    if (!product || !quantity) return
    saveCheckoutPaymentState(getPaymentNavigationState())
  }, [
    paymentRouteState,
    product,
    productFromState,
    bundleFromState,
    quantity,
    productTypeFromState,
    routeCheckoutSessionId,
    routeQuantityConfirmed,
    checkoutQuantityExperiment,
    selectedDistrict,
    customMarker,
    markerSelectionSource,
    mapCenter,
    mapZoom,
    locationSearchQuery,
    locationSearchStatus
  ])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [])

  useEffect(() => {
    syncLocalPreviewBrowserContextFromSearch(location.search)
  }, [location.search])

  useEffect(() => {
    const root = document.documentElement
    const visualViewport = window.visualViewport

    if (!visualViewport) {
      root.style.setProperty('--checkout-keyboard-offset', '0px')
      return undefined
    }

    const isEditableFocused = () => {
      const activeTag = document.activeElement?.tagName
      return activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT'
    }

    const updateKeyboardOffset = () => {
      if (!isEditableFocused()) {
        root.style.setProperty('--checkout-keyboard-offset', '0px')
        return
      }

      const keyboardOffset = Math.max(
        0,
        window.innerHeight - visualViewport.height - visualViewport.offsetTop
      )
      root.style.setProperty('--checkout-keyboard-offset', `${Math.round(keyboardOffset)}px`)
    }

    const resetKeyboardOffset = () => {
      window.setTimeout(updateKeyboardOffset, 80)
    }

    visualViewport.addEventListener('resize', updateKeyboardOffset)
    visualViewport.addEventListener('scroll', updateKeyboardOffset)
    window.addEventListener('focusin', updateKeyboardOffset)
    window.addEventListener('focusout', resetKeyboardOffset)
    updateKeyboardOffset()

    return () => {
      visualViewport.removeEventListener('resize', updateKeyboardOffset)
      visualViewport.removeEventListener('scroll', updateKeyboardOffset)
      window.removeEventListener('focusin', updateKeyboardOffset)
      window.removeEventListener('focusout', resetKeyboardOffset)
      root.style.removeProperty('--checkout-keyboard-offset')
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
    const maxAllowedStep = selectedDistrict ? (customMarker ? 3 : 2) : (singlePageCachedDistrictPending ? 3 : 1)
    const nextStep = Math.min(requestedStep, maxAllowedStep)
    const canonicalSearch = buildCheckoutStepSearch(nextStep, location.search)

    if (!hasStepInUrl || nextStep !== requestedStep || location.search !== canonicalSearch) {
      navigateToCheckoutStep(nextStep, { replace: true })
      return
    }

    if (currentStep !== nextStep) {
      setCurrentStep(nextStep)
    }
  }, [location.search, product, quantity, selectedDistrict, customMarker, currentStep, singlePageCachedDistrictPending])

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

  useEffect(() => {
    if (
      !isSinglePageVariant
      || singlePageCachedDistrictAppliedRef.current
      || selectedDistrict
      || currentStep === 2
      || !product
      || !quantity
      || districts.length === 0
      || !initialLastDistrictRef.current
    ) return

    const cachedDistrict = districts.find((district) => (
      isSameCheckoutDistrict(buildDistrictMemoryEntry(district), initialLastDistrictRef.current)
    ))
    if (!cachedDistrict) {
      singlePageCachedDistrictAppliedRef.current = true
      setShowSinglePageDistrictPicker(true)
      return
    }

    singlePageCachedDistrictAppliedRef.current = true

    const districtCenter = {
      lat: parseFloat(cachedDistrict.latitude),
      lng: parseFloat(cachedDistrict.longitude)
    }
    const cachedManualMarker = getCachedManualMarker(cachedDistrict)
    const autoMarker = cachedManualMarker || districtCenter
    const autoMarkerSource = cachedManualMarker ? 'manual_cached' : 'district_center_auto_skip'
    const autoMapZoom = cachedManualMarker ? 15 : 14
    const districtProps = {
      ...getDistrictAnalyticsProps(cachedDistrict),
      checkout_single_page: true,
      district_from_cache: true
    }
    const locationProps = {
      ...districtProps,
      location_method: cachedManualMarker ? 'manual_map_cached' : 'district_center_auto_skip',
      location_cache_used: cachedManualMarker ? true : undefined,
      location_auto_skip_map: true,
      location_fallback_requires_address_detail: cachedManualMarker ? undefined : true
    }

    setSelectedDistrict(cachedDistrict)
    setMapCenter(autoMarker)
    setMapZoom(autoMapZoom)
    setCustomMarker(autoMarker)
    setMarkerSelectionSource(autoMarkerSource)
    setShowSinglePageDistrictPicker(false)

    updateCheckoutContext(product, {
      quantity,
      total_price: product.price * quantity,
      ad_id: adId,
      ...checkoutQuantityExperiment,
      ...districtProps
    })
    trackPaymentEvent('district_selected', districtProps)
    trackPaymentEvent('location_selected', locationProps)
    trackPaymentEvent('location_confirmed', locationProps)
    saveCheckoutPaymentState(getPaymentNavigationState({
      selectedDistrict: cachedDistrict,
      customMarker: autoMarker,
      markerSelectionSource: autoMarkerSource,
      mapCenter: autoMarker,
      mapZoom: autoMapZoom,
      locationSearchQuery: cachedManualMarker?.label || '',
      locationSearchStatus: cachedManualMarker?.label ? 'selected' : 'idle'
    }))
  }, [
    isSinglePageVariant,
    selectedDistrict,
    currentStep,
    product,
    quantity,
    districts,
    adId,
    checkoutQuantityExperiment
  ])

  // 选择大区
  const handleSelectDistrict = (district) => {
    const districtMemoryEntry = buildDistrictMemoryEntry(district)
    if (districtMemoryEntry) {
      rememberCheckoutLocation({ lastDistrict: districtMemoryEntry })
    }

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

    if (isSinglePageVariant) {
      const cachedManualMarker = getCachedManualMarker(district)
      const autoMarker = cachedManualMarker || districtCenter
      const autoMarkerSource = cachedManualMarker ? 'manual_cached' : 'district_center_auto_skip'
      const autoMapZoom = cachedManualMarker ? 15 : 14

      setCustomMarker(autoMarker)
      setMarkerSelectionSource(autoMarkerSource)
      setMapCenter(autoMarker)
      setMapZoom(autoMapZoom)
      setShowSinglePageDistrictPicker(false)
      const singlePageProps = {
        ...getDistrictAnalyticsProps(district),
        location_method: cachedManualMarker ? 'manual_map_cached' : 'district_center_auto_skip',
        location_cache_used: cachedManualMarker ? true : undefined,
        location_auto_skip_map: true,
        location_fallback_requires_address_detail: cachedManualMarker ? undefined : true,
        checkout_single_page: true
      }
      trackPaymentEvent('location_selected', singlePageProps)
      trackPaymentEvent('location_confirmed', singlePageProps)
      saveCheckoutPaymentState(getPaymentNavigationState({
        selectedDistrict: district,
        customMarker: autoMarker,
        markerSelectionSource: autoMarkerSource,
        mapCenter: autoMarker,
        mapZoom: autoMapZoom,
        locationSearchQuery: cachedManualMarker?.label || '',
        locationSearchStatus: cachedManualMarker?.label ? 'selected' : 'idle'
      }))
      return
    }

    if (isAddressFirstVariant) {
      setCustomMarker(districtCenter)
      setMarkerSelectionSource('district_center_auto_skip')
      const autoSkipProps = {
        ...getDistrictAnalyticsProps(district),
        location_method: 'district_center_auto_skip',
        location_auto_skip_map: true,
        location_fallback_requires_address_detail: true
      }
      trackPaymentEvent('location_selected', autoSkipProps)
      trackPaymentEvent('location_confirmed', autoSkipProps)
      navigateToCheckoutStep(3, {
        stateOverrides: {
          selectedDistrict: district,
          customMarker: districtCenter,
          markerSelectionSource: 'district_center_auto_skip',
          mapCenter: districtCenter,
          mapZoom: 14
        }
      })
      return
    }

    const cachedManualMarker = getCachedManualMarker(district)
    if (cachedManualMarker) {
      setCustomMarker(cachedManualMarker)
      setMarkerSelectionSource('manual_cached')
      setMapCenter(cachedManualMarker)
      setMapZoom(15)
      trackPaymentEvent('location_selected', {
        ...getDistrictAnalyticsProps(district),
        location_method: 'manual_map_cached',
        location_cache_used: true
      })
    } else {
      setCustomMarker(null)
      setMarkerSelectionSource('none')
    }
    navigateToCheckoutStep(2, {
      stateOverrides: {
        selectedDistrict: district,
        customMarker: cachedManualMarker || null,
        markerSelectionSource: cachedManualMarker ? 'manual_cached' : 'none',
        mapCenter: cachedManualMarker || districtCenter,
        mapZoom: cachedManualMarker ? 15 : 14
      }
    })
  }

  // 地图标记
  const handleMapClick = (marker) => {
    setMarkerSelectionSource('manual')
    setCustomMarker(marker)
    setMapCenter(marker)
    persistManualMarkerSelection(marker, {
      markerSelectionSource: 'manual',
      mapCenter: marker
    })
    trackPaymentEvent('location_selected', {
      ...getDistrictAnalyticsProps(),
      location_method: 'manual_map'
    })
  }

  const getLocationSearchScopeText = () => LOCATION_SEARCH_SCOPE_TEXT

  const buildLocationSearchInput = (query) => query.trim()

  const buildLocationScopedQueryInput = (query) => `${query.trim()}, ${getLocationSearchScopeText()}`

  const getLocationAutocompleteSessionToken = () => {
    if (!window.google?.maps?.places?.AutocompleteSessionToken) return null
    if (!locationAutocompleteSessionRef.current) {
      locationAutocompleteSessionRef.current = new window.google.maps.places.AutocompleteSessionToken()
    }
    return locationAutocompleteSessionRef.current
  }

  const handleLocationSearchClear = () => {
    locationSearchLabelRestoreSuppressedRef.current = true
    setLocationSearchQuery('')
    setLocationSearchResults([])
    setLocationSearchStatus('idle')
    setLocationSearchMessage('')
    locationSearchRequestRef.current += 1
  }

  const handleLocationSearchInputChange = (event) => {
    locationSearchLabelRestoreSuppressedRef.current = true
    setLocationSearchQuery(event.target.value)
    if (locationSearchStatus === 'selected') {
      setLocationSearchResults([])
      setLocationSearchStatus('idle')
      setLocationSearchMessage('')
    }
  }

  const normalizeLocationPredictions = (predictions, source) => (
    (predictions || []).map((prediction) => {
      const formatting = prediction.structured_formatting || {}
      return {
        id: prediction.place_id || `${source}:${prediction.description}`,
        placeId: prediction.place_id || null,
        label: prediction.description,
        primaryText: formatting.main_text || prediction.description,
        secondaryText: formatting.secondary_text || '',
        source
      }
    }).filter((result) => result.label && !isGenericLocationPrediction(result))
  )

  const mergeLocationSearchResults = (resultGroups) => {
    const seen = new Set()
    return resultGroups.flat().filter((result) => {
      const key = result.placeId || normalizeLocationSearchText(result.label)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 5)
  }

  const getPlacePredictions = (autocompleteService, request) => (
    new Promise((resolve) => {
      autocompleteService.getPlacePredictions(request, (predictions, status) => {
        resolve({ predictions, status })
      })
    })
  )

  const getQueryPredictions = (autocompleteService, request) => (
    new Promise((resolve) => {
      autocompleteService.getQueryPredictions(request, (predictions, status) => {
        resolve({ predictions, status })
      })
    })
  )

  const getPlaceDetails = (placeId) => (
    new Promise((resolve) => {
      if (!placeId || !window.google?.maps?.places?.PlacesService) {
        resolve({ place: null, status: 'NO_PLACE_ID' })
        return
      }

      const detailsService = new window.google.maps.places.PlacesService(document.createElement('div'))
      detailsService.getDetails({
        placeId,
        fields: ['geometry', 'name', 'formatted_address', 'place_id']
      }, (place, status) => {
        resolve({ place, status })
      })
    })
  )

  const geocodeLocationSearchResult = (result) => (
    new Promise((resolve) => {
      const geocoder = new window.google.maps.Geocoder()
      const geocodeRequest = result.placeId
        ? { placeId: result.placeId, region: 'CI' }
        : { address: buildLocationScopedQueryInput(result.label), region: 'CI' }

      geocoder.geocode(geocodeRequest, (details, status) => {
        resolve({ details, status })
      })
    })
  )

  const fetchLocationSearchPredictions = async (query, trigger = 'type') => {
    if (query.length < 2) {
      setLocationSearchResults([])
      setLocationSearchStatus('error')
      setLocationSearchMessage('Entrez au moins 2 lettres.')
      return
    }

    if (typeof window === 'undefined' || !window.google?.maps?.places?.AutocompleteService) {
      setLocationSearchStatus('error')
      setLocationSearchMessage('La recherche sera disponible après le chargement de la carte.')
      if (trigger === 'submit') {
        trackPaymentEvent('location_search_failed', {
          ...getDistrictAnalyticsProps(),
          location_search_error: 'maps_not_loaded',
          location_search_query_length: query.length
        })
      }
      return
    }

    const requestId = locationSearchRequestRef.current + 1
    locationSearchRequestRef.current = requestId
    setLocationSearchStatus('searching')
    setLocationSearchMessage('')

    if (trigger === 'submit') {
      trackPaymentEvent('location_search_submit', {
        ...getDistrictAnalyticsProps(),
        location_search_query_length: query.length
      })
    }

    const locationBiasRequest = {
      input: buildLocationSearchInput(query),
      componentRestrictions: { country: 'ci' },
      sessionToken: getLocationAutocompleteSessionToken()
    }

    const districtCenter = getDistrictCenterMarker(selectedDistrict)
    if (Number.isFinite(districtCenter.lat) && Number.isFinite(districtCenter.lng) && window.google?.maps?.LatLng) {
      locationBiasRequest.location = new window.google.maps.LatLng(districtCenter.lat, districtCenter.lng)
      locationBiasRequest.radius = 25000
    }

    const autocompleteService = new window.google.maps.places.AutocompleteService()
    const placeResponse = await getPlacePredictions(autocompleteService, locationBiasRequest)
    if (requestId !== locationSearchRequestRef.current) return

    const placeResults = normalizeLocationPredictions(placeResponse.predictions, 'place')
    const shouldUseQueryFallback = placeResults.length < 3 || trigger === 'submit'
    let queryResults = []

    if (shouldUseQueryFallback) {
      const queryResponse = await getQueryPredictions(autocompleteService, {
        input: buildLocationScopedQueryInput(query)
      })
      if (requestId !== locationSearchRequestRef.current) return
      queryResults = normalizeLocationPredictions(queryResponse.predictions, 'query')
    }

    const nextResults = mergeLocationSearchResults([placeResults, queryResults])
    if (nextResults.length === 0) {
      setLocationSearchStatus('error')
      setLocationSearchMessage('Aucun résultat clair. Essayez un repère proche.')
      if (trigger === 'submit') {
        trackPaymentEvent('location_search_failed', {
          ...getDistrictAnalyticsProps(),
          location_search_error: placeResponse.status || 'no_result',
          location_search_query_length: query.length
        })
      }
      return
    }

    setLocationSearchResults(nextResults)
    setLocationSearchStatus('results')
    setLocationSearchMessage('')
    if (trigger === 'submit') {
      trackPaymentEvent('location_search_results', {
        ...getDistrictAnalyticsProps(),
        location_search_query_length: query.length,
        location_search_result_count: nextResults.length
      })
    }
  }

  const handleLocationSearchSubmit = (event) => {
    event.preventDefault()
    const query = locationSearchQuery.trim()
    fetchLocationSearchPredictions(query, 'submit')
  }

  const handleLocationSearchResultSelect = (result, index) => {
    if (typeof window === 'undefined' || !window.google?.maps?.Geocoder) {
      setLocationSearchStatus('error')
      setLocationSearchMessage('Impossible de placer ce résultat. Touchez la carte directement.')
      return
    }

    const requestId = locationSearchRequestRef.current + 1
    locationSearchRequestRef.current = requestId
    setLocationSearchStatus('searching')
    setLocationSearchMessage('')

    Promise.resolve()
      .then(async () => {
        const okStatus = window.google?.maps?.places?.PlacesServiceStatus?.OK || 'OK'
        const placeDetail = await getPlaceDetails(result.placeId)
        if (placeDetail.status === okStatus && placeDetail.place?.geometry?.location) {
          return {
            detail: placeDetail.place,
            status: placeDetail.status,
            label: placeDetail.place.name || result.primaryText || result.label,
            formattedAddress: placeDetail.place.formatted_address || result.secondaryText || ''
          }
        }

        const geocodeDetail = await geocodeLocationSearchResult(result)
        return {
          detail: Array.isArray(geocodeDetail.details) ? geocodeDetail.details[0] : null,
          status: geocodeDetail.status,
          label: result.primaryText || result.label,
          formattedAddress: result.secondaryText || ''
        }
      })
      .then(({ detail, status, label }) => {
        if (requestId !== locationSearchRequestRef.current) return

        const locationPoint = detail?.geometry?.location
      const marker = {
        lat: typeof locationPoint?.lat === 'function' ? locationPoint.lat() : null,
        lng: typeof locationPoint?.lng === 'function' ? locationPoint.lng() : null,
        label,
        placeId: result.placeId || detail?.place_id || ''
      }

      if (status !== 'OK' || !Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) {
        setLocationSearchStatus('error')
        setLocationSearchMessage('Impossible de placer ce résultat. Touchez la carte directement.')
        trackPaymentEvent('location_search_failed', {
          ...getDistrictAnalyticsProps(),
          location_search_error: status || 'place_detail_failed',
          location_search_query_length: locationSearchQuery.trim().length
        })
        return
      }

      setMarkerSelectionSource('manual')
      setCustomMarker(marker)
      setMapCenter(marker)
      setMapZoom(16)
      locationSearchLabelRestoreSuppressedRef.current = false
      setLocationSearchQuery(label)
      setLocationSearchResults([])
      setLocationSearchStatus('selected')
      setLocationSearchMessage('Position proposée. Vous pouvez ajuster sur la carte.')
      locationAutocompleteSessionRef.current = null
      persistManualMarkerSelection(marker, {
        markerSelectionSource: 'manual',
        mapCenter: marker,
        mapZoom: 16,
        markerLabel: label,
        placeId: marker.placeId
      })

      trackPaymentEvent('location_search_selected', {
        ...getDistrictAnalyticsProps(),
        location_search_result_index: index + 1,
        location_search_result_count: locationSearchResults.length
      })
      trackPaymentEvent('location_selected', {
        ...getDistrictAnalyticsProps(),
        location_method: 'manual_map',
        location_selection_source: 'search_result'
      })
      })
      .catch((error) => {
        console.warn('地图搜索结果落点失败:', error)
        setLocationSearchStatus('error')
        setLocationSearchMessage('Impossible de placer ce résultat. Touchez la carte directement.')
      })
  }

  useEffect(() => {
    if (!hasMapSearchFeature || currentStep !== 2) return undefined
    if (locationSearchStatus === 'selected') return undefined

    const query = locationSearchQuery.trim()
    if (query.length === 0) {
      setLocationSearchResults([])
      setLocationSearchStatus('idle')
      setLocationSearchMessage('')
      return undefined
    }

    if (query.length < 2) {
      setLocationSearchResults([])
      setLocationSearchStatus('idle')
      setLocationSearchMessage('')
      return undefined
    }

    if (locationSearchDebounceRef.current) {
      clearTimeout(locationSearchDebounceRef.current)
    }

    locationSearchDebounceRef.current = setTimeout(() => {
      fetchLocationSearchPredictions(query, 'type')
    }, 320)

    return () => {
      if (locationSearchDebounceRef.current) {
        clearTimeout(locationSearchDebounceRef.current)
        locationSearchDebounceRef.current = null
      }
    }
  }, [locationSearchQuery, hasMapSearchFeature, currentStep, selectedDistrict?.id])

  useEffect(() => {
    if (!hasMapSearchFeature) return
    if (locationSearchDebounceRef.current) {
      clearTimeout(locationSearchDebounceRef.current)
      locationSearchDebounceRef.current = null
    }
    locationSearchRequestRef.current += 1
    const restoredSearchQuery = customMarker?.label || (
      locationSearchStatus === 'selected' ? locationSearchQuery : ''
    )
    if (restoredSearchQuery) {
      setLocationSearchQuery(restoredSearchQuery)
      setLocationSearchResults([])
      setLocationSearchStatus('selected')
      setLocationSearchMessage(
        markerSelectionSourceRef.current === 'manual_cached'
          ? 'Position choisie la dernière fois. Vous pouvez la modifier.'
          : 'Position choisie. Vous pouvez ajuster sur la carte.'
      )
      return
    }
    setLocationSearchQuery('')
    setLocationSearchResults([])
    setLocationSearchStatus('idle')
    setLocationSearchMessage('')
  }, [hasMapSearchFeature, selectedDistrict?.id])

  useEffect(() => {
    if (currentStep !== 2 || !selectedDistrict) return
    const cachedManualMarker = getCachedManualMarker(selectedDistrict)
    if (
      customMarker &&
      (markerSelectionSourceRef.current === 'manual' || markerSelectionSourceRef.current === 'manual_cached')
    ) {
      const shouldRestoreCachedMarker = Boolean(cachedManualMarker?.label && !customMarker.label)
      const restoredMarker = shouldRestoreCachedMarker
        ? cachedManualMarker
        : customMarker
      const restoredLabel = restoredMarker.label || ''

      if (shouldRestoreCachedMarker) {
        setCustomMarker(restoredMarker)
        setMapCenter(restoredMarker)
      }

      const shouldRestoreSearchLabel = (
        restoredLabel &&
        locationSearchQuery !== restoredLabel &&
        !locationSearchLabelRestoreSuppressedRef.current
      )

      if (shouldRestoreSearchLabel) {
        setLocationSearchQuery(restoredLabel)
        setLocationSearchStatus('selected')
        setLocationSearchMessage(
          markerSelectionSourceRef.current === 'manual_cached'
            ? 'Position choisie la dernière fois. Vous pouvez la modifier.'
            : 'Position choisie. Vous pouvez ajuster sur la carte.'
        )
      }
      if (shouldRestoreCachedMarker || shouldRestoreSearchLabel) {
        saveCheckoutPaymentState(getPaymentNavigationState({
          customMarker: restoredMarker,
          mapCenter: shouldRestoreCachedMarker ? restoredMarker : mapCenter,
          locationSearchQuery: restoredLabel || locationSearchQuery,
          locationSearchStatus: restoredLabel ? 'selected' : locationSearchStatus
        }))
      }
      return
    }

    if (!cachedManualMarker) return

    setCustomMarker(cachedManualMarker)
    setMarkerSelectionSource('manual_cached')
    setMapCenter(cachedManualMarker)
    setMapZoom(15)
    if (cachedManualMarker.label) {
      setLocationSearchQuery(cachedManualMarker.label)
      setLocationSearchStatus('selected')
      setLocationSearchMessage('Position choisie la dernière fois. Vous pouvez la modifier.')
    }
    saveCheckoutPaymentState(getPaymentNavigationState({
      customMarker: cachedManualMarker,
      markerSelectionSource: 'manual_cached',
      mapCenter: cachedManualMarker,
      mapZoom: 15,
      locationSearchQuery: cachedManualMarker.label || locationSearchQuery,
      locationSearchStatus: cachedManualMarker.label || locationSearchQuery ? 'selected' : 'idle'
    }))
  }, [currentStep, selectedDistrict, customMarker, markerSelectionSource, cachedLocationMemory, locationSearchQuery])

  // 确认标记，进入步骤3
  const handleConfirmMarker = () => {
    if (!customMarker) {
      alert('Veuillez cliquer sur la carte pour choisir un emplacement')
      return
    }
    trackPaymentEvent('location_confirmed', {
      ...getDistrictAnalyticsProps(),
      location_method: getLocationMethodForMarkerSource(markerSelectionSourceRef.current),
      location_cache_used: markerSelectionSourceRef.current === 'manual_cached'
    })
    navigateToCheckoutStep(3, {
      stateOverrides: {
        customMarker,
        markerSelectionSource,
        mapCenter,
        mapZoom
      }
    })
  }

  const handleUseDistrictCenterFallback = () => {
    if (!selectedDistrict) return

    const hadManualMapSelection = markerSelectionSourceRef.current === 'manual' || Boolean(customMarker)
    const fallbackMarker = getDistrictCenterMarker(selectedDistrict)
    setMarkerSelectionSource('district_center_fallback')
    setCustomMarker(fallbackMarker)
    setMapCenter(fallbackMarker)

    const fallbackProps = {
      ...getDistrictAnalyticsProps(selectedDistrict),
      location_method: 'district_center_fallback',
      location_fallback_requires_address_detail: true,
      location_fallback_after_manual_map: hadManualMapSelection
    }
    trackPaymentEvent('location_fallback_used', fallbackProps)
    trackPaymentEvent('location_selected', fallbackProps)
    trackPaymentEvent('location_confirmed', fallbackProps)
    navigateToCheckoutStep(3, {
      stateOverrides: {
        customMarker: fallbackMarker,
        markerSelectionSource: 'district_center_fallback',
        mapCenter: fallbackMarker,
        mapZoom
      }
    })
  }

  const handleChoosePreciseMapLocation = () => {
    if (!selectedDistrict) return

    const previousLocationMethod = markerSelectionSourceRef.current
    const shouldKeepExistingMarker = (
      previousLocationMethod === 'manual' &&
      Boolean(customMarker)
    )
    let nextMarker = customMarker
    let nextMarkerSource = markerSelectionSource
    let nextMapCenter = mapCenter
    let nextMapZoom = mapZoom

    if (shouldKeepExistingMarker) {
      setMapCenter(customMarker)
      setMapZoom(15)
      nextMapCenter = customMarker
      nextMapZoom = 15
    } else {
      const cachedManualMarker = getCachedManualMarker(selectedDistrict)
      if (cachedManualMarker) {
        setCustomMarker(cachedManualMarker)
        setMarkerSelectionSource('manual_cached')
        setMapCenter(cachedManualMarker)
        setMapZoom(15)
        nextMarker = cachedManualMarker
        nextMarkerSource = 'manual_cached'
        nextMapCenter = cachedManualMarker
        nextMapZoom = 15
        trackPaymentEvent('location_selected', {
          ...getDistrictAnalyticsProps(selectedDistrict),
          location_method: 'manual_map_cached',
          location_cache_used: true,
          location_auto_skip_map_requested: true
        })
      } else {
        const districtCenter = getDistrictCenterMarker(selectedDistrict)
        setCustomMarker(null)
        setMarkerSelectionSource('none')
        setMapCenter(districtCenter)
        setMapZoom(14)
        nextMarker = null
        nextMarkerSource = 'none'
        nextMapCenter = districtCenter
        nextMapZoom = 14
      }
    }

    trackPaymentEvent('location_auto_skip_map_requested', {
      ...getDistrictAnalyticsProps(selectedDistrict),
      previous_location_method: previousLocationMethod || null,
      kept_existing_marker: shouldKeepExistingMarker
    })
    navigateToCheckoutStep(2, {
      stateOverrides: {
        customMarker: nextMarker,
        markerSelectionSource: nextMarkerSource,
        mapCenter: nextMapCenter,
        mapZoom: nextMapZoom
      }
    })
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
      nextValue = normalizeCheckoutPhone(value)
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
      ((field === 'phone' || field === 'whatsapp') && isValidCheckoutPhone(nextValue)) ||
      (field === 'addressDescription' && nextValue.trim().length >= 5)
    )

    if (isFieldComplete) {
      trackFieldCompletedOnce(field, {
        ...(field === 'whatsapp' ? { whatsapp_same_as_phone: false } : {})
      })
    }

    if (field === 'phone' && whatsappSameAsPhone && isValidCheckoutPhone(nextValue)) {
      trackFieldCompletedOnce('whatsapp', { whatsapp_same_as_phone: true })
    }
  }

  useEffect(() => {
    if (!showInfoSection || cachedFieldCompletionTrackedRef.current || !cachedCustomerInfo) return

    cachedFieldCompletionTrackedRef.current = true

    if (userInfo.fullName.trim().length > 0) {
      trackFieldCompletedOnce('fullName', { field_fill_method: 'local_cache' })
    }
    if (isValidCheckoutPhone(userInfo.phone)) {
      trackFieldCompletedOnce('phone', { field_fill_method: 'local_cache' })
    }
    if (whatsappSameAsPhone && isValidCheckoutPhone(userInfo.phone)) {
      trackFieldCompletedOnce('whatsapp', {
        field_fill_method: 'local_cache',
        whatsapp_same_as_phone: true
      })
    } else if (!whatsappSameAsPhone && isValidCheckoutPhone(userInfo.whatsapp)) {
      trackFieldCompletedOnce('whatsapp', {
        field_fill_method: 'local_cache',
        whatsapp_same_as_phone: false
      })
    }
    if (userInfo.addressDescription.trim().length >= 5) {
      trackFieldCompletedOnce('addressDescription', { field_fill_method: 'local_cache' })
    }
  }, [
    cachedCustomerInfo,
    showInfoSection,
    userInfo.addressDescription,
    userInfo.fullName,
    userInfo.phone,
    userInfo.whatsapp,
    whatsappSameAsPhone
  ])

  const scrollToFirstMissingField = (missingFields) => {
    if (!isInlineQuantityVariant || missingFields.length === 0) return

    const field = missingFields[0]
    const fieldNode = fieldRefs.current[field]
    if (!fieldNode) return

    const scrollFieldIntoComfortView = () => {
      const rect = fieldNode.getBoundingClientRect()
      const targetTop = field === 'addressDescription' ? 92 : 112
      const delta = rect.top - targetTop

      if (Math.abs(delta) > 8) {
        window.scrollBy({ top: delta, behavior: 'smooth' })
      }
    }

    window.requestAnimationFrame(() => {
      if (typeof fieldNode.focus === 'function') {
        fieldNode.focus({ preventScroll: true })
      }
      scrollFieldIntoComfortView()
      window.setTimeout(scrollFieldIntoComfortView, 320)
    })
  }

  // 验证表单
  const validateForm = () => {
    const newErrors = {}
    const effectiveWhatsapp = whatsappSameAsPhone ? userInfo.phone : userInfo.whatsapp
    const phoneValidation = validateCheckoutPhone(userInfo.phone, {
      requiredMessage: 'Le numéro de téléphone est requis'
    })
    const whatsappValidation = validateCheckoutPhone(effectiveWhatsapp, {
      requiredMessage: 'Le numéro WhatsApp est requis'
    })
    
    if (!userInfo.fullName.trim()) {
      newErrors.fullName = 'Le nom complet est requis'
    }
    
    if (!phoneValidation.isValid) {
      newErrors.phone = phoneValidation.error
    }
    
    if (!whatsappSameAsPhone && !whatsappValidation.isValid) {
      newErrors.whatsapp = whatsappValidation.error
    }
    
    if (!userInfo.addressDescription.trim()) {
      newErrors.addressDescription = isInlineQuantityVariant
        ? 'Ajoutez au moins 5 caractères : quartier ou repère connu.'
        : 'La description de l\'adresse est requise'
    } else if (userInfo.addressDescription.trim().length < 5) {
      newErrors.addressDescription = isInlineQuantityVariant
        ? 'Ajoutez au moins 5 caractères : quartier ou repère connu.'
        : 'Au moins 5 caractères requis'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  useEffect(() => {
    if (!showInfoSection || infoStepTrackedRef.current || (isSinglePageVariant && !selectedDistrict)) return

    infoStepTrackedRef.current = true
    trackPaymentEvent('info_step_view', {
      ...getDistrictAnalyticsProps(),
      checkout_single_page: isSinglePageVariant || undefined
    })
  }, [showInfoSection, isSinglePageVariant, selectedDistrict])

  // 提交订单
  const handlePlaceOrder = async () => {
    if (orderSubmitLockRef.current) return

    orderSubmitLockRef.current = true
    setIsPlacingOrder(true)

    const releaseOrderSubmitLock = () => {
      orderSubmitLockRef.current = false
      setIsPlacingOrder(false)
    }

    const effectiveWhatsapp = whatsappSameAsPhone ? userInfo.phone : userInfo.whatsapp
    const normalizedPhone = normalizeCheckoutPhone(userInfo.phone)
    const normalizedWhatsapp = normalizeCheckoutPhone(effectiveWhatsapp)
    const effectiveUserInfo = {
      ...userInfo,
      phone: normalizedPhone,
      whatsapp: normalizedWhatsapp
    }

    if (!validateForm()) {
      const missingFields = []
      if (!userInfo.fullName.trim()) missingFields.push('fullName')
      if (!isValidCheckoutPhone(userInfo.phone)) missingFields.push('phone')
      if (!whatsappSameAsPhone && !isValidCheckoutPhone(effectiveWhatsapp)) missingFields.push('whatsapp')
      if (userInfo.addressDescription.trim().length < 5) missingFields.push('addressDescription')
      trackPaymentEvent('submit_validation_failed', {
        ...getDistrictAnalyticsProps(),
        missing_fields: missingFields,
        whatsapp_same_as_phone: whatsappSameAsPhone
      })
      scrollToFirstMissingField(missingFields)
      releaseOrderSubmitLock()
      return
    }

    if (singlePageCachedDistrictPending || !selectedDistrict || !customMarker) {
      releaseOrderSubmitLock()
      return
    }

    saveCheckoutCustomerInfo({
      ...effectiveUserInfo,
      whatsappSameAsPhone
    })
    
    trackPaymentEvent('submit_order_click', {
      ...getDistrictAnalyticsProps(),
      whatsapp_same_as_phone: whatsappSameAsPhone
    })

    let shouldReleaseSubmitLock = true
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
          phone: `225${normalizedPhone}`,
          whatsapp: `225${normalizedWhatsapp}`,
          receiver_address: userInfo.addressDescription,
          latitude: deliveryMarker.lat,
          longitude: deliveryMarker.lng,
          payment_method: "cod",
          currency: "FCFA",
          is_web: 1,
          quantity,
          ad_id: adId
        }
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
          phone: `225${normalizedPhone}`,
          whatsapp: `225${normalizedWhatsapp}`,
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

        response = await orderAPI.createOrder(orderData)
      }

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
      clearCheckoutPaymentState()
      replaceCheckoutHistoryWithHome()
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
      shouldReleaseSubmitLock = false

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
      if (shouldReleaseSubmitLock) {
        releaseOrderSubmitLock()
      }
    }
  }

  const handlePlaceOrderPointerDown = (event) => {
    if (event.pointerType === 'mouse' || isPlacingOrder) return

    event.preventDefault()
    touchSubmitHandledRef.current = true
    window.setTimeout(() => {
      touchSubmitHandledRef.current = false
    }, 800)
    handlePlaceOrder()
  }

  const handlePlaceOrderClick = () => {
    if (touchSubmitHandledRef.current) {
      touchSubmitHandledRef.current = false
      return
    }

    handlePlaceOrder()
  }

  if (!product || !quantity) return null

  const totalPrice = product.price * quantity
  const fullNameReady = userInfo.fullName.trim().length > 0 && !errors.fullName
  const phoneReady = isValidCheckoutPhone(userInfo.phone) && !errors.phone
  const addressReady = userInfo.addressDescription.trim().length >= 5 && !errors.addressDescription

  return (
    <div className="payment-page">
      {/* 顶部标题栏 */}
      <div className="payment-header">
        <button type="button" className="back-btn" onClick={() => navigate(-1)}>←</button>
        <h1 className="payment-title">Finaliser la commande</h1>
      </div>

      <div className="payment-content">
        {/* 步骤指示器 */}
        {!isSinglePageVariant && (
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
        )}

        {/* 步顢1: 选择大区 */}
        {showDistrictSection && (
          <div className={`section district-section ${isSinglePageVariant ? 'single-page-district-section' : ''} ${(selectedDistrict || singlePageCachedDistrictPending) ? 'has-selected-district' : ''}`}>
            {!isSinglePageVariant && (
              <h2 className="section-title">Sélectionnez votre district</h2>
            )}
            {isInlineQuantityVariant && (
              <div className="inline-quantity-card">
                <img
                  src={product.image_url?.[0]}
                  alt={product.name_fr}
                  className="inline-quantity-image"
                  loading="lazy"
                  decoding="async"
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
            {isSinglePageVariant && selectedDistrict && !showSinglePageDistrictPicker ? (
              <div className="selected-district-summary">
                <div className="selected-district-icon"><FiMapPin aria-hidden="true" /></div>
                <div className="selected-district-copy">
                  <span className="selected-district-label">Zone de livraison</span>
                  <strong>{getDistrictDisplayName(selectedDistrict)} - {selectedDistrict.city_name}</strong>
                  {wasLastSelectedDistrictOnEntry(selectedDistrict) && (
                    <span className="selected-district-note">Choisi la dernière fois</span>
                  )}
                </div>
                <button
                  type="button"
                  className="selected-district-change"
                  onClick={() => setShowSinglePageDistrictPicker(true)}
                >
                  Changer
                </button>
              </div>
            ) : singlePageCachedDistrictPending ? (
              <div className="selected-district-summary selected-district-summary-loading">
                <div className="selected-district-icon"><FiMapPin aria-hidden="true" /></div>
                <div className="selected-district-copy">
                  <span className="selected-district-label">Zone de livraison</span>
                  <strong>{initialCachedDistrictLabel || 'Votre dernière zone'}</strong>
                  <span className="selected-district-note">Choisi la dernière fois</span>
                </div>
                <button
                  type="button"
                  className="selected-district-change"
                  disabled
                >
                  Changer
                </button>
              </div>
            ) : loading ? (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Chargement...</p>
              </div>
            ) : (
              <div className="district-list">
                {districtsForDisplay.map((district) => {
                  const isLastSelected = isLastSelectedDistrict(district)
                  return (
                  <div
                    key={district.id}
                    className={`district-card ${isLastSelected ? 'last-selected' : ''}`}
                    onClick={() => handleSelectDistrict(district)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleSelectDistrict(district)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="district-icon"><FiMapPin aria-hidden="true" /></div>
                    <div className="district-info">
                      <div className="district-name">{getDistrictDisplayName(district)}</div>
                      <div className="district-city">{district.city_name}</div>
                      {isLastSelected && (
                        <div className="district-last-note">Choisi la dernière fois</div>
                      )}
                    </div>
                    <div className="district-arrow">›</div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 步顢2: 地图标记 */}
        {currentStep === 2 && (
          <div className={`section map-section ${isSinglePageOptionalMapStep ? 'optional-map-section' : ''} ${isInlineQuantityVariant && !isSinglePageVariant ? 'with-location-fallback' : ''} ${customMarker ? 'has-selected-marker' : ''}`}>
            {/* 橙色提示条 */}
            <div className="location-hint map-only">
              <div className="hint-content">
                <span className="hint-text">
                  {isSinglePageOptionalMapStep
                    ? 'Optionnel : touchez la carte ou recherchez un repère pour préciser l’adresse.'
                    : 'Veuillez choisir votre adresse de livraison sur la carte.'}
                </span>
              </div>
            </div>
            
            <div className="map-container">
              {hasMapSearchFeature && (
                <div className="location-search-overlay" aria-label="Recherche de position">
                  <form className="location-search-form" onSubmit={handleLocationSearchSubmit}>
                    <FiSearch className="location-search-icon" aria-hidden="true" />
                    <input
                      type="search"
                      className="location-search-input"
                      value={locationSearchQuery}
                      onChange={handleLocationSearchInputChange}
                      placeholder="Rechercher une adresse ou un repère"
                      aria-label="Rechercher une adresse ou un repère"
                      enterKeyHint="search"
                    />
                    {locationSearchQuery && (
                      <button
                        type="button"
                        className="location-search-clear"
                        onClick={handleLocationSearchClear}
                        aria-label="Effacer la recherche"
                      >
                        <FiX aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="submit"
                      className="location-search-submit"
                      disabled={locationSearchStatus === 'searching'}
                    >
                      {locationSearchStatus === 'searching' ? '...' : 'OK'}
                    </button>
                  </form>
                  {(locationSearchResults.length > 0 || (locationSearchMessage && locationSearchStatus !== 'selected')) && (
                    <div className="location-search-results">
                      {locationSearchResults.map((result, index) => (
                        <button
                          type="button"
                          key={result.id}
                          className="location-search-result"
                          onClick={() => handleLocationSearchResultSelect(result, index)}
                        >
                          <span className="location-search-result-icon"><FiMapPin aria-hidden="true" /></span>
                          <span className="location-search-result-text">
                            <span className="location-search-result-primary">{result.primaryText}</span>
                            {result.secondaryText && (
                              <span className="location-search-result-secondary">{result.secondaryText}</span>
                            )}
                          </span>
                        </button>
                      ))}
                      {locationSearchMessage && locationSearchStatus !== 'selected' && (
                        <div className={`location-search-message ${locationSearchStatus}`}>
                          {locationSearchMessage}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <Suspense fallback={<div className="map-lazy-loading">Chargement de la carte...</div>}>
                <MapSelector
                  center={mapCenter}
                  zoom={mapZoom}
                  onMarkerSet={handleMapClick}
                  customMarker={customMarker}
                />
              </Suspense>
            </div>

            {selectedDistrict && (
              <div className="map-district-note">
                <span className="badge-icon"><FiMapPin aria-hidden="true" /></span>
                <span className="map-district-note-text">
                  <span>{customMarker?.label || `${getDistrictDisplayName(selectedDistrict)} - ${selectedDistrict.city_name}`}</span>
                  {customMarker?.label && (
                    <span className="map-district-note-secondary">
                      {getDistrictDisplayName(selectedDistrict)} - {selectedDistrict.city_name}
                    </span>
                  )}
                </span>
              </div>
            )}

            {customMarker && (
              <div className="marker-info">
                <span className="marker-check">✓</span>
                <span>Position marquée</span>
              </div>
            )}

            <div className={`step-actions map-actions ${isSinglePageOptionalMapStep ? 'optional-map-actions' : ''} ${isInlineQuantityVariant && !isSinglePageVariant ? 'with-location-fallback' : ''} ${customMarker ? 'has-selected-marker' : ''}`}>
              {customMarker && (
                <div className="map-selected-note">
                  <span className="marker-check">✓</span>
                  <span>{isSinglePageOptionalMapStep ? 'Position sélectionnée. Appuyez sur Enregistrer.' : mapSelectedNoteText}</span>
                </div>
              )}
              <button type="button" className="prev-btn" onClick={() => navigate(-1)}>
                {isSinglePageOptionalMapStep ? 'Retour' : 'Précédent'}
              </button>
              <button
                type="button"
                className={`next-btn ${customMarker ? 'enabled' : 'disabled'}`}
                onClick={handleConfirmMarker}
                disabled={!customMarker}
              >
                {isSinglePageOptionalMapStep ? 'Enregistrer' : 'Suivant'}
              </button>
              {isInlineQuantityVariant && !isSinglePageVariant && !customMarker && (
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
        {showInfoSection && (
          <div className={`section info-section ${isSinglePageVariant ? 'single-page-info-section' : ''}`}>
            <h2 className="section-title">Informations de livraison</h2>

            <div className="form-group">
              <label htmlFor="fullName" className="form-label required-field-label">
                <span>Nom complet</span>
                <span className={`field-status-dot ${fullNameReady ? 'ready' : ''}`} aria-hidden="true">
                  {fullNameReady ? '✓' : ''}
                </span>
              </label>
              <input
                id="fullName"
                type="text"
                ref={(node) => { fieldRefs.current.fullName = node }}
                className={`form-input ${errors.fullName ? 'error' : ''} ${fullNameReady ? 'field-ready' : ''}`}
                value={userInfo.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                placeholder="Entrez votre nom complet"
                autoComplete="name"
                maxLength={50}
              />
              {errors.fullName && <div className="error-message">{errors.fullName}</div>}
            </div>

            <div className="form-group">
              <label htmlFor="phone" className="form-label required-field-label">
                <span>Téléphone</span>
                <span className={`field-status-dot ${phoneReady ? 'ready' : ''}`} aria-hidden="true">
                  {phoneReady ? '✓' : ''}
                </span>
              </label>
              <div className={`phone-input-group ${errors.phone ? 'error' : ''} ${phoneReady ? 'field-ready' : ''}`}>
                <div className="country-code-prefix">+225</div>
                <input
                  id="phone"
                  type="tel"
                  ref={(node) => { fieldRefs.current.phone = node }}
                  className="form-input phone-input"
                  value={userInfo.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="XXXXXXXXXX"
                  autoComplete="tel"
                />
              </div>
              {errors.phone && <div className="error-message">{errors.phone}</div>}
            </div>

            <div className="form-group">
              <label htmlFor="addressDescription" className="form-label required-field-label">
                <span>{isInlineQuantityVariant ? 'Adresse ou repère' : 'Description de l\'adresse'}</span>
                <span className={`field-status-dot ${addressReady ? 'ready' : ''}`} aria-hidden="true">
                  {addressReady ? '✓' : ''}
                </span>
              </label>
              {isInlineQuantityVariant && (
                <div className="address-field-hint">
                  Quartier, lieu connu ou repère visible. Le livreur appellera avant de passer.
                </div>
              )}
              <textarea
                id="addressDescription"
                ref={(node) => { fieldRefs.current.addressDescription = node }}
                className={`form-textarea ${errors.addressDescription ? 'error' : ''} ${isInlineQuantityVariant && addressReady ? 'address-ready' : ''}`}
                value={userInfo.addressDescription}
                onChange={(e) => handleInputChange('addressDescription', e.target.value)}
                placeholder={isCodTrustVariant
                  ? 'Ex: Cocody Riviera 3, près de la Pharmacie Sainte Marie, portail bleu'
                  : isInlineQuantityVariant
                  ? 'Ex: Cocody Riviera 3, près de la Pharmacie Sainte Marie, portail bleu'
                  : 'Ex: Près de l\'université, à côté du bâtiment rouge'}
                autoComplete="street-address"
                rows={4}
              />
              {isCodTrustVariant && (
                <div className="address-assurance-note">
                  Ajoutez un repère clair. Si le livreur ne trouve pas, nous vous contactons par téléphone ou WhatsApp.
                </div>
              )}
              <div className="address-feedback-row">
                <div className={`address-minimum-hint ${errors.addressDescription ? 'error' : ''} ${addressReady ? 'ready' : ''}`}>
                  {errors.addressDescription || (!addressReady ? 'Minimum 5 caractères' : '')}
                </div>
                <div className="char-count">{userInfo.addressDescription.length}/200</div>
              </div>
              {(isAddressFirstVariant || isSinglePageVariant) && selectedDistrict && (
                <div className="address-map-option">
                  <button
                    type="button"
                    className="address-map-option-btn"
                    onClick={handleChoosePreciseMapLocation}
                  >
                    <FiMapPin aria-hidden="true" />
                    {hasManualMarkerSelection ? 'Modifier le point sur la carte' : 'Optionnel : marquer sur la carte'}
                  </button>
                  {hasManualMarkerSelection && selectedMarkerText && (
                    <div className="selected-map-marker-note">
                      <FiMapPin aria-hidden="true" />
                      <span>
                        <strong>Point marqué :</strong> {selectedMarkerText}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!isSinglePageVariant && (
              <div className="order-summary">
                <h3>Récapitulatif</h3>
                <div className="order-item">
                  <img
                    src={product.image_url?.[0]}
                    alt={product.name_fr}
                    className="order-item-image"
                    loading="lazy"
                    decoding="async"
                  />
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
            )}

            <div className="step-actions">
              {!isSinglePageVariant && (
                <button
                  type="button"
                  className="prev-btn"
                  onClick={() => navigate(-1)}
                >
                  Précédent
                </button>
              )}
              {isSinglePageReviewVariant && (
                <button
                  type="button"
                  className="review-product-btn"
                  onClick={handleReviewProductClick}
                >
                  Voir le produit
                </button>
              )}
              <button
                type="button"
                className={`place-order-btn ${isPlacingOrder ? 'loading' : 'enabled'}`}
                onPointerDown={handlePlaceOrderPointerDown}
                onClick={handlePlaceOrderClick}
                disabled={isPlacingOrder}
                aria-busy={isPlacingOrder}
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
    </div>
  )
}

export default PaymentPage
