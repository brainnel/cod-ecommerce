import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination, Navigation, Autoplay } from 'swiper/modules'
import { bundleAPI } from '../services/api'
import {
  beginCheckoutFunnel,
  buildCheckoutProductProperties,
  getCheckoutQuantityExperiment,
  isAddressFirstCheckoutVariant,
  isCodTrustLandingVariant,
  isInlineCheckoutVariant,
  isSinglePageCheckoutVariant,
  trackCheckoutEvent,
  trackProductLandingEngagement,
  trackProductLandingView,
  trackProductReviewTabClick
} from '../services/checkoutFunnelAnalytics'
import { useAdTrackingContext } from '../hooks/useAdTrackingHooks.js'
import ServiceInfo from './ServiceInfo'
import ProductReviewsPanel, { getDisplayProductReviews } from './ProductReviewsPanel'
import logoImage from '../assets/logo.png'
import {
  getLocalPreviewBrowserContextParam,
  syncLocalPreviewBrowserContextFromSearch
} from '../utils/checkoutBrowserContextPreview'
import { saveCheckoutPaymentState } from '../utils/checkoutPaymentStateCache'
import { preloadPaymentPage, schedulePaymentPagePreload } from '../utils/preloadRoutes'
import Countdown from './Countdown'

import 'swiper/css'
import 'swiper/css/pagination'
import 'swiper/css/navigation'
import './BundleDetail.css'

const BUNDLE_UNAVAILABLE_FR = "Ce pack n'est plus disponible. Veuillez consulter d'autres produits."
const GENERIC_BUNDLE_FETCH_ERROR_FR = 'Échec de récupération des informations du pack'
const MAX_PROMOTED_DETAIL_IMAGES = 4
const BUNDLE_FAKE_DISCOUNT_MIN = 52
const BUNDLE_FAKE_DISCOUNT_RANGE = 17

const getBundleFetchErrorMessage = (err) => {
  if (err?.response?.status === 404) {
    return BUNDLE_UNAVAILABLE_FR
  }
  return GENERIC_BUNDLE_FETCH_ERROR_FR
}

const formatFcfa = (value) => {
  const num = Number(value || 0)
  return num.toLocaleString('fr-FR')
}

const hashString = (value) => {
  const text = String(value || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

const getBundleDisplayDiscount = (bundleId) => (
  BUNDLE_FAKE_DISCOUNT_MIN + (hashString(bundleId) % BUNDLE_FAKE_DISCOUNT_RANGE)
)

const getBundleDisplayOriginalPrice = (price, discountPercent) => {
  const bundlePrice = Number(price || 0)
  const discountRate = Number(discountPercent || 0) / 100
  if (!bundlePrice || discountRate <= 0 || discountRate >= 1) return null
  return Math.round(bundlePrice / (1 - discountRate))
}

const getBundleItemDisplayName = (item) => (
  item?.product_name_fr
  || item?.product_name_cn
  || item?.title_fr
  || item?.name_fr
  || item?.name_cn
  || `Produit ${item?.product_id || ''}`.trim()
)

const BundleDetail = ({ bundleId, initialBundle = null }) => {
  const navigate = useNavigate()
  const { adId, isLoading: adTrackingLoading } = useAdTrackingContext()
  const [bundle, setBundle] = useState(initialBundle)
  const [loading, setLoading] = useState(!initialBundle)
  const [error, setError] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [activeBundleInfoTab, setActiveBundleInfoTab] = useState('details')
  const viewTrackedBundleRef = useRef(null)
  const landingEngagementRef = useRef(null)
  const checkoutQuantityExperiment = useMemo(() => getCheckoutQuantityExperiment(), [])
  const isCheckoutOptimizationVariant = isInlineCheckoutVariant(checkoutQuantityExperiment)
  const isCodTrustLanding = isCodTrustLandingVariant(checkoutQuantityExperiment)
  const isAddressFirstLanding = isAddressFirstCheckoutVariant(checkoutQuantityExperiment)
    || isSinglePageCheckoutVariant(checkoutQuantityExperiment)
  const bundleSwiperModules = [Pagination, Navigation, Autoplay]

  const bundleProduct = useMemo(() => {
    if (!bundle) return null
    return {
      product_id: `bundle:${bundle.id}`,
      name_fr: bundle.title_fr,
      price: bundle.cfa_price,
      image_url: bundle.cover_image_url ? [bundle.cover_image_url] : [],
      stock: 99,
      skus: [],
      product_type: 'bundle',
      reviews: bundle.reviews || bundle.product_reviews || []
    }
  }, [bundle])
  const bundleReviews = useMemo(() => getDisplayProductReviews(bundleProduct), [bundleProduct])

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [bundleId])

  useEffect(() => {
    syncLocalPreviewBrowserContextFromSearch(window.location.search)
  }, [])

  useEffect(() => {
    setActiveBundleInfoTab('details')
  }, [bundleId])

  useEffect(() => {
    if (!bundle || error) return undefined
    return schedulePaymentPagePreload()
  }, [bundle?.id, error])

  useEffect(() => {
    let cancelled = false
    const fetchBundle = async () => {
      if (initialBundle) {
        setBundle(initialBundle)
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        const data = await bundleAPI.getBundleDetail(bundleId)
        if (!cancelled) {
          setBundle(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(getBundleFetchErrorMessage(err))
        }
        console.error('Error fetching bundle:', err)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    fetchBundle()
    return () => {
      cancelled = true
    }
  }, [bundleId, initialBundle])

  useEffect(() => {
    if (!bundleProduct || !bundle?.id) return
    if (adTrackingLoading) return

    const trackingKey = String(bundle.id)
    if (viewTrackedBundleRef.current === trackingKey) return
    viewTrackedBundleRef.current = trackingKey

    let cleanupLandingEngagement = null
    try {
      const landingSessionId = trackProductLandingView(bundleProduct, {
        ad_id: adId,
        product_type: 'bundle',
        bundle_id: String(bundle.id)
      })
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      landingEngagementRef.current = {
        landingSessionId,
        startedAt,
        maxScrollPercent: 0,
        passiveSent: false,
        checkoutClickSent: false
      }

      const updateMaxScrollPercent = () => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return
        const state = landingEngagementRef.current
        if (!state) return
        const doc = document.documentElement
        const scrollable = Math.max(doc.scrollHeight - window.innerHeight, 1)
        const current = Math.min(Math.max((window.scrollY / scrollable) * 100, 0), 100)
        state.maxScrollPercent = Math.max(
          state.maxScrollPercent,
          current
        )
      }

      const sendLandingEngagement = (reason) => {
        const state = landingEngagementRef.current
        if (!state?.landingSessionId) return
        const isCheckoutClick = reason === 'checkout_click'
        if (isCheckoutClick && state.checkoutClickSent) return
        if (!isCheckoutClick && (state.passiveSent || state.checkoutClickSent)) return
        updateMaxScrollPercent()
        if (isCheckoutClick) {
          state.checkoutClickSent = true
        } else {
          state.passiveSent = true
        }
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
        try {
          trackProductLandingEngagement(bundleProduct, {
            ad_id: adId,
            product_type: 'bundle',
            bundle_id: String(bundle.id),
            landing_session_id: state.landingSessionId,
            landing_duration_ms: now - state.startedAt,
            landing_max_scroll_percent: state.maxScrollPercent,
            landing_exit_reason: reason
          })
        } catch (error) {
          console.warn('组合品落地页停留埋点失败:', error)
        }
      }

      landingEngagementRef.current.send = sendLandingEngagement

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          sendLandingEngagement('visibility_hidden')
        }
      }
      const handlePageHide = () => sendLandingEngagement('pagehide')

      window.addEventListener('scroll', updateMaxScrollPercent, { passive: true })
      document.addEventListener('visibilitychange', handleVisibilityChange)
      window.addEventListener('pagehide', handlePageHide)

      cleanupLandingEngagement = () => {
        window.removeEventListener('scroll', updateMaxScrollPercent)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('pagehide', handlePageHide)
        sendLandingEngagement('unmount')
      }
    } catch (landingError) {
      console.warn('bundle product_landing_view 埋点失败:', landingError)
    }

    return cleanupLandingEngagement || undefined
  }, [adId, adTrackingLoading, bundle?.id, bundleProduct])

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Chargement...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="error-container">
        <p>{error}</p>
        <button type="button" className="error-home-btn" onClick={() => navigate('/')}>
          Voir d'autres produits
        </button>
      </div>
    )
  }

  if (!bundle) {
    return (
      <div className="error-container">
        <p>Les informations du pack n'existent pas</p>
        <button type="button" className="error-home-btn" onClick={() => navigate('/')}>
          Voir d'autres produits
        </button>
      </div>
    )
  }

  const handleQtyChange = (next) => {
    if (next >= 1 && next <= 99) {
      setQuantity(next)
    }
  }

  const handleBuyNow = () => {
    preloadPaymentPage()
    try {
      landingEngagementRef.current?.send?.('checkout_click')
    } catch (error) {
      console.warn('组合品落地页下单点击埋点失败:', error)
    }

    let checkoutSessionId = null
    try {
      checkoutSessionId = beginCheckoutFunnel(bundleProduct, {
        quantity,
        total_price: totalPrice,
        ad_id: adId,
        product_type: 'bundle',
        bundle_id: String(bundle.id),
        ...checkoutQuantityExperiment
      })
    } catch (error) {
      console.warn('bundle checkout_start 埋点失败:', error)
    }

    if (checkoutSessionId && bundleProduct) {
      try {
        trackCheckoutEvent('quantity_confirmed', buildCheckoutProductProperties(bundleProduct, {
          quantity,
          total_price: totalPrice,
          ad_id: adId,
          product_type: 'bundle',
          bundle_id: String(bundle.id),
          quantity_confirm_method: 'bundle_detail_quantity',
          ...checkoutQuantityExperiment
        }), { sessionId: checkoutSessionId })
      } catch (error) {
        console.warn('bundle quantity_confirmed 埋点失败:', error)
      }
    }

    const paymentState = {
      bundle,
      quantity,
      productType: 'bundle',
      checkoutSessionId,
      checkoutQuantityExperiment,
      quantityConfirmed: true
    }
    saveCheckoutPaymentState(paymentState)
    navigate(`/payment?step=1${getLocalPreviewBrowserContextParam()}`, {
      state: paymentState
    })
  }

  const handleBundleInfoTabClick = (tab) => {
    setActiveBundleInfoTab(tab)
    if (tab !== 'reviews' || activeBundleInfoTab === 'reviews' || !bundleProduct) return

    try {
      trackProductReviewTabClick(bundleProduct, {
        ad_id: adId,
        product_type: 'bundle',
        bundle_id: String(bundle.id),
        review_count: bundleReviews.length
      })
    } catch (error) {
      console.warn('bundle product_review_tab_click 埋点失败:', error)
    }
  }

  const totalPrice = (bundle.cfa_price || 0) * quantity
  const detailImages = Array.isArray(bundle.detail_images) ? bundle.detail_images : []
  const items = Array.isArray(bundle.items) ? bundle.items : []
  const coverImages = bundle.cover_image_url ? [bundle.cover_image_url] : []
  const promotedDetailImages = coverImages.length <= 1
    ? detailImages.slice(0, MAX_PROMOTED_DETAIL_IMAGES)
    : []
  const galleryImages = [
    ...coverImages.map((src) => ({ src, type: 'main' })),
    ...promotedDetailImages.map((src) => ({ src, type: 'detail-preview' }))
  ]
  const displayDiscount = getBundleDisplayDiscount(bundle.id)
  const displayOriginalPrice = getBundleDisplayOriginalPrice(bundle.cfa_price, displayDiscount)
  const bundleGalleryAutoplay = galleryImages.length > 1
    ? {
        delay: 3500,
        disableOnInteraction: true,
        pauseOnMouseEnter: true
      }
    : false
  const renderBundleItem = (item, index) => {
    const itemDisplayName = getBundleItemDisplayName(item)
    return (
      <li key={`bundle-item-${item.product_id}-${index}`} className="bundle-item">
        <button
          type="button"
          className="bundle-item-link"
          onClick={() => navigate(`/product/${item.product_id}${getLocalPreviewBrowserContextParam('', '?')}`)}
          aria-label={`Voir ${itemDisplayName}`}
        >
          {item.cover_image_url ? (
            <img
              className="bundle-item-image"
              src={item.cover_image_url}
              alt={itemDisplayName}
              loading="lazy"
            />
          ) : (
            <div className="bundle-item-image bundle-item-image-placeholder" />
          )}
          <div className="bundle-item-meta">
            <div className="bundle-item-name">{itemDisplayName}</div>
            <div className="bundle-item-qty">×{item.quantity || 1}</div>
          </div>
        </button>
      </li>
    )
  }

  return (
    <div className="product-detail bundle-detail">
      {/* 顶部标题栏 */}
      <div className="product-header">
        <button
          type="button"
          className="back-btn"
          aria-label="Retour à l'accueil"
          onClick={() => navigate('/')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 12L5 10M5 10L12 3L19 10M5 10V20C5 20.5523 5.44772 21 6 21H9M19 10L21 12M19 10V20C19 20.5523 18.5523 21 18 21H15M9 21C9.55228 21 10 20.5523 10 20V16C10 15.4477 10.4477 15 11 15H13C13.5523 15 14 15.4477 14 16V20C14 20.5523 14.4477 21 15 21M9 21H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div
          className="logo"
          onClick={() => navigate('/')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
          role="button"
          tabIndex={0}
          title="Retour à l'accueil"
        >
          <img src={logoImage} alt="Brainnel" className="logo-image" />
        </div>
      </div>

      <div className="product-detail-main">
        {/* 主图 */}
        <div className="product-gallery">
          {galleryImages.length > 0 ? (
            <Swiper
              modules={bundleSwiperModules}
              spaceBetween={0}
              slidesPerView={1}
              pagination={{ clickable: true }}
              navigation={true}
              autoplay={bundleGalleryAutoplay}
              speed={450}
              className="main-swiper"
            >
              {galleryImages.map((image, index) => (
                <SwiperSlide key={`bundle-${bundle.id}-cover-${index}`}>
                  <div className={`image-container ${image.type === 'detail-preview' ? 'detail-preview-image' : ''}`}>
                    <img
                      src={image.src}
                      alt={bundle.title_fr || `Pack ${bundle.id}`}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      fetchPriority={index === 0 ? 'high' : index === 1 ? 'auto' : 'low'}
                      decoding="async"
                    />
                    {index > 0 && <div className="swiper-lazy-preloader" aria-hidden="true" />}
                    {index === 0 && displayDiscount > 0 && (
                      <div className="discount-badge">
                        -{displayDiscount}%
                      </div>
                    )}
                  </div>
                </SwiperSlide>
              ))}
            </Swiper>
          ) : (
            <div className="image-container bundle-no-cover">
              <span>Pas d'image</span>
            </div>
          )}
        </div>

        <div className="product-purchase-panel">
          <div className="product-info">
            <h1 className="product-title">{bundle.title_fr}</h1>

            <div className="price-section">
              <div className="current-price">{formatFcfa(bundle.cfa_price)} FCFA</div>
              {displayOriginalPrice && displayOriginalPrice > Number(bundle.cfa_price || 0) && (
                <div className="original-price">{formatFcfa(displayOriginalPrice)} FCFA</div>
              )}
              <Countdown />
            </div>

            {isCheckoutOptimizationVariant && (
              <ServiceInfo variant={isAddressFirstLanding ? 'address_first' : (isCodTrustLanding ? 'cod_trust' : 'benefits')} compact />
            )}

            {/* 数量选择器 */}
            <div className="bundle-quantity-row">
              <span className="bundle-quantity-label">Quantité :</span>
              <div className="bundle-quantity-controls">
                <button
                  type="button"
                  className="bundle-quantity-btn"
                  onClick={() => handleQtyChange(quantity - 1)}
                  disabled={quantity <= 1}
                >
                  -
                </button>
                <input
                  type="number"
                  className="bundle-quantity-input"
                  value={quantity}
                  min="1"
                  max="99"
                  onChange={(e) => handleQtyChange(parseInt(e.target.value, 10) || 1)}
                />
                <button
                  type="button"
                  className="bundle-quantity-btn"
                  onClick={() => handleQtyChange(quantity + 1)}
                  disabled={quantity >= 99}
                >
                  +
                </button>
              </div>
            </div>

            <div className="bundle-total-row">
              <span>Total :</span>
              <strong>{formatFcfa(totalPrice)} FCFA</strong>
            </div>
          </div>

          {!isCheckoutOptimizationVariant && <ServiceInfo variant="classic" />}

          {/* 包含产品列表 */}
          {items.length > 0 && (
            <div className="bundle-items-section">
              <h3 className="bundle-items-title">Produits inclus</h3>
              <ul className="bundle-items-list">
                {items.map(renderBundleItem)}
              </ul>
            </div>
          )}

          <div className="bottom-actions">
            {isCheckoutOptimizationVariant && (
              <div className={`cta-trust-note ${isCodTrustLanding ? 'cod-trust' : ''}`}>
                {isCodTrustLanding
                  ? 'Aucun paiement maintenant. Recevez le pack, puis payez en cash ou Wave.'
                  : 'Aucun paiement maintenant. À la réception, payez par Wave ou en cash.'}
              </div>
            )}
            <button type="button" className="buy-now-btn" onClick={handleBuyNow}>
              Acheter maintenant - Paiement à la livraison
            </button>
          </div>
        </div>
      </div>

      {/* 描述与评价 */}
      <div className="product-description">
        <div className="product-info-tabs" role="tablist" aria-label="Informations pack">
          <button
            type="button"
            role="tab"
            aria-selected={activeBundleInfoTab === 'details'}
            className={`product-info-tab ${activeBundleInfoTab === 'details' ? 'active' : ''}`}
            onClick={() => handleBundleInfoTabClick('details')}
          >
            Détails
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeBundleInfoTab === 'reviews'}
            className={`product-info-tab reviews-tab ${activeBundleInfoTab === 'reviews' ? 'active' : ''}`}
            onClick={() => handleBundleInfoTabClick('reviews')}
          >
            Avis clients réels
          </button>
        </div>

        {activeBundleInfoTab === 'details' ? (
          <div className="product-tab-panel" role="tabpanel">
            {bundle.description_fr && (
              <div className="description-text">
                {String(bundle.description_fr).split('\n').map((line, index) => (
                  <p key={`bundle-${bundle.id}-desc-${index}`}>{line}</p>
                ))}
              </div>
            )}
            {detailImages.length > 0 && (
              <div className="description-images">
                {detailImages.map((image, index) => (
                  <img
                    key={`bundle-${bundle.id}-detail-${index}`}
                    src={image}
                    alt={`Détails pack ${index + 1}`}
                    loading="lazy"
                    fetchPriority="low"
                    decoding="async"
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <ProductReviewsPanel reviews={bundleReviews} />
        )}
      </div>
    </div>
  )
}

export default BundleDetail
