import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import AppDownloadModal from '../components/AppDownloadModal'
import { appDownloadAPI } from '../services/api'
import './OrderSuccessPage.css'

// 缓存下载链接，避免重复请求
let cachedDownloadLinks = null

const OrderSuccessPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { product, quantity, userInfo, selectedLocation, totalPrice, orderResponse } = location.state || {}
  const [isModalOpen, setIsModalOpen] = useState(false)

  // 如果没有订单信息，重定向回首页
  useEffect(() => {
    if (!product || !quantity || !userInfo || !selectedLocation) {
      navigate('/')
      return
    }
    
    // 打印后端返回的订单数据
    if (location.state?.orderResponse) {
      console.log('=== 订单成功页面 - 后端返回数据 ===')
      console.log('完整订单响应:', location.state.orderResponse)
      console.log('订单号:', location.state.orderResponse.order_no)
      console.log('订单ID:', location.state.orderResponse.order_id)
      console.log('取件码:', location.state.orderResponse.verification_code)
      console.log('用户ID:', location.state.orderResponse.user_id)
      console.log('格式化订单数据:', JSON.stringify(location.state.orderResponse, null, 2))
      console.log('=====================================')
    }
  }, [product, quantity, userInfo, selectedLocation, navigate, location.state])

  const formatPrice = (price) => {
    return price.toString()
  }


  const handleDownloadApp = () => {
    // 打开自定义弹窗
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
  }

  const handleModalConfirm = () => {
    // 关闭弹窗
    setIsModalOpen(false)
    
    // 检测用户设备类型并跳转
    redirectToAppStore()
  }

  const redirectToAppStore = async () => {
    if (!cachedDownloadLinks) {
      cachedDownloadLinks = await appDownloadAPI.getDownloadLinks()
    }

    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const iosUrl = cachedDownloadLinks?.ios?.url || 'https://apps.apple.com/app/id6760172301'
    const androidUrl = cachedDownloadLinks?.android?.url || 'https://play.google.com/store/apps/details?id=com.brainnel.vite'

    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
      window.open(iosUrl, '_blank');
      return;
    }

    if (/android/i.test(userAgent)) {
      window.open(androidUrl, '_blank');
      return;
    }

    const choice = window.confirm(
      'Choisissez votre plateforme:\n\n' +
      'OK = Android (Google Play)\n' +
      'Annuler = iOS (App Store)'
    );

    if (choice) {
      window.open(androidUrl, '_blank');
    } else {
      window.open(iosUrl, '_blank');
    }
  }

  const handleWhatsAppContact = () => {
    const phoneNumber = '8615167909497'
    const whatsappUrl = `https://wa.me/${phoneNumber}`
    window.open(whatsappUrl, '_blank')
  }

  // 从后端返回的数据中获取取件码
  const pickupCode = location.state?.orderResponse?.verification_code || '000000'

  if (!product || !quantity || !userInfo || !selectedLocation) {
    return null
  }

  return (
    <div className="order-success-page">
      {/* 顶部标题栏 */}
      <div className="order-success-header">
        <button type="button" className="back-btn" onClick={() => navigate('/')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 12L5 10M5 10L12 3L19 10M5 10V20C5 20.5523 5.44772 21 6 21H9M19 10L21 12M19 10V20C19 20.5523 18.5523 21 18 21H15M9 21C9.55228 21 10 20.5523 10 20V16C10 15.4477 10.4477 15 11 15H13C13.5523 15 14 15.4477 14 16V20C14 20.5523 14.4477 21 15 21M9 21H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="header-title">Commande confirmée</h1>
      </div>

      <div className="success-content">
        {/* 成功图标和标题 */}
        <div className="success-header">
          <div className="success-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Succès">
              <circle cx="12" cy="12" r="10" fill="#28a745"/>
              <path d="m9 12 2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="success-title">Commande confirmée !</h2>
          <p className="success-subtitle">
            Nous vous contacterons dans les 24 heures via WhatsApp ou par téléphone pour convenir d'un horaire de livraison.
          </p>
        </div>

        {/* 订单摘要 */}
        <div className="order-summary">
          <div className="order-item">
            <img 
              src={product.image_url?.[0]} 
              alt={product.name_fr} 
              className="item-image"
            />
            <div className="item-details">
              <div className="item-name">{product.name_fr}</div>
              <div className="item-info">Quantité: {quantity} • {formatPrice(totalPrice)} FCFA</div>
            </div>
          </div>
        </div>

        {/* 订单信息 */}
        <div className="order-info-section">
          <h3 className="info-section-title">Informations de livraison</h3>
          
          <div className="info-row">
            <div className="info-label">👤 Nom complet</div>
            <div className="info-value">{userInfo.fullName}</div>
          </div>
          
          <div className="info-row">
            <div className="info-label">📞 Téléphone</div>
            <div className="info-value">+{userInfo.phone}</div>
          </div>
          
          <div className="info-row">
            <div className="info-label">💬 WhatsApp</div>
            <div className="info-value">+{userInfo.whatsapp}</div>
          </div>
          
          {userInfo.addressDescription && (
            <div className="info-row address-row">
              <div className="info-label">📍 Adresse</div>
              <div className="info-value">{userInfo.addressDescription}</div>
            </div>
          )}
          
          {selectedLocation && (
            <div className="info-row">
              <div className="info-label">🏢 District</div>
              <div className="info-value">{selectedLocation.name}</div>
            </div>
          )}

          <div className="info-row">
            <div className="info-label">🕐 Horaires de livraison</div>
            <div className="info-value">8:00 - 21:00</div>
          </div>
        </div>

        {/* 重要提醒 */}
        <div className="phone-notice delivery-notice">
          <div className="notice-icon">⏰</div>
          <div className="notice-text">
            <strong>Rendez-vous de livraison</strong>
            <p>Notre équipe vous contactera dans les <strong>24 heures</strong> via WhatsApp (+{userInfo.whatsapp}) ou par téléphone (+{userInfo.phone}) pour planifier la livraison à votre convenance.</p>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="success-actions">
          <button type="button" className="download-btn" onClick={handleDownloadApp}>
            📱 Télécharger l'app
          </button>
          <button type="button" className="whatsapp-btn" onClick={handleWhatsAppContact}>
            💬 Nous contacter sur WhatsApp
          </button>
        </div>
      </div>

      {/* 下载App弹窗 */}
      <AppDownloadModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        whatsappNumber={userInfo?.whatsapp}
      />
    </div>
  )
}

export default OrderSuccessPage
