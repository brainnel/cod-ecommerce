import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  FiCheckCircle,
  FiClock,
  FiCreditCard,
  FiDownload,
  FiHome,
  FiMap,
  FiMapPin,
  FiMessageCircle,
  FiPhone,
  FiTruck,
  FiUser
} from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import AppDownloadModal from '../components/AppDownloadModal'
import { appDownloadAPI } from '../services/api'
import { trackCheckoutEvent } from '../services/checkoutFunnelAnalytics'
import './OrderSuccessPage.css'

// 缓存下载链接，避免重复请求
let cachedDownloadLinks = null

const getDevOrderSuccessPreviewState = (search) => {
  if (!import.meta.env.DEV) return null
  const params = new URLSearchParams(search)
  if (params.get('preview_order_success') !== '1') return null

  return {
    product: {
      product_id: '946101641067',
      name_fr: 'Ventilateur de taille portable refroidissement chantier rechargeable anti-chaleur',
      image_url: ['https://api.brainnel.com/admin/static/uploads/image2_946101641067_01_white_main_bbf7918c754546a590b2396a78d49b65.jpg'],
      price: 10500
    },
    quantity: 1,
    userInfo: {
      fullName: 'Codex Test',
      phone: '0700000000',
      whatsapp: '0700000000',
      addressDescription: 'Cocody, près de la pharmacie, portail bleu'
    },
    selectedLocation: {
      name: 'Cocody',
      city_name: 'Abidjan'
    },
    totalPrice: 10500,
    orderResponse: {
      order_id: 'preview',
      order_no: 'FL-PREVIEW'
    }
  }
}

const OrderSuccessPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const previewState = getDevOrderSuccessPreviewState(location.search)
  const { product, quantity, userInfo, selectedLocation, totalPrice, orderResponse } = location.state || previewState || {}
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [])

  // 如果没有订单信息，重定向回首页
  useEffect(() => {
    if (!product || !quantity || !userInfo || !selectedLocation) {
      navigate('/')
    }
  }, [product, quantity, userInfo, selectedLocation, navigate])

  const formatPrice = (price) => {
    return price.toString()
  }


  const trackSuccessPageAction = (eventName) => {
    trackCheckoutEvent(eventName, {
      page_name: 'order_success',
      order_id: orderResponse?.order_id ? String(orderResponse.order_id) : null,
      order_no: orderResponse?.order_no || null
    })
  }

  const handleDownloadApp = () => {
    trackSuccessPageAction('order_success_app_download_click')
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
    trackSuccessPageAction('order_success_whatsapp_contact_click')
    const phoneNumber = '8615167909497'
    const whatsappUrl = `https://wa.me/${phoneNumber}`
    window.open(whatsappUrl, '_blank')
  }

  if (!product || !quantity || !userInfo || !selectedLocation) {
    return null
  }

  return (
    <div className="order-success-page">
      {/* 顶部标题栏 */}
      <div className="order-success-header">
        <button type="button" className="back-btn" onClick={() => navigate('/')}>
          <FiHome aria-hidden="true" />
        </button>
        <h1 className="header-title">Commande confirmée</h1>
      </div>

      <div className="success-content">
        {/* 成功图标和标题 */}
        <div className="success-header">
          <div className="success-icon">
            <FiCheckCircle aria-label="Succès" />
          </div>
          <h2 className="success-title">Commande confirmée !</h2>
          <p className="success-subtitle">
            Nous vous livrerons dans les prochaines 24 à 48 heures. Le livreur vous contactera à l'avance par téléphone ou WhatsApp.
          </p>
          <div className="success-promise-grid">
            <div className="success-promise-item">
              <FiTruck aria-hidden="true" />
              <span>Livraison gratuite à Abidjan</span>
            </div>
            <div className="success-promise-item">
              <FiCreditCard aria-hidden="true" />
              <span>Cash ou Wave à la réception</span>
            </div>
          </div>
        </div>

        {/* 订单摘要 */}
        <div className="order-summary">
          <div className="order-item">
            <img 
              src={product.image_url?.[0]} 
              alt={product.name_fr} 
              className="item-image"
              loading="lazy"
              decoding="async"
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
            <div className="info-label"><span className="info-label-icon"><FiUser /></span>Nom complet</div>
            <div className="info-value">{userInfo.fullName}</div>
          </div>
          
          <div className="info-row">
            <div className="info-label"><span className="info-label-icon"><FiPhone /></span>Téléphone</div>
            <div className="info-value">+{userInfo.phone}</div>
          </div>
          
          <div className="info-row">
            <div className="info-label"><span className="info-label-icon"><FiMessageCircle /></span>WhatsApp</div>
            <div className="info-value">+{userInfo.whatsapp}</div>
          </div>
          
          {userInfo.addressDescription && (
            <div className="info-row address-row">
              <div className="info-label"><span className="info-label-icon"><FiMapPin /></span>Adresse</div>
              <div className="info-value">{userInfo.addressDescription}</div>
            </div>
          )}
          
          {selectedLocation && (
            <div className="info-row">
              <div className="info-label"><span className="info-label-icon"><FiMap /></span>District</div>
              <div className="info-value">{selectedLocation.name}</div>
            </div>
          )}

          <div className="info-row">
            <div className="info-label"><span className="info-label-icon"><FiClock /></span>Horaires</div>
            <div className="info-value">8:00 - 21:00</div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="success-actions">
          <button type="button" className="download-btn" onClick={handleDownloadApp}>
            <FiDownload aria-hidden="true" />
            <span>Télécharger l'app</span>
          </button>
          <button type="button" className="whatsapp-btn" onClick={handleWhatsAppContact}>
            <FaWhatsapp aria-hidden="true" />
            <span>Nous contacter sur WhatsApp</span>
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
