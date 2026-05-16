import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Navigation, Autoplay } from 'swiper/modules';
import { useNavigate } from 'react-router-dom';
import { productAPI } from '../services/api';
import { trackViewContentEvent, trackAddToCartEvent, getClientInfo } from '../services/facebookConversions';
import {
  beginCheckoutFunnel,
  buildCheckoutProductProperties,
  getCheckoutQuantityExperiment,
  isCodTrustCheckoutVariant,
  isInlineCheckoutVariant,
  trackCheckoutEvent,
  trackProductLandingView
} from '../services/checkoutFunnelAnalytics';
import { useAdTrackingContext } from '../hooks/useAdTrackingHooks.js';
import Countdown from './Countdown';
import QuantityModal from './QuantityModal';
import ServiceInfo from './ServiceInfo';
import ProductVariants from './ProductVariants';
import logoImage from '../assets/logo.png';
import {
  getLocalPreviewBrowserContextParam,
  syncLocalPreviewBrowserContextFromSearch
} from '../utils/checkoutBrowserContextPreview';

const PRODUCT_UNAVAILABLE_BACKEND_MESSAGE = '此商品已下架，请查看其它商品';
const PRODUCT_UNAVAILABLE_MESSAGE_FR = "Ce produit n'est plus disponible. Veuillez consulter d'autres produits.";
const GENERIC_PRODUCT_FETCH_ERROR_FR = 'Échec de récupération des informations produit';
const PRODUCT_UNAVAILABLE_REDIRECT_SECONDS = 3;

const getBackendErrorDetail = (err) => err?.response?.data?.detail;

const getBackendErrorMessage = (err) => {
  const detail = getBackendErrorDetail(err);
  return typeof detail === 'string' ? detail : detail?.message;
};

const isUnavailableProductError = (err) => {
  const backendMessage = getBackendErrorMessage(err);
  return backendMessage === PRODUCT_UNAVAILABLE_BACKEND_MESSAGE || err?.response?.status === 404;
};

const getUnavailableCategoryId = (err) => {
  const rawCategoryId = err?.response?.data?.category_id ?? getBackendErrorDetail(err)?.category_id;
  const parsedCategoryId = Number(rawCategoryId);
  return Number.isInteger(parsedCategoryId) && parsedCategoryId > 0 ? parsedCategoryId : null;
};

const getProductListPath = (categoryId) => {
  return categoryId ? `/?category_id=${encodeURIComponent(categoryId)}` : '/';
};

const getProductFetchErrorMessage = (err) => {
  if (isUnavailableProductError(err)) {
    return PRODUCT_UNAVAILABLE_MESSAGE_FR;
  }

  return GENERIC_PRODUCT_FETCH_ERROR_FR;
};

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

const ProductDetail = ({ productId = "194", initialProduct = null }) => {
  const [product, setProduct] = useState(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);
  const [error, setError] = useState(null);
  const [errorRedirectCategoryId, setErrorRedirectCategoryId] = useState(null);
  const [redirectCountdown, setRedirectCountdown] = useState(PRODUCT_UNAVAILABLE_REDIRECT_SECONDS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [variants, setVariants] = useState([]);
  const navigate = useNavigate();
  const { adId, isLoading: adTrackingLoading } = useAdTrackingContext();
  const viewTrackedProductRef = useRef(null);
  const checkoutQuantityExperiment = useMemo(() => getCheckoutQuantityExperiment(), []);
  const isCheckoutOptimizationVariant = isInlineCheckoutVariant(checkoutQuantityExperiment);
  const isCodTrustVariant = isCodTrustCheckoutVariant(checkoutQuantityExperiment);
  const galleryImages = Array.isArray(product?.image_url) ? product.image_url : [];
  const productSwiperModules = isCodTrustVariant
    ? [Pagination, Navigation, Autoplay]
    : [Pagination, Navigation];
  const productGalleryAutoplay = isCodTrustVariant && galleryImages.length > 1
    ? {
        delay: 3500,
        disableOnInteraction: true,
        pauseOnMouseEnter: true
      }
    : false;

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [productId]);

  useEffect(() => {
    syncLocalPreviewBrowserContextFromSearch(window.location.search);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        setErrorRedirectCategoryId(null);
        let data;
        
        // 如果已经有初始产品数据，就不需要再次获取
        if (initialProduct) {
          console.log('=== 使用传递的产品数据 ===');
          console.log('产品信息:', initialProduct);
          console.log('========================');
          data = initialProduct;
          setLoading(false);
        } else {
          setLoading(true);
          data = await productAPI.getProductDetail(productId);
          setProduct(data);
          
          // 调试日志 - 显示产品信息
          console.log('=== 产品页面调试信息 ===');
          console.log('产品ID参数:', productId);
          console.log('完整产品信息:', data);
          console.log('产品名称:', data.name_fr);
          console.log('产品价格:', data.price);
          console.log('产品库存:', data.stock);
          console.log('产品图片:', data.image_url);
          console.log('真实产品ID (product_id):', data.product_id);
          console.log('SKU信息:', data.skus);
          console.log('产品组ID:', data.product_group_id);
          console.log('变体名称:', data.variant_name);
          console.log('分类ID:', data.category_id);
          console.log('=====================');
        }
        
        // 如果产品有product_group_id，获取变体列表
        if (data && data.product_group_id) {
          const variantList = await productAPI.getProductVariants(productId);
          setVariants(variantList);
          console.log('产品变体列表:', variantList);
        }
      } catch (err) {
        setError(getProductFetchErrorMessage(err));
        setErrorRedirectCategoryId(isUnavailableProductError(err) ? getUnavailableCategoryId(err) : null);
        setRedirectCountdown(PRODUCT_UNAVAILABLE_REDIRECT_SECONDS);
        console.error('Error fetching product:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [productId, initialProduct]);

  const unavailableRedirectTarget = error === PRODUCT_UNAVAILABLE_MESSAGE_FR
    ? getProductListPath(errorRedirectCategoryId)
    : null;

  useEffect(() => {
    if (!unavailableRedirectTarget) return undefined;

    setRedirectCountdown(PRODUCT_UNAVAILABLE_REDIRECT_SECONDS);

    const countdownTimer = window.setInterval(() => {
      setRedirectCountdown((current) => (current > 1 ? current - 1 : current));
    }, 1000);
    const redirectTimer = window.setTimeout(() => {
      navigate(unavailableRedirectTarget, { replace: true });
    }, PRODUCT_UNAVAILABLE_REDIRECT_SECONDS * 1000);

    return () => {
      window.clearInterval(countdownTimer);
      window.clearTimeout(redirectTimer);
    };
  }, [navigate, unavailableRedirectTarget]);

  useEffect(() => {
    if (!product?.product_id) return;
    if (adTrackingLoading) return;

    const trackingKey = product.product_id.toString();
    if (viewTrackedProductRef.current === trackingKey) return;
    viewTrackedProductRef.current = trackingKey;

    try {
      trackProductLandingView(product, {
        ad_id: adId,
        category_id: product.category_id,
        product_type: 'product'
      });
    } catch (landingError) {
      console.warn('product_landing_view 埋点失败:', landingError);
    }

    try {
      trackViewContentEvent({
        productId: product.product_id,
        quantity: 1,
        totalPrice: product.price,
        unitPrice: product.price
      }, getClientInfo()).catch(err => console.warn('Facebook ViewContent 事件失败:', err));
    } catch (fbError) {
      console.warn('Facebook ViewContent 事件错误:', fbError);
    }
  }, [adId, adTrackingLoading, product, product?.product_id, product?.price]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Chargement...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <p>{error}</p>
        <div className="error-actions">
          <button
            type="button"
            className="error-home-btn"
            onClick={() => navigate(unavailableRedirectTarget || '/')}
          >
            Voir d'autres produits
          </button>
          {unavailableRedirectTarget && (
            <span className="error-redirect-countdown" aria-live="polite">
              {redirectCountdown}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="error-container">
        <p>Les informations produit n'existent pas</p>
        <button type="button" className="error-home-btn" onClick={() => navigate('/')}>
          Voir d'autres produits
        </button>
      </div>
    );
  }

  const formatPrice = (price) => {
    return price.toString();
  };

  const formatDiscount = (off) => {
    return (off * 100).toFixed(0);
  };

  const handleOrderConfirm = (quantity) => {
    // 这里可以处理订单确认逻辑
    alert(`订单确认！\n产品: ${product.name_fr}\n数量: ${quantity}\n总价: ${product.price * quantity} FCFA`);
  };

  const handleBuyNowClick = () => {
    const quantityExperiment = checkoutQuantityExperiment;
    const isInlineQuantityVariant = isInlineCheckoutVariant(quantityExperiment);
    const defaultQuantity = 1;
    const totalPrice = product.price * defaultQuantity;
    let checkoutSessionId = null;

    try {
      checkoutSessionId = beginCheckoutFunnel(product, {
        ad_id: adId,
        quantity: defaultQuantity,
        total_price: totalPrice,
        ...quantityExperiment
      });
    } catch (error) {
      console.warn('checkout_start 埋点失败:', error);
    }

    if (isInlineQuantityVariant) {
      if (checkoutSessionId) {
        try {
          trackCheckoutEvent('quantity_confirmed', buildCheckoutProductProperties(product, {
            ad_id: adId,
            quantity: defaultQuantity,
            total_price: totalPrice,
            quantity_confirm_method: 'inline_default',
            ...quantityExperiment
          }), { sessionId: checkoutSessionId });
        } catch (error) {
          console.warn('quantity_confirmed 埋点失败:', error);
        }
      }

      try {
        trackAddToCartEvent({
          productId: product.product_id,
          quantity: defaultQuantity,
          totalPrice,
          unitPrice: product.price
        }, getClientInfo()).catch(err => console.warn('Facebook AddToCart 事件失败:', err));
      } catch (fbError) {
        console.warn('Facebook AddToCart 事件错误:', fbError);
      }

      navigate(`/payment?step=1${getLocalPreviewBrowserContextParam()}`, {
        state: {
          product,
          quantity: defaultQuantity,
          checkoutSessionId,
          checkoutQuantityExperiment: quantityExperiment,
          quantityConfirmed: true
        }
      });
      return;
    }

    setIsModalOpen(true);
  };

  return (
    <div className="product-detail">
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
        {/* 产品图片轮播 */}
        <div className="product-gallery">
          <Swiper
            modules={productSwiperModules}
            spaceBetween={0}
            slidesPerView={1}
            pagination={{ clickable: true }}
            navigation={true}
            autoplay={productGalleryAutoplay}
            speed={450}
            className="main-swiper"
          >
            {galleryImages.map((image, index) => (
              <SwiperSlide key={`${product.product_id}-main-${index}`}>
                <div className="image-container">
                  <img src={image} alt={`Image produit ${index + 1}`} />
                  {index === 0 && product.off > 0 && (
                    <div className="discount-badge">
                      -{formatDiscount(product.off)}%
                    </div>
                  )}
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        <div className="product-purchase-panel">
          {/* 产品信息 */}
          <div className="product-info">
            <h1 className="product-title">{product.name_fr}</h1>

            {/* 价格信息 */}
            <div className="price-section">
              <div className="current-price">{formatPrice(product.price)} FCFA</div>
              {product.original_price && product.original_price > product.price && (
                <div className="original-price">{formatPrice(product.original_price)} FCFA</div>
              )}
              <Countdown />
            </div>

            {isCheckoutOptimizationVariant && (
              <ServiceInfo variant={isCodTrustVariant ? 'cod_trust' : 'benefits'} compact />
            )}

            {/* 库存信息 */}
            <div className="stock-info">
              <span className="stock-label">Stock : </span>
              <span className={`stock-count ${product.stock < 10 ? 'low-stock' : ''}`}>
                {product.stock} pièces
              </span>
            </div>

            {/* SKU 名称（与 APP 商品详情页一致） */}
            {product.skus && product.skus.length > 0 && product.skus[0].name_fr && (
              <div className="sku-section">
                <div className="sku-label">Modèle</div>
                <div className="sku-name">{product.skus[0].name_fr}</div>
              </div>
            )}

            {/* 产品变体选择器 */}
            <ProductVariants
              variants={variants}
              currentProductId={product.product_id}
              onVariantSelect={(selectedProductId) => {
                // 跳转到选中的变体产品页面
                navigate(`/product/${selectedProductId}`);
              }}
            />

          </div>

          {/* 服务信息 */}
          {!isCheckoutOptimizationVariant && <ServiceInfo variant="classic" />}

          {/* 底部操作按钮 */}
          <div className="bottom-actions">
            {isCheckoutOptimizationVariant && (
              <div className={`cta-trust-note ${isCodTrustVariant ? 'cod-trust' : ''}`}>
                {isCodTrustVariant
                  ? 'Aucun paiement maintenant. Recevez le produit, puis payez en cash ou Wave.'
                  : 'Aucun paiement maintenant. À la réception, payez par Wave ou en cash.'}
              </div>
            )}
            <button
              type="button"
              className="buy-now-btn"
              onClick={handleBuyNowClick}
            >
              Commander maintenant - Paiement à la livraison
            </button>
          </div>
        </div>
      </div>

      {/* 产品描述 */}
      <div className="product-description">
        <h3>Détails du produit</h3>
        
        {/* 产品特性文字描述 */}
        <div className="description-text">
          {product.content_fr?.split('\n').map((line, index) => (
            <p key={`${product.product_id}-content-${index}`}>{line}</p>
          ))}
        </div>

        {/* 产品描述图片 */}
        {product.description_fr && product.description_fr.length > 0 && (
          <div className="description-images">
            {product.description_fr.map((image, index) => (
              <img key={`${product.product_id}-desc-${index}`} src={image} alt={`Détails produit ${index + 1}`} />
            ))}
          </div>
        )}
      </div>

      {/* 数量选择弹窗 */}
      <QuantityModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        product={product}
        checkoutQuantityExperiment={checkoutQuantityExperiment}
        onConfirm={handleOrderConfirm}
      />
    </div>
  );
};

export default ProductDetail;
