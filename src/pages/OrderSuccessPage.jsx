import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import {
  FiCheck,
  FiChevronDown,
  FiCreditCard,
  FiTruck,
} from 'react-icons/fi'
import { appDownloadAPI } from '../services/api'
import { trackCheckoutEvent } from '../services/checkoutFunnelAnalytics'
import { pidForProduct } from '../services/dramaPicks'
import DramaPicksCard, { DramaPicksBoundary } from '../components/DramaPicksCard'
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

// Dev-only: babidrama.com refuses requests from outside Côte d'Ivoire, so
// `&preview_drama=1` feeds the card a static picks response instead. Its
// episodes play a 10 s test video served by scripts/preview_readonly_api.py
// (npm run preview:local); the third series answers 404 (cover + link).
const previewDramaCover = (from, to, label) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="300" height="400" fill="url(#g)"/><text x="150" y="360" fill="#fff" font-family="sans-serif" font-size="34" font-weight="700" text-anchor="middle">${label}</text></svg>`
)}`

const previewDramaEpisode = (slug, title, hasNext, index = 1, nextInline = false) => {
  const media = `${typeof window === 'undefined' ? 'http://127.0.0.1:4173' : window.location.origin}/__preview/api/bdtest`
  return {
    slug, title, episodeIndex: index, durationS: 10, posterUrl: `${media}/poster.jpg`, urls: { '480p': `${media}/episode-480p.mp4` },
    watchUrl: `https://babidrama.com/w/${slug}/${index}?c=brainnel`, nextUrl: hasNext ? `https://babidrama.com/w/${slug}/${index + 1}?c=brainnel` : null,
    nextInline
  }
}

const getDevDramaPreview = (search) => {
  if (!import.meta.env.DEV) return null
  const params = new URLSearchParams(search)
  if (params.get('preview_order_success') !== '1' || params.get('preview_drama') !== '1') return null

  return {
    // `&drama_variant=a|b|c|d|e|k` picks the version of the card under test (dramaPicks.js).
    variant: params.get('drama_variant'),
    // As BabiDrama sends them: e is d with the hook headline, k a d that hands over after 2 episodes.
    versions: [
      { id: 'a', weight: 0, base: 'a' },
      { id: 'd', weight: 1, base: 'd' },
      { id: 'e', weight: 1, base: 'd', hook: true },
      { id: 'k', weight: 0, base: 'd', handoffAfter: 2 }
    ],
    episodes: {
      // Three free episodes: variant d plays them one after the other, then hands over.
      'le-mari-infidele': previewDramaEpisode('le-mari-infidele', 'Le Mari infidèle', true, 1, true),
      'le-mari-infidele#2': previewDramaEpisode('le-mari-infidele', 'Le Mari infidèle', true, 2, true),
      'le-mari-infidele#3': previewDramaEpisode('le-mari-infidele', 'Le Mari infidèle', true, 3, false),
      'la-reine-de-cocody': previewDramaEpisode('la-reine-de-cocody', 'La Reine de Cocody', false)
    },
    pid: '946101641067',
    mode: 'explore',
    series: [
      {
        slug: 'le-mari-infidele', title: 'Le Mari infidèle', genres: ['Romance', 'Vengeance'], episodeCount: 73, freeEpisodes: 5,
        hook: '💔 Elle surprend son mari avec sa meilleure amie le jour de leur anniversaire. Trois ans plus tard, elle revient en héritière d’un empire… et elle n’a rien oublié.',
        coverUrl: previewDramaCover('#3b1d4a', '#ff3d7f', 'Le Mari'), watchUrl: 'https://babidrama.com/w/le-mari-infidele/1?c=brainnel'
      },
      {
        slug: 'la-reine-de-cocody', title: 'La Reine de Cocody', genres: ['Drame', 'Famille'], episodeCount: 60, freeEpisodes: 6,
        hook: '👑 Servante le jour, PDG la nuit : personne ne connaît son vrai nom.',
        coverUrl: previewDramaCover('#1d2f4a', '#ff7a1a', 'La Reine'), watchUrl: 'https://babidrama.com/w/la-reine-de-cocody/1?c=brainnel'
      },
      {
        slug: 'le-milliardaire-cache', title: 'Le Milliardaire caché parmi nous', genres: ['Romance'], episodeCount: 81, freeEpisodes: 5,
        hook: '💸 Humilié à son mariage, il dévoile enfin qui il est vraiment.',
        coverUrl: null, watchUrl: 'https://babidrama.com/w/le-milliardaire-cache/1?c=brainnel'
      }
    ]
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
  const dramaPreview = useMemo(
    () => (previewState ? getDevDramaPreview(location.search) : null),
    [previewState, location.search]
  )
  const dramaPid = pidForProduct(product)

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

  // Preserve the confirmation page when the customer returns from BabiDrama.
  const handleDramaLeave = () => {
    if (!previewState) saveCachedOrderSuccessState(orderSuccessState)
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

          <DramaPicksBoundary onError={() => trackSuccessPageAction('order_success_drama_render_failed')}>
            <DramaPicksCard
              key={dramaPid || 'none'}
              pid={dramaPid}
              impressionKey={String(orderResponse?.order_no || orderResponse?.order_id || '')}
              preview={dramaPreview}
              onTrack={trackSuccessPageAction}
              onLeave={handleDramaLeave}
            />
          </DramaPicksBoundary>

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
