import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import {
  FiCheck,
  FiChevronDown,
  FiCreditCard,
  FiTruck,
} from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa'
import { appDownloadAPI } from '../services/api'
import { trackCheckoutEvent } from '../services/checkoutFunnelAnalytics'
import { getWhatsAppCustomerGroup, WHATSAPP_GROUP_CLICK_EVENT } from '../config/customerCommunity'
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
  const whatsappGroup = getWhatsAppCustomerGroup({
    phone: userInfo?.phone,
    orderId: orderResponse?.order_no || orderResponse?.order_id
  })

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [])

  useEffect(() => {
    if (isCompleteOrderSuccessState(orderSuccessState) && !previewState) {
      saveCachedOrderSuccessState(orderSuccessState)
    }
  }, [orderSuccessState, previewState])

  useEffect(() => {
    if (previewState || hasLoadedDownloadLinks) return

    appDownloadAPI.getDownloadLinks()
      .then((links) => {
        cachedDownloadLinks = mergeDownloadLinks(links)
        hasLoadedDownloadLinks = true
      })
      .catch((error) => {
        console.warn('app download links preload failed:', error)
      })
  }, [previewState])

  // 如果没有订单信息，重定向回首页
  useEffect(() => {
    if (!product || !quantity || !userInfo || !selectedLocation) {
      navigate('/')
    }
  }, [product, quantity, userInfo, selectedLocation, navigate])

  const trackSuccessPageAction = (eventName, properties = {}) => {
    if (previewState) return
    try {
      trackCheckoutEvent(eventName, {
        page_name: 'order_success',
        order_id: orderResponse?.order_id ? String(orderResponse.order_id) : null,
        order_no: orderResponse?.order_no || null,
        ...properties
      })
    } catch (error) {
      // Analytics must never prevent opening WhatsApp or the app store.
      console.warn('order success action tracking failed:', error)
    }
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

  const handleWhatsAppGroup = () => {
    // Preserve the confirmation page when the customer returns from WhatsApp.
    if (!previewState) saveCachedOrderSuccessState(orderSuccessState)
    trackSuccessPageAction(WHATSAPP_GROUP_CLICK_EVENT, { whatsapp_group_id: whatsappGroup.id })
    // The anchor navigates normally; a click is not a confirmed group membership.
  }

  if (!product || !quantity || !userInfo || !selectedLocation) {
    return (
      <div className="order-success-page" aria-busy="true">
        <p className="os-loading">Chargement de votre commande…</p>
      </div>
    )
  }

  const amount = Number(totalPrice ?? product.price * quantity)
  const formattedAmount = Number.isFinite(amount) ? amount.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) : '—'
  const productImage = Array.isArray(product.image_url) ? product.image_url[0] : product.image_url
  const displayPhone = (phone) => phone ? `+${String(phone).replace(/^\+/, '')}` : '—'

  return (
    <div className="order-success-page">
      <div className="os-container">
        <header className="os-brand-header">
          <button type="button" className="os-brand" aria-label="Retour à l’accueil Brainnel" onClick={() => navigate('/')}>
            <img src="/logo.png" width="24" height="24" alt="" /><span>brainnel</span>
          </button>
          {orderResponse?.order_no && <span className="os-order-reference">{orderResponse.order_no}</span>}
        </header>

        <main>
          <section className="os-confirmation" aria-labelledby="os-confirmation-title">
            <span className="os-check"><FiCheck aria-hidden="true" /></span>
            <h1 id="os-confirmation-title">Commande confirmée</h1>
            <p>Merci pour votre confiance.</p>
          </section>

          <section className="os-community" aria-labelledby="os-community-title">
            <h2 id="os-community-title">Le groupe clients Brainnel</h2>
            <p>Nouveautés et offres clients, sur WhatsApp.</p>
            <a className="os-join-group" href={whatsappGroup.url} onClick={handleWhatsAppGroup} aria-label="Rejoindre le groupe WhatsApp Brainnel">
              <FaWhatsapp aria-hidden="true" /><span>Rejoindre le groupe</span>
            </a>
          </section>

          <section className="os-delivery" aria-label="Livraison et paiement">
            <div><FiTruck aria-hidden="true" /><p><strong>Livraison gratuite sous 48 h</strong><span>À domicile, à Abidjan. Le livreur vous appellera.</span></p></div>
            <div><FiCreditCard aria-hidden="true" /><p><strong>Paiement à la livraison</strong><span>En cash ou avec Wave.</span></p></div>
          </section>

          <details className="os-order-details">
            <summary><span>Votre commande</span><strong>{formattedAmount} FCFA</strong><FiChevronDown aria-hidden="true" /></summary>
            <div className="os-detail-content">
              <div className="os-product">
                {productImage && <img src={productImage} alt="" loading="lazy" decoding="async" />}
                <div><strong>{product.name_fr}</strong><span>Quantité : {quantity}</span></div>
              </div>
              <dl className="os-recipient">
                <div><dt>Nom complet</dt><dd>{userInfo.fullName}</dd></div>
                <div><dt>Téléphone</dt><dd>{displayPhone(userInfo.phone)}</dd></div>
                <div><dt>WhatsApp</dt><dd>{displayPhone(userInfo.whatsapp)}</dd></div>
                {userInfo.addressDescription && <div><dt>Adresse</dt><dd>{userInfo.addressDescription}</dd></div>}
                <div><dt>District</dt><dd>{selectedLocation.name}</dd></div>
                <div><dt>Horaires</dt><dd>8:00 - 21:00</dd></div>
              </dl>
            </div>
          </details>

          <nav className="os-secondary" aria-label="Autres options">
            <button type="button" onClick={handleWhatsAppContact}>Service client</button><span aria-hidden="true">·</span>
            <button type="button" onClick={handleDownloadApp}>L’app Brainnel</button>
          </nav>
        </main>
      </div>
    </div>
  )
}

export default OrderSuccessPage
