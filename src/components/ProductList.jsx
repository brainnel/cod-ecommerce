import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { productAPI } from '../services/api'
import './ProductList.css'

const ProductList = ({ categoryId }) => {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
  const navigate = useNavigate()
  const observerRef = useRef()

  // 格式化价格
  const formatPrice = (price) => {
    return price.toString()
  }

  // 格式化折扣
  const formatDiscount = (off) => {
    return (off * 100).toFixed(0)
  }

  // 加载产品数据 - 使用useCallback包装
  const loadProducts = useCallback(async (pageNum = 1, isNewCategory = false) => {
    try {
      if (pageNum === 1) {
        setInitialLoading(true)
      } else {
        setLoading(true)
      }
      
      const params = {
        page: pageNum,
        page_size: 20
      }
      
      if (categoryId) {
        params.category_id = categoryId
      }

      const data = await productAPI.getProductList(params)

      // 处理不同的数据结构
      const productList = data?.items || data?.results || data || []
      
      if (isNewCategory || pageNum === 1) {
        setProducts(productList)
      } else {
        setProducts(prev => [...prev, ...productList])
      }

      // 检查是否还有更多数据
      const hasMoreData = data?.next || 
                         (data?.total && (pageNum * 20 < data.total)) || 
                         (productList.length === 20)
      setHasMore(hasMoreData)

    } catch (err) {
      console.error('加载产品失败:', err)
      setError('Échec de récupération des produits')
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }, [categoryId])

  // 当分类改变时重新加载
  useEffect(() => {
    setProducts([])
    setHasMore(true)
    setError(null)
    loadProducts(1, true)
  }, [categoryId, loadProducts])

  // 无限滚动的观察者
  const lastProductElementCallback = useCallback(node => {
    if (loading) return
    if (observerRef.current) observerRef.current.disconnect()
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        const nextPage = products.length / 20 + 1
        loadProducts(nextPage)
      }
    })
    
    if (node) observerRef.current.observe(node)
  }, [loading, hasMore, products.length, loadProducts])

  // 处理产品点击
  const handleProductClick = (product) => {
    // 使用真实的product_id作为路由参数，同时传递完整产品信息
    navigate(`/product/${product.product_id}`, { state: { product } })
  }

  // 初始加载状态
  if (initialLoading) {
    return (
      <div className="product-list-container">
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`skeleton-${index}`} className="product-card skeleton">
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

  // 错误状态
  if (error && products.length === 0) {
    return (
      <div className="product-list-container">
        <div className="error-state">
          <div className="error-icon">😞</div>
          <p className="error-message">{error}</p>
          <button 
            type="button"
            className="retry-button" 
            onClick={() => loadProducts(1, true)}
          >
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  // 空状态
  if (!initialLoading && products.length === 0) {
    return (
      <div className="product-list-container">
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <p className="empty-message">Aucun produit trouvé dans cette catégorie</p>
        </div>
      </div>
    )
  }

  return (
    <div className="product-list-container">
      <div className="product-grid">
        {products.map((product, index) => {
          const isLast = index === products.length - 1
          return (
            <div
              key={product.id}
              ref={isLast ? lastProductElementCallback : null}
              className="product-card"
              onClick={() => handleProductClick(product)}
              onKeyDown={(e) => e.key === 'Enter' && handleProductClick(product)}
              role="button"
              tabIndex={0}
            >
              <div className="product-image-container">
                <img 
                  src={product.image_url?.[0]} 
                  alt={product.name_fr}
                  className="product-image"
                  loading="lazy"
                  decoding="async"
                />
                {product.off > 0 && (
                  <div className="discount-badge">
                    -{formatDiscount(product.off)}%
                  </div>
                )}
              </div>
              
              <div className="product-info">
                <h3 className="product-name">{product.name_fr}</h3>
                
                <div className="price-section">
                  <div className="current-price">{formatPrice(product.price)} FCFA</div>
                  {product.original_price && product.original_price > product.price && (
                    <div className="original-price">{formatPrice(product.original_price)} FCFA</div>
                  )}
                </div>

              </div>
            </div>
          )
        })}
      </div>

      {/* 加载更多指示器 */}
      {loading && (
        <div className="loading-more">
          <div className="loading-spinner"></div>
          <p>Chargement...</p>
        </div>
      )}

      {/* 没有更多数据提示 */}
      {!hasMore && products.length > 0 && (
        <div className="no-more-data">
          <p>Tous les produits ont été chargés</p>
        </div>
      )}
    </div>
  )
}

export default ProductList
