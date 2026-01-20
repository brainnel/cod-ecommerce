import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { districtAPI, orderAPI } from '../services/api'
import { useAdId } from '../hooks/useAdTrackingHooks.js'
import { trackPurchaseEvent, getClientInfo } from '../services/facebookConversions'
import MapSelector from '../components/MapSelector'
import MapGuideModal from '../components/MapGuideModal'
import { DISTRICT_CENTERS, DEFAULT_CENTER, DEFAULT_ZOOM } from '../constants/districtCenters'
import './PaymentPage.css'

const PaymentPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { product, quantity } = location.state || {}
  const adId = useAdId()

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

  // 重定向检查
  useEffect(() => {
    if (!product || !quantity) {
      navigate('/')
      return
    }
    const info = getClientInfo()
    setClientInfo(info)
  }, [product, quantity, navigate])

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

  // 获取用户当前位置
  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
          setUserLocation(userPos)
          console.log('用户位置:', userPos)
        },
        (error) => {
          console.log('无法获取位置:', error.message)
          // 不显示错误，只是不显示用户位置标记
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      )
    }
  }

  // 选择大区
  const handleSelectDistrict = (district) => {
    setSelectedDistrict(district)
    
    // 直接使用大区自己的坐标作为地图中心
    const districtCenter = {
      lat: parseFloat(district.latitude),
      lng: parseFloat(district.longitude)
    }
    setMapCenter(districtCenter)
    setMapZoom(14)  // 大区级别，用更高的缩放
    
    // 获取用户当前位置
    getUserLocation()
    
    setCurrentStep(2)
    // 显示引导动画
    setTimeout(() => setShowGuideModal(true), 500)
  }

  // 地图标记
  const handleMapClick = (marker) => {
    setCustomMarker(marker)
  }

  // 确认标记，进入步骤3
  const handleConfirmMarker = () => {
    if (!customMarker) {
      alert('Veuillez cliquer sur la carte pour choisir un emplacement')
      return
    }
    setCurrentStep(3)
  }

  // 表单输入处理
  const handleInputChange = (field, value) => {
    if (field === 'phone' || field === 'whatsapp') {
      const cleanValue = value.replace(/\D/g, '').slice(0, 10)
      setUserInfo(prev => ({ ...prev, [field]: cleanValue }))
      if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: '' }))
      }
    } else if (field === 'addressDescription') {
      const limitedValue = value.slice(0, 200)
      setUserInfo(prev => ({ ...prev, [field]: limitedValue }))
      if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: '' }))
      }
    } else {
      setUserInfo(prev => ({ ...prev, [field]: value }))
      if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: '' }))
      }
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

  // 提交订单
  const handlePlaceOrder = async () => {
    if (!validateForm()) return
    
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
                  Si vous serez à cette adresse dans les 24 prochaines heures, cliquez sur le bouton à droite pour utiliser votre position actuelle. Nous vous contacterons pour la livraison dans les 24 heures suivant votre commande.
                </span>
              </div>
              <button 
                className="use-location-btn"
                onClick={() => {
                  if (userLocation) {
                    setCustomMarker(userLocation)
                    setMapCenter(userLocation)
                  } else {
                    getUserLocation()
                  }
                }}
                type="button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="12" r="3"/>
                  <line x1="12" y1="2" x2="12" y2="4"/>
                  <line x1="12" y1="20" x2="12" y2="22"/>
                  <line x1="2" y1="12" x2="4" y2="12"/>
                  <line x1="20" y1="12" x2="22" y2="12"/>
                </svg>
              </button>
            </div>
            
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
