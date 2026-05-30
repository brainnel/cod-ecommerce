import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import {
  FiCheckCircle,
  FiClock,
  FiCreditCard,
  FiDownload,
  FiGift,
  FiHome,
  FiMap,
  FiMapPin,
  FiMessageCircle,
  FiPhone,
  FiTruck,
  FiUser
} from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import { appDownloadAPI } from '../services/api'
import { trackCheckoutEvent } from '../services/checkoutFunnelAnalytics'
import './OrderSuccessPage.css'

const FALLBACK_DOWNLOAD_LINKS = {
  ios: { url: 'https://apps.apple.com/app/id6760172301', version: '' },
  android: { url: 'https://play.google.com/store/apps/details?id=com.brainnel.vite', version: '' },
  apk: { url: 'https://api.brainnel.com/static/app/brainnel.apk', version: '' }
}

// 缓存下载链接，避免重复请求；点击时先用兜底链接，不能被接口慢响应卡住。
let cachedDownloadLinks = FALLBACK_DOWNLOAD_LINKS
let hasLoadedDownloadLinks = false
const ORDER_SUCCESS_STATE_STORAGE_KEY = 'cod_order_success_state_v1'
const ORDER_SUCCESS_STATE_TTL_MS = 2 * 60 * 60 * 1000

const isCompleteOrderSuccessState = (state) => (
  Boolean(state?.product && state?.quantity && state?.userInfo && state?.selectedLocation)
)

const loadCachedOrderSuccessState = () => {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(ORDER_SUCCESS_STATE_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    const savedAt = Number(parsed?.savedAt || 0)
    if (!savedAt || Date.now() - savedAt > ORDER_SUCCESS_STATE_TTL_MS) {
      window.sessionStorage.removeItem(ORDER_SUCCESS_STATE_STORAGE_KEY)
      return null
    }

    return isCompleteOrderSuccessState(parsed?.state) ? parsed.state : null
  } catch (error) {
    console.warn('order success cache read failed:', error)
    return null
  }
}

const saveCachedOrderSuccessState = (state) => {
  if (typeof window === 'undefined' || !isCompleteOrderSuccessState(state)) return

  try {
    window.sessionStorage.setItem(ORDER_SUCCESS_STATE_STORAGE_KEY, JSON.stringify({
      savedAt: Date.now(),
      state
    }))
  } catch (error) {
    console.warn('order success cache write failed:', error)
  }
}

const mergeDownloadLinks = (links) => ({
  ios: links?.ios?.url ? links.ios : FALLBACK_DOWNLOAD_LINKS.ios,
  android: links?.android?.url ? links.android : FALLBACK_DOWNLOAD_LINKS.android,
  apk: links?.apk?.url ? links.apk : FALLBACK_DOWNLOAD_LINKS.apk
})

const getPreferredDownloadUrl = () => {
  if (typeof window === 'undefined') return FALLBACK_DOWNLOAD_LINKS.android.url

  const links = mergeDownloadLinks(cachedDownloadLinks)
  const userAgent = navigator.userAgent || navigator.vendor || window.opera

  if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    return links.ios.url
  }

  if (/android/i.test(userAgent)) {
    return links.android.url
  }

  return '/download'
}

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
  const previewState = useMemo(
    () => getDevOrderSuccessPreviewState(location.search),
    [location.search]
  )
  const cachedInitialSuccessState = useMemo(() => loadCachedOrderSuccessState(), [])
  const orderSuccessState = useMemo(
    () => location.state || previewState || cachedInitialSuccessState || {},
    [location.state, previewState, cachedInitialSuccessState]
  )
  const { product, quantity, userInfo, selectedLocation, totalPrice, orderResponse } = orderSuccessState

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [])

  useEffect(() => {
    if (isCompleteOrderSuccessState(orderSuccessState) && !previewState) {
      saveCachedOrderSuccessState(orderSuccessState)
    }
  }, [orderSuccessState, previewState])

  useEffect(() => {
    if (hasLoadedDownloadLinks) return

    appDownloadAPI.getDownloadLinks()
      .then((links) => {
        cachedDownloadLinks = mergeDownloadLinks(links)
        hasLoadedDownloadLinks = true
      })
      .catch((error) => {
        console.warn('app download links preload failed:', error)
      })
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
    redirectToAppStore()
  }

  const redirectToAppStore = () => {
    saveCachedOrderSuccessState(orderSuccessState)
    window.location.assign(getPreferredDownloadUrl())
  }

  const handleWhatsAppContact = () => {
    trackSuccessPageAction('order_success_whatsapp_contact_click')
    const phoneNumber = '8615167909497'
    const whatsappUrl = `https://wa.me/${phoneNumber}`
    saveCachedOrderSuccessState(orderSuccessState)
    window.location.assign(whatsappUrl)
  }

  if (!product || !quantity || !userInfo || !selectedLocation) {
    return (
      <div className="order-success-page">
        <div className="order-success-header">
          <button type="button" className="back-btn" onClick={() => navigate('/')}>
            <FiHome aria-hidden="true" />
          </button>
          <h1 className="header-title">Commande confirmée</h1>
        </div>
      </div>
    )
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
          <div className="download-action-block">
            <div className="download-benefit-pill">
              <FiGift aria-hidden="true" />
              <span>Offres spéciales sur votre prochaine commande</span>
            </div>
            <button type="button" className="download-btn" onClick={handleDownloadApp}>
              <FiDownload aria-hidden="true" />
              <span>Télécharger l'app Brainnel</span>
            </button>
          </div>
          <button type="button" className="whatsapp-btn" onClick={handleWhatsAppContact}>
            <FaWhatsapp aria-hidden="true" />
            <span>Nous contacter sur WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default OrderSuccessPage
