import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination, Navigation } from 'swiper/modules'
import { bundleAPI } from '../services/api'
import {
  beginCheckoutFunnel,
  getCheckoutQuantityExperiment,
  trackProductLandingView
} from '../services/checkoutFunnelAnalytics'
import { useAdTrackingContext } from '../hooks/useAdTrackingHooks.js'
import ServiceInfo from './ServiceInfo'
import logoImage from '../assets/logo.png'

import 'swiper/css'
import 'swiper/css/pagination'
import 'swiper/css/navigation'
import './BundleDetail.css'

const BUNDLE_UNAVAILABLE_FR = "Ce pack n'est plus disponible. Veuillez consulter d'autres produits."
const GENERIC_BUNDLE_FETCH_ERROR_FR = 'Échec de récupération des informations du pack'

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

const BundleDetail = ({ bundleId, initialBundle = null }) => {
  const navigate = useNavigate()
  const { adId, isLoading: adTrackingLoading } = useAdTrackingContext()
  const [bundle, setBundle] = useState(initialBundle)
  const [loading, setLoading] = useState(!initialBundle)
  const [error, setError] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const viewTrackedBundleRef = useRef(null)
  const checkoutQuantityExperiment = useMemo(() => getCheckoutQuantityExperiment(), [])
  const isCheckoutOptimizationVariant = checkoutQuantityExperiment.checkout_quantity_variant === 'inline_quantity'

  const bundleProduct = useMemo(() => {
    if (!bundle) return null
    return {
      product_id: `bundle:${bundle.id}`,
      name_fr: bundle.title_fr,
      price: bundle.cfa_price,
      image_url: bundle.cover_image_url ? [bundle.cover_image_url] : [],
      stock: 99,
      skus: [],
      product_type: 'bundle'
    }
  }, [bundle])

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [bundleId])

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

    try {
      trackProductLandingView(bundleProduct, {
        ad_id: adId,
        product_type: 'bundle',
        bundle_id: String(bundle.id)
      })
    } catch (landingError) {
      console.warn('bundle product_landing_view 埋点失败:', landingError)
    }
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

    navigate('/payment?step=1', {
      state: {
        bundle,
        quantity,
        productType: 'bundle',
        checkoutSessionId,
        checkoutQuantityExperiment
      }
    })
  }

  const totalPrice = (bundle.cfa_price || 0) * quantity
  const detailImages = Array.isArray(bundle.detail_images) ? bundle.detail_images : []
  const items = Array.isArray(bundle.items) ? bundle.items : []
  const galleryImages = bundle.cover_image_url ? [bundle.cover_image_url] : []

  return (
    <div className="product-detail bundle-detail">
      {/* 顶部标题栏 */}
      <div className="product-header">
        <button type="button" className="back-btn" onClick={() => navigate('/')}>
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
              modules={[Pagination, Navigation]}
              spaceBetween={0}
              slidesPerView={1}
              pagination={{ clickable: true }}
              navigation={true}
              className="main-swiper"
            >
              {galleryImages.map((image, index) => (
                <SwiperSlide key={`bundle-${bundle.id}-cover-${index}`}>
                  <div className="image-container">
                    <img src={image} alt={bundle.title_fr || `Pack ${bundle.id}`} />
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
            </div>

            {isCheckoutOptimizationVariant && (
              <div className="delivery-benefit-pill">
                Livraison gratuite à Abidjan sous 24h
              </div>
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

          <ServiceInfo variant={isCheckoutOptimizationVariant ? 'benefits' : 'classic'} />

          {/* 包含产品列表 */}
          {items.length > 0 && (
            <div className="bundle-items-section">
              <h3 className="bundle-items-title">Produits inclus</h3>
              <ul className="bundle-items-list">
                {items.map((item, index) => (
                  <li key={`bundle-item-${item.product_id}-${index}`} className="bundle-item">
                    {item.cover_image_url ? (
                      <img
                        className="bundle-item-image"
                        src={item.cover_image_url}
                        alt={item.product_name_fr || ''}
                        loading="lazy"
                      />
                    ) : (
                      <div className="bundle-item-image bundle-item-image-placeholder" />
                    )}
                    <div className="bundle-item-meta">
                      <div className="bundle-item-name">{item.product_name_fr || item.internal_no}</div>
                      <div className="bundle-item-qty">×{item.quantity || 1}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bottom-actions">
            {isCheckoutOptimizationVariant && (
              <div className="cta-trust-note">
                Aucun paiement maintenant. Vous payez à la réception.
              </div>
            )}
            <button type="button" className="buy-now-btn" onClick={handleBuyNow}>
              Acheter maintenant - Paiement à la livraison
            </button>
          </div>
        </div>
      </div>

      {/* 描述 + 详情图 */}
      <div className="product-description">
        <h3>Détails du pack</h3>
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default BundleDetail
