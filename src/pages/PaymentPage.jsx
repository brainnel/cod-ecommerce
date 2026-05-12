import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { districtAPI, orderAPI } from '../services/api'
import { useAdId } from '../hooks/useAdTrackingHooks.js'
import { trackPurchaseEvent, getClientInfo } from '../services/facebookConversions'
import {
  buildCheckoutProductProperties,
  getCheckoutSessionId,
  resumeCheckoutSession,
  startCheckoutSession,
  trackCheckoutEvent,
  updateCheckoutContext
} from '../services/checkoutFunnelAnalytics'
import MapSelector from '../components/MapSelector'
import MapGuideModal from '../components/MapGuideModal'
import { DISTRICT_CENTERS, DEFAULT_CENTER, DEFAULT_ZOOM } from '../constants/districtCenters'
import './PaymentPage.css'

const GEOLOCATION_CACHE_MAX_AGE_MS = 5 * 60 * 1000
const GEOLOCATION_FAST_TIMEOUT_MS = 4000
const GEOLOCATION_HIGH_TIMEOUT_MS = 8000

const PaymentPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { product, quantity, checkoutSessionId: routeCheckoutSessionId } = location.state || {}
  const adId = useAdId()
  const checkoutSessionIdRef = useRef(routeCheckoutSessionId || null)
  const infoStepTrackedRef = useRef(false)
  const completedFieldsRef = useRef(new Set())
  const currentLocationRequestRef = useRef(0)
  const currentLocationTrackedRequestRef = useRef(null)
  const markerSelectionSourceRef = useRef('none')

  // 三步流程：1=选大区, 2=地图标记, 3=填写信息
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // 步顢1：大区选择
  const [districts, setDistricts] = useState([])
  const [selectedDistrict, setSelectedDistrict] = useState(null)

  // 步顢2：地图标记
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER)
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM)
  const [customMarker, setCustomMarker] = useState(null)
  const [userLocation, setUserLocation] = useState(null)  // 用户当前位置
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
  const [errors, setErrors] = useState({})
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [clientInfo, setClientInfo] = useState({})

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
      ad_id: adId
    })
    trackCheckoutEvent('checkout_start', buildCheckoutProductProperties(product, {
      quantity: quantity || 1,
      total_price: totalPrice,
      ad_id: adId
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

  const getCheckoutAnalyticsProps = (extra = {}) => {
    const totalPrice = product ? product.price * (quantity || 1) : 0
    return {
      ...buildCheckoutProductProperties(product, {
        quantity: quantity || 1,
        total_price: totalPrice,
        ad_id: adId
      }),
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
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
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
        ad_id: adId
      })
    } else {
      const storedSessionId = getCheckoutSessionId()
      if (storedSessionId) {
        checkoutSessionIdRef.current = storedSessionId
      }
      updateCheckoutContext(product, {
        quantity,
        total_price: totalPrice,
        ad_id: adId
      })
    }
  }, [product, quantity, navigate, routeCheckoutSessionId, adId])

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
    lng: position.coords.longitude
  })

  const applyCurrentLocation = (position, requestId, stage) => {
    if (requestId !== currentLocationRequestRef.current) return false

    const userPos = positionToMarker(position)
    setUserLocation(userPos)

    if (markerSelectionSourceRef.current === 'manual') {
      console.log('用户已手动选择位置，跳过自动覆盖:', userPos)
      return false
    }

    markerSelectionSourceRef.current = 'current'
    setCustomMarker(userPos)
    setMapCenter(userPos)
    setLocationRequestStatus('success')
    setLocationRequestMessage('Position trouvée. Vous pouvez ajuster sur la carte si nécessaire.')

    if (currentLocationTrackedRequestRef.current !== requestId) {
      currentLocationTrackedRequestRef.current = requestId
      trackPaymentEvent('location_selected', {
        ...getDistrictAnalyticsProps(),
        location_method: 'current_location',
        geolocation_stage: stage
      })
    }

    console.log('用户位置:', userPos)
    return true
  }

  const trackCurrentLocationFailure = (error, requestId, stage) => {
    if (requestId !== currentLocationRequestRef.current) return
    if (currentLocationTrackedRequestRef.current === requestId) return

    trackPaymentEvent('location_current_failed', {
      ...getDistrictAnalyticsProps(),
      error_code: error?.code || 2,
      geolocation_stage: stage
    })
  }

  const runHighAccuracyLocation = (requestId) => {
    requestBrowserLocation({
      enableHighAccuracy: true,
      timeout: GEOLOCATION_HIGH_TIMEOUT_MS,
      maximumAge: GEOLOCATION_CACHE_MAX_AGE_MS
    })
      .then((position) => {
        applyCurrentLocation(position, requestId, 'high_accuracy')
      })
      .catch((error) => {
        console.log('高精度定位失败:', error.message)
        trackCurrentLocationFailure(error, requestId, 'high_accuracy')
        if (
          requestId === currentLocationRequestRef.current &&
          currentLocationTrackedRequestRef.current !== requestId &&
          markerSelectionSourceRef.current !== 'manual'
        ) {
          setLocationRequestStatus('failed')
          setLocationRequestMessage('Impossible d’obtenir votre position. Veuillez sélectionner votre position sur la carte.')
        }
      })
  }

  const handleUseCurrentLocation = () => {
    const requestId = currentLocationRequestRef.current + 1
    currentLocationRequestRef.current = requestId
    currentLocationTrackedRequestRef.current = null
    markerSelectionSourceRef.current = 'current_pending'
    setLocationRequestStatus('locating')
    setLocationRequestMessage('Recherche de votre position...')
    trackPaymentEvent('location_current_attempt', getDistrictAnalyticsProps())

    if (userLocation) {
      applyCurrentLocation({ coords: { latitude: userLocation.lat, longitude: userLocation.lng } }, requestId, 'cached')
      runHighAccuracyLocation(requestId)
      return
    }

    requestBrowserLocation({
      enableHighAccuracy: false,
      timeout: GEOLOCATION_FAST_TIMEOUT_MS,
      maximumAge: GEOLOCATION_CACHE_MAX_AGE_MS
    })
      .then((position) => {
        applyCurrentLocation(position, requestId, 'fast')
        runHighAccuracyLocation(requestId)
      })
      .catch((error) => {
        console.log('快速定位失败:', error.message)
        if (requestId === currentLocationRequestRef.current) {
          setLocationRequestStatus('slow')
          setLocationRequestMessage('La localisation prend plus de temps. Vous pouvez sélectionner votre position sur la carte.')
        }
        runHighAccuracyLocation(requestId)
      })
  }

  // 选择大区
  const handleSelectDistrict = (district) => {
    setSelectedDistrict(district)
    updateCheckoutContext(product, {
      quantity,
      total_price: product.price * quantity,
      ad_id: adId,
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
    
    setCurrentStep(2)
    // 显示引导动画
    setTimeout(() => setShowGuideModal(true), 500)
  }

  // 地图标记
  const handleMapClick = (marker) => {
    markerSelectionSourceRef.current = 'manual'
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
    setCurrentStep(3)
  }

  // 表单输入处理
  const handleInputChange = (field, value) => {
    let nextValue = value

    if (field === 'phone' || field === 'whatsapp') {
      nextValue = value.replace(/\D/g, '').slice(0, 10)
    } else if (field === 'addressDescription') {
      nextValue = value.slice(0, 200)
    }

    setUserInfo(prev => ({ ...prev, [field]: nextValue }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }

    const isFieldComplete = (
      (field === 'fullName' && nextValue.trim().length > 0) ||
      ((field === 'phone' || field === 'whatsapp') && nextValue.length === 10) ||
      (field === 'addressDescription' && nextValue.trim().length >= 5)
    )

    if (isFieldComplete && !completedFieldsRef.current.has(field)) {
      completedFieldsRef.current.add(field)
      trackPaymentEvent('field_completed', {
        ...getDistrictAnalyticsProps(),
        field
      })
    }
  }

  // 验证表单
  const validateForm = () => {
    const newErrors = {}
    
    if (!userInfo.fullName.trim()) {
      newErrors.fullName = 'Le nom complet est requis'
    }
    
    if (!userInfo.phone.trim()) {
      newErrors.phone = 'Le numéro de téléphone est requis'
    } else if (userInfo.phone.length !== 10) {
      newErrors.phone = 'Le numéro doit contenir 10 chiffres'
    }
    
    if (!userInfo.whatsapp.trim()) {
      newErrors.whatsapp = 'Le numéro WhatsApp est requis'
    } else if (userInfo.whatsapp.length !== 10) {
      newErrors.whatsapp = 'Le numéro doit contenir 10 chiffres'
    }
    
    if (!userInfo.addressDescription.trim()) {
      newErrors.addressDescription = 'La description de l\'adresse est requise'
    } else if (userInfo.addressDescription.trim().length < 5) {
      newErrors.addressDescription = 'Au moins 5 caractères requis'
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
    if (!validateForm()) {
      const missingFields = []
      if (!userInfo.fullName.trim()) missingFields.push('fullName')
      if (userInfo.phone.length !== 10) missingFields.push('phone')
      if (userInfo.whatsapp.length !== 10) missingFields.push('whatsapp')
      if (userInfo.addressDescription.trim().length < 5) missingFields.push('addressDescription')
      trackPaymentEvent('submit_validation_failed', {
        ...getDistrictAnalyticsProps(),
        missing_fields: missingFields
      })
      return
    }
    
    trackPaymentEvent('submit_order_click', getDistrictAnalyticsProps())
    setIsPlacingOrder(true)
    
    try {
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
        whatsapp: `225${userInfo.whatsapp}`,
        receiver_address: userInfo.addressDescription,
        latitude: customMarker.lat,
        longitude: customMarker.lng,
        payment_method: "cod",
        total_amount: product.price * quantity,
        actual_amount: product.price * quantity,
        discount_amount: 0,
        currency: "FCFA",
        is_web: 1,
        ad_id: adId
      }

      console.log('提交订单:', orderData)
      const response = await orderAPI.createOrder(orderData)
      console.log('订单响应:', response)

      // 发送Facebook购买事件
      if (response?.data && response.status >= 200 && response.status < 300) {
        trackPaymentEvent('order_create_success', {
          ...getDistrictAnalyticsProps(),
          order_no: response.data.order_no || response.data.order_id || null,
          order_status: response.status
        })

        try {
          trackPurchaseEvent({
            productId: product.product_id,
            quantity: quantity,
            totalPrice: product.price * quantity,
            unitPrice: product.price,
            orderNo: response.data.order_no || response.data.order_id
          }, userInfo, clientInfo).catch(err => console.warn('Facebook事件失败:', err))
        } catch (fbError) {
          console.warn('Facebook事件错误:', fbError)
        }
      }

      // 跳转到订单成功页面
      navigate('/order-success', {
        state: {
          product,
          quantity,
          userInfo,
          selectedLocation: selectedDistrict,
          totalPrice: product.price * quantity,
          orderResponse: response.data
        }
      })

    } catch (err) {
      console.error('订单失败:', err)
      trackPaymentEvent('order_create_failed', {
        ...getDistrictAnalyticsProps(),
        error_status: err.response?.status || null,
        error_type: err.code || 'order_api_error'
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
                    <div className="district-icon">📍</div>
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
          <div className="section map-section">
            {/* 橙色提示条 */}
            <div className="location-hint">
              <div className="hint-content">
                <span className="hint-text">
                  Si votre position actuelle est votre adresse de livraison, cliquez sur « Utiliser ma position actuelle ». Sinon, veuillez sélectionner votre position manuellement.
                </span>
              </div>
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
                    ? 'Recherche de position...'
                    : 'Utiliser ma position actuelle'}
                </span>
              </button>
            </div>

            {locationRequestMessage && (
              <div className={`location-status ${locationRequestStatus}`}>
                {locationRequestMessage}
              </div>
            )}
            
            {selectedDistrict && (
              <div className="district-info-badge">
                <span className="badge-icon">📍</span>
                <span>{selectedDistrict.name} - {selectedDistrict.city_name}</span>
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

            {customMarker && (
              <div className="marker-info">
                <span className="marker-check">✓</span>
                <span>Position marquée</span>
              </div>
            )}

            <div className="step-actions">
              <button type="button" className="prev-btn" onClick={() => setCurrentStep(1)}>
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
                  className="form-input phone-input"
                  value={userInfo.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="XXXXXXXX"
                />
              </div>
              {errors.phone && <div className="error-message">{errors.phone}</div>}
            </div>

            <div className="form-group">
              <label htmlFor="whatsapp" className="form-label">WhatsApp *</label>
              <div className={`phone-input-group ${errors.whatsapp ? 'error' : ''}`}>
                <div className="country-code-prefix">+225</div>
                <input
                  id="whatsapp"
                  type="tel"
                  className="form-input phone-input"
                  value={userInfo.whatsapp}
                  onChange={(e) => handleInputChange('whatsapp', e.target.value)}
                  placeholder="XXXXXXXX"
                />
              </div>
              {errors.whatsapp && <div className="error-message">{errors.whatsapp}</div>}
            </div>

            <div className="form-group">
              <label htmlFor="addressDescription" className="form-label">Description de l'adresse *</label>
              <textarea
                id="addressDescription"
                className={`form-textarea ${errors.addressDescription ? 'error' : ''}`}
                value={userInfo.addressDescription}
                onChange={(e) => handleInputChange('addressDescription', e.target.value)}
                placeholder="Ex: Près de l'université, à côté du bâtiment rouge"
                rows={4}
              />
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
                <span className="payment-icon">💰</span>
                <span>Paiement à la livraison</span>
              </div>
            </div>

            <div className="step-actions">
              <button type="button" className="prev-btn" onClick={() => setCurrentStep(2)}>
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
