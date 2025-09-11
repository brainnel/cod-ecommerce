import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { pickupAPI, orderAPI } from '../services/api'
import mapImage from '../assets/map.png'
import './PaymentPage.css'

const PaymentPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { product, quantity } = location.state || {}

  const [userInfo, setUserInfo] = useState({
    fullName: '',
    phone: '',
    whatsapp: ''
  })
  
  const [pickupLocations, setPickupLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)

  // 如果没有产品信息，重定向回首页
  useEffect(() => {
    if (!product || !quantity) {
      navigate('/')
      return
    }
  }, [product, quantity, navigate])

  // 获取取货点数据
  useEffect(() => {
    const fetchPickupLocations = async () => {
      try {
        setLoading(true)
        const data = await pickupAPI.getPickupLocations()
        setPickupLocations(data)
      } catch (err) {
        setError('Échec de récupération des points de retrait')
        console.error('Error fetching pickup locations:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchPickupLocations()
  }, [])

  const handleUserInfoChange = (field, value) => {
    setUserInfo(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const formatPrice = (price) => {
    return price.toString()
  }

  const formatTime = (timeString) => {
    return timeString.slice(0, 5) // 只显示 HH:MM
  }


  const formatTimetables = (timetables) => {
    const weekdaySchedule = timetables.find(t => t.day_of_week === 'weekday')
    const saturdaySchedule = timetables.find(t => t.day_of_week === 'saturday')
    const sundaySchedule = timetables.find(t => t.day_of_week === 'sunday')

    const result = []

    // 检查周一到周五和周六时间是否相同
    if (weekdaySchedule && saturdaySchedule && 
        weekdaySchedule.start_time === saturdaySchedule.start_time && 
        weekdaySchedule.end_time === saturdaySchedule.end_time) {
      // 时间相同，合并显示
      result.push({
        day: 'Lun-Sam',
        time: `${formatTime(weekdaySchedule.start_time)} - ${formatTime(weekdaySchedule.end_time)}`
      })
    } else {
      // 时间不同，分开显示
      if (weekdaySchedule) {
        result.push({
          day: 'Lun-Ven',
          time: `${formatTime(weekdaySchedule.start_time)} - ${formatTime(weekdaySchedule.end_time)}`
        })
      }
      if (saturdaySchedule) {
        result.push({
          day: 'Samedi',
          time: `${formatTime(saturdaySchedule.start_time)} - ${formatTime(saturdaySchedule.end_time)}`
        })
      }
    }

    // 单独处理周日
    if (sundaySchedule) {
      result.push({
        day: 'Dimanche',
        time: `${formatTime(sundaySchedule.start_time)} - ${formatTime(sundaySchedule.end_time)}`
      })
    }

    return result
  }

  const isUserInfoValid = () => {
    return userInfo.fullName.trim() !== '' && 
           userInfo.phone.trim() !== '' && 
           userInfo.whatsapp.trim() !== ''
  }

  const isFormValid = () => {
    return isUserInfoValid() && selectedLocation !== null
  }

  const handleNextStep = () => {
    if (currentStep === 1 && isUserInfoValid()) {
      setCurrentStep(2)
    } else if (currentStep === 2 && selectedLocation) {
      setCurrentStep(3)
    }
  }

  const handleStepClick = (step) => {
    if (step === 1) {
      setCurrentStep(1)
    } else if (step === 2 && isUserInfoValid()) {
      setCurrentStep(2)
    } else if (step === 3 && isUserInfoValid() && selectedLocation) {
      setCurrentStep(3)
    }
  }

  const handlePlaceOrder = async () => {
    if (!isFormValid()) {
      alert('Veuillez remplir tous les champs et sélectionner un point de retrait')
      return
    }
    
    setIsPlacingOrder(true)
    
    try {
      // 构建订单数据
      const orderData = {
        items: [{
          product_id: product.product_id.toString(), // 使用真实的product_id
          sku_id: product.skus && product.skus.length > 0 ? product.skus[0].sku_id : product.product_id.toString(), // 安全获取sku_idr
          
          quantity: quantity,
          unit_price: product.price,
          total_price: product.price * quantity
        }],
        pickup_location_id: selectedLocation.id,
        payment_method: "cod",
        total_amount: totalPrice,
        actual_amount: totalPrice,
        discount_amount: 0,
        currency: "FCFA",
        full_name: userInfo.fullName,
        phone: userInfo.phone,
        whatsapp: userInfo.whatsapp,
        is_web: 1
      }

      // 调试日志 - 显示即将发送的订单数据
      console.log('=== 下单调试信息 ===')
      console.log('产品信息:', product)
      console.log('产品ID (product_id):', product.product_id)
      console.log('SKU信息:', product.skus)
      console.log('SKU数组长度:', product.skus ? product.skus.length : 0)
      const skuId = product.skus && product.skus.length > 0 ? product.skus[0].sku_id : product.product_id.toString()
      console.log('使用的SKU ID:', skuId)
      console.log('数量:', quantity)
      console.log('用户信息:', userInfo)
      console.log('选择的取货点:', selectedLocation)
      console.log('总价:', totalPrice)
      console.log('即将发送的订单数据:', JSON.stringify(orderData, null, 2))
      console.log('请求URL:', 'https://api.brainnel.com/test/api/flash-local/orders/')
      console.log('==================')

      // 调用下单接口
      console.log('正在调用下单接口...')
      const response = await orderAPI.createOrder(orderData)
      console.log('下单接口调用完成，响应对象:', response)

      // 调试日志 - 显示服务器响应
      console.log('=== 下单响应信息 ===')
      console.log('完整响应对象:', response)
      console.log('响应状态:', response?.status)
      console.log('响应数据:', response?.data)
      if (response?.data) {
        console.log('后端返回的完整数据:', JSON.stringify(response.data, null, 2))
      } else {
        console.log('警告：响应中没有data字段')
      }
      console.log('==================')

      // 下单成功，跳转到订单成功页面
      navigate('/order-success', {
        state: {
          product,
          quantity,
          userInfo,
          selectedLocation,
          totalPrice,
          orderResponse: response.data
        }
      })

    } catch (err) {
      // 调试日志 - 显示错误详情
      console.log('=== 下单错误信息 ===')
      console.error('下单失败:', err)
      console.log('错误状态码:', err.response?.status)
      console.log('错误响应数据:', err.response?.data)
      console.log('错误消息:', err.message)
      console.log('================')
      
      // 显示错误信息
      const errorMessage = err.response?.data?.message || 
                          err.response?.data?.error || 
                          'Une erreur est survenue lors de la commande. Veuillez réessayer.'
      alert(errorMessage)
      
    } finally {
      setIsPlacingOrder(false)
    }
  }

  if (!product || !quantity) {
    return null
  }

  const totalPrice = product.price * quantity

  return (
    <div className="payment-page">
      {/* 顶部标题栏 */}
      <div className="payment-header">
        <button type="button" className="back-btn" onClick={() => navigate(-1)}>
          ←
        </button>
        <h1 className="payment-title">Finaliser la commande</h1>
      </div>

      <div className="payment-content">
        {/* 步骤指示器 */}
        <div className="steps-indicator">
          <div 
            className={`step ${currentStep >= 1 ? 'active' : ''} ${isUserInfoValid() ? 'completed' : ''}`}
            onClick={() => handleStepClick(1)}
            onKeyDown={(e) => e.key === 'Enter' && handleStepClick(1)}
            role="button"
            tabIndex={0}
          >
            <div className="step-icon">
              {isUserInfoValid() ? '✓' : '1'}
            </div>
            <span className="step-label">Informations</span>
          </div>
          <div className="step-divider"></div>
          <div 
            className={`step ${currentStep >= 2 ? 'active' : ''} ${selectedLocation ? 'completed' : ''}`}
            onClick={() => handleStepClick(2)}
            onKeyDown={(e) => e.key === 'Enter' && handleStepClick(2)}
            role="button"
            tabIndex={0}
          >
            <div className="step-icon">
              {selectedLocation ? '✓' : '2'}
            </div>
            <span className="step-label">Point de retrait</span>
          </div>
          <div className="step-divider"></div>
          <div 
            className={`step ${currentStep >= 3 ? 'active' : ''}`}
            onClick={() => handleStepClick(3)}
            onKeyDown={(e) => e.key === 'Enter' && handleStepClick(3)}
            role="button"
            tabIndex={0}
          >
            <div className="step-icon">3</div>
            <span className="step-label">Confirmation</span>
          </div>
        </div>

        {/* 步骤1: 用户信息表单 */}
        <div className={`section user-info-section ${currentStep !== 1 ? 'collapsed' : ''}`}>
          <h2 className="section-title">
            {currentStep !== 1 && isUserInfoValid() ? (
              <span className="completed-title">
                ✓ Informations personnelles
              </span>
            ) : (
              'Informations personnelles'
            )}
          </h2>
          {currentStep === 1 && (
            <>
              <div className="form-group">
                <label htmlFor="fullName" className="form-label">Nom complet *</label>
                <input
                  id="fullName"
                  type="text"
                  className="form-input"
                  value={userInfo.fullName}
                  onChange={(e) => handleUserInfoChange('fullName', e.target.value)}
                  placeholder="Entrez votre nom complet"
                />
              </div>
              <div className="form-group">
                <label htmlFor="phone" className="form-label">Téléphone *</label>
                <input
                  id="phone"
                  type="tel"
                  className="form-input"
                  value={userInfo.phone}
                  onChange={(e) => handleUserInfoChange('phone', e.target.value)}
                  placeholder="Entrez votre numéro de téléphone"
                />
              </div>
              <div className="form-group">
                <label htmlFor="whatsapp" className="form-label">WhatsApp *</label>
                <input
                  id="whatsapp"
                  type="tel"
                  className="form-input"
                  value={userInfo.whatsapp}
                  onChange={(e) => handleUserInfoChange('whatsapp', e.target.value)}
                  placeholder="Entrez votre numéro WhatsApp"
                />
              </div>
              <div className="step-actions">
                <button 
                  type="button"
                  className={`next-btn ${isUserInfoValid() ? 'enabled' : 'disabled'}`}
                  onClick={handleNextStep}
                  disabled={!isUserInfoValid()}
                >
                  Suivant
                </button>
              </div>
            </>
          )}
        </div>

        {/* 步骤2: 取货点选择 */}
        <div className={`section pickup-section ${currentStep !== 2 ? 'collapsed' : ''}`}>
          <h2 className="section-title">
            {currentStep !== 2 && selectedLocation ? (
              <span className="completed-title">
                ✓ Point de retrait sélectionné
              </span>
            ) : (
              'Sélectionner un point de retrait'
            )}
          </h2>
          {currentStep === 2 && (
            <>
              {/* 地图显示 */}
              <div className="map-container">
                <img src={mapImage} alt="Carte des points de retrait" className="pickup-map" />
              </div>
              
              {loading ? (
                <div className="loading-container">
                  <div className="loading-spinner"></div>
                  <p>Chargement des points de retrait...</p>
                </div>
              ) : error ? (
                <div className="error-container">
                  <p>{error}</p>
                </div>
              ) : (
                <div className="pickup-locations">
                  {pickupLocations.map((location) => (
                    <div
                      key={location.id}
                      className={`pickup-location ${selectedLocation?.id === location.id ? 'selected' : ''}`}
                      onClick={() => setSelectedLocation(location)}
                      onKeyDown={(e) => e.key === 'Enter' && setSelectedLocation(location)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="location-header">
                        <div className="location-name">{location.name}</div>
                        <div className="location-address">{location.address}</div>
                      </div>
                      <div className="location-timetables">
                        {formatTimetables(location.timetables).map((schedule) => (
                          <div key={`${schedule.day}-${schedule.time}`} className="timetable">
                            <span className="day">{schedule.day}</span>
                            <span className="time">{schedule.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="step-actions">
                <button 
                  type="button"
                  className="prev-btn"
                  onClick={() => setCurrentStep(1)}
                >
                  Précédent
                </button>
                <button 
                  type="button"
                  className={`next-btn ${selectedLocation ? 'enabled' : 'disabled'}`}
                  onClick={handleNextStep}
                  disabled={!selectedLocation}
                >
                  Suivant
                </button>
              </div>
            </>
          )}
        </div>

        {/* 步骤3: 订单确认 */}
        <div className={`section order-summary-section ${currentStep !== 3 ? 'collapsed' : ''}`}>
          <h2 className="section-title">Récapitulatif de la commande</h2>
          {currentStep === 3 && (
            <>
              <div className="order-item">
                <img src={product.image_url?.[0]} alt={product.name_fr} className="order-item-image" />
                <div className="order-item-details">
                  <div className="order-item-name">{product.name_fr}</div>
                  <div className="order-item-price">{formatPrice(product.price)} FCFA × {quantity}</div>
                </div>
                <div className="order-item-total">{formatPrice(totalPrice)} FCFA</div>
              </div>

              {/* 用户信息摘要 */}
              <div className="order-summary-info">
                <div className="summary-section">
                  <h4>Informations personnelles</h4>
                  <p>{userInfo.fullName}</p>
                  <p>Tél: {userInfo.phone}</p>
                  <p>WhatsApp: {userInfo.whatsapp}</p>
                </div>
                <div className="summary-section">
                  <h4>Point de retrait</h4>
                  <p><strong>{selectedLocation?.name}</strong></p>
                  <p>{selectedLocation?.address}</p>
                </div>
              </div>
              
              <div className="order-totals">
                <div className="total-row">
                  <span>Sous-total</span>
                  <span>{formatPrice(totalPrice)} FCFA</span>
                </div>
                <div className="total-row shipping">
                  <span>Livraison</span>
                  <span className="free-shipping">Gratuite</span>
                </div>
                <div className="total-row final-total">
                  <span>Total</span>
                  <span>{formatPrice(totalPrice)} FCFA</span>
                </div>
              </div>

              <div className="payment-method">
                <h3>Mode de paiement</h3>
                <div className="payment-option selected">
                  <span className="payment-icon">💰</span>
                  <span>Paiement à la livraison</span>
                </div>
              </div>

              <div className="step-actions">
                <button 
                  type="button"
                  className="prev-btn"
                  onClick={() => setCurrentStep(2)}
                >
                  Précédent
                </button>
                <button
                  type="button"
                  className={`place-order-btn ${isFormValid() && !isPlacingOrder ? 'enabled' : 'disabled'}`}
                  onClick={handlePlaceOrder}
                  disabled={!isFormValid() || isPlacingOrder}
                >
                  {isPlacingOrder ? 'Commande en cours...' : 'Passer la commande'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default PaymentPage
