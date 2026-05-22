import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { bundleAPI } from '../services/api'
import './ProductList.css'
import './BundleList.css'

const PAGE_SIZE = 20
const BUNDLE_FAKE_DISCOUNT_MIN = 52
const BUNDLE_FAKE_DISCOUNT_RANGE = 17

const formatPrice = (value) => Number(value || 0).toLocaleString('fr-FR')

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

const getBundleCover = (bundle) => (
  bundle?.cover_image_url
  || (Array.isArray(bundle?.detail_images) ? bundle.detail_images[0] : null)
)

const BundleList = () => {
  const [bundles, setBundles] = useState([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const navigate = useNavigate()
  const observerRef = useRef()

  const loadBundles = useCallback(async (pageNum = 1) => {
    try {
      if (pageNum === 1) {
        setInitialLoading(true)
      } else {
        setLoading(true)
      }

      const data = await bundleAPI.getBundleList({
        page: pageNum,
        page_size: PAGE_SIZE
      })
      const bundleList = data?.items || []

      if (pageNum === 1) {
        setBundles(bundleList)
      } else {
        setBundles((prev) => [...prev, ...bundleList])
      }

      const hasMoreData = data?.total
        ? pageNum * PAGE_SIZE < data.total
        : bundleList.length === PAGE_SIZE
      setHasMore(hasMoreData)
    } catch (err) {
      console.error('加载组合产品失败:', err)
      setError('Échec de récupération des packs')
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }, [])

  useEffect(() => {
    setBundles([])
    setHasMore(true)
    setError(null)
    loadBundles(1)
  }, [loadBundles])

  const lastBundleElementCallback = useCallback((node) => {
    if (loading) return
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        const nextPage = Math.floor(bundles.length / PAGE_SIZE) + 1
        loadBundles(nextPage)
      }
    })

    if (node) observerRef.current.observe(node)
  }, [bundles.length, hasMore, loadBundles, loading])

  const handleBundleClick = (bundle) => {
    navigate(`/bundle/${bundle.id}`)
  }

  if (initialLoading) {
    return (
      <div className="product-list-container">
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`bundle-skeleton-${index}`} className="product-card skeleton">
              <div className="skeleton-image"></div>
              <div className="skeleton-content">
                <div className="skeleton-title"></div>
                <div className="skeleton-price"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error && bundles.length === 0) {
    return (
      <div className="product-list-container">
        <div className="error-state">
          <p className="error-message">{error}</p>
          <button
            type="button"
            className="retry-button"
            onClick={() => loadBundles(1)}
          >
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  if (!initialLoading && bundles.length === 0) {
    return (
      <div className="product-list-container">
        <div className="empty-state">
          <p className="empty-message">Aucun pack disponible pour le moment</p>
        </div>
      </div>
    )
  }

  return (
    <div className="product-list-container">
      <div className="product-grid">
        {bundles.map((bundle, index) => {
          const isLast = index === bundles.length - 1
          const cover = getBundleCover(bundle)
          const displayDiscount = getBundleDisplayDiscount(bundle.id)
          const displayOriginalPrice = getBundleDisplayOriginalPrice(bundle.cfa_price, displayDiscount)

          return (
            <div
              key={bundle.id}
              ref={isLast ? lastBundleElementCallback : null}
              className="product-card bundle-card"
              onClick={() => handleBundleClick(bundle)}
              onKeyDown={(e) => e.key === 'Enter' && handleBundleClick(bundle)}
              role="button"
              tabIndex={0}
            >
              <div className="product-image-container bundle-image-container">
                {cover ? (
                  <img
                    src={cover}
                    alt={bundle.title_fr}
                    className="product-image bundle-image"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="bundle-image-placeholder">Pack</div>
                )}
                <div className="discount-badge">-{displayDiscount}%</div>
                <div className="bundle-pack-badge">Pack</div>
              </div>

              <div className="product-info">
                <h3 className="product-name">{bundle.title_fr}</h3>
                {bundle.items_count > 0 && (
                  <div className="bundle-count">{bundle.items_count} produits inclus</div>
                )}
                <div className="price-section">
                  <div className="current-price">{formatPrice(bundle.cfa_price)} FCFA</div>
                  {displayOriginalPrice && displayOriginalPrice > Number(bundle.cfa_price || 0) && (
                    <div className="original-price">{formatPrice(displayOriginalPrice)} FCFA</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {loading && (
        <div className="loading-more">
          <div className="loading-spinner"></div>
          <p>Chargement...</p>
        </div>
      )}

      {!hasMore && bundles.length > 0 && (
        <div className="no-more-data">
          <p>Tous les packs ont été chargés</p>
        </div>
      )}
    </div>
  )
}

export default BundleList
