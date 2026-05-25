import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Navigation, Autoplay } from 'swiper/modules';
import { useNavigate } from 'react-router-dom';
import { FiStar } from 'react-icons/fi';
import { productAPI } from '../services/api';
import { trackViewContentEvent, trackAddToCartEvent, getClientInfo } from '../services/facebookConversions';
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
import { saveCheckoutPaymentState } from '../utils/checkoutPaymentStateCache';
import { preloadPaymentPage, schedulePaymentPagePreload } from '../utils/preloadRoutes';

const PRODUCT_UNAVAILABLE_BACKEND_MESSAGE = '此商品已下架，请查看其它商品';
const PRODUCT_UNAVAILABLE_MESSAGE_FR = "Ce produit n'est plus disponible. Veuillez consulter d'autres produits.";
const GENERIC_PRODUCT_FETCH_ERROR_FR = 'Échec de récupération des informations produit';
const PRODUCT_UNAVAILABLE_REDIRECT_SECONDS = 3;
const MAX_PROMOTED_DETAIL_IMAGES = 4;
const PRODUCT_REVIEW_SUMMARY = {
  score: '4.8',
  count: 5
};
const PRODUCT_REVIEW_PROFILES = [
  { name: 'Aminata', area: 'Cocody' },
  { name: 'Mariam', area: 'Marcory' },
  { name: 'Moussa', area: 'Yopougon' },
  { name: 'Kouadio', area: 'Abobo' },
  { name: 'Fatou', area: 'Treichville' }
];
const FALLBACK_SERVICE_REVIEW_POOL = [
  {
    text: "Le livreur m'a appelé avant de passer. Je n'ai pas payé de frais en plus à la livraison."
  },
  {
    text: "La livraison a été rapide à Abidjan. Le livreur a confirmé l'adresse par téléphone avant de venir."
  },
  {
    text: "J'ai payé à la réception, en cash. Le prix était bien celui affiché sur la page."
  },
  {
    text: "On m'a appelé avant la livraison, donc j'ai pu expliquer facilement mon adresse au livreur."
  },
  {
    text: "Le livreur m'a appelé quand il était proche de mon quartier. J'ai donné le repère et tout s'est bien passé."
  },
  {
    text: "J'ai payé seulement à la réception. Pas de surprise sur le prix, c'était bien le montant affiché."
  },
  {
    text: "Le livreur m'a appelé avant de passer. J'ai pu expliquer au téléphone où se trouve la maison."
  },
  {
    text: "La livraison était gratuite à Abidjan. Le livreur ne m'a rien demandé en plus quand il est arrivé."
  },
  {
    text: "J'ai vérifié le colis devant le livreur avant de payer. Pour une commande en ligne, ça met en confiance."
  },
  {
    text: "Même avec une adresse pas très précise, l'appel du livreur a aidé. J'ai expliqué le carrefour et il est venu."
  },
  {
    text: "Commande reçue sans complication. Le livreur a appelé avant de quitter la zone pour confirmer ma disponibilité."
  },
  {
    text: "J'ai payé en cash à la livraison. Le livreur a été correct et m'a laissé vérifier le colis tranquillement."
  },
  {
    text: "La livraison s'est bien passée dans la commune. On m'a appelé avant, donc je n'ai pas attendu au hasard."
  },
  {
    text: "Le prix affiché sur la page est le prix payé. Il n'y a pas eu de frais cachés au moment de recevoir."
  },
  {
    text: "J'ai pu choisir un moment où j'étais disponible. Le livreur a appelé avant de passer, c'était simple."
  }
];
const FALLBACK_QUALITY_REVIEW_POOL = [
  (shortName) => ({
    text: `Le ${shortName} est arrivé propre, bien présenté et conforme au modèle affiché sur la page.`
  }),
  (shortName) => ({
    text: `Le ${shortName} était bien emballé. À la réception, tout était en bon état et rien ne semblait abîmé.`
  }),
  (shortName) => ({
    text: `Le modèle reçu correspondait aux photos de la page. La finition est correcte pour le prix payé.`
  }),
  (shortName) => ({
    text: `Le colis était propre à l'arrivée. Le produit était complet et conforme à ce que j'avais commandé.`
  }),
  (shortName) => ({
    text: `J'ai vérifié le produit à la livraison. Il était en bon état et le modèle était bien celui choisi.`
  }),
  (shortName) => ({
    text: `Le ${shortName} donne une bonne impression à la réception. L'emballage était correct et le produit propre.`
  })
];

const getTextSignature = (value) => {
  const text = value ? String(value) : '';
  return Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0);
};

const getSeededHash = (value, seed) => {
  const text = `${seed}:${value || ''}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const pickStableReviews = (reviews, count, seed) => {
  return [...reviews]
    .sort((left, right) => getSeededHash(left.text, seed) - getSeededHash(right.text, seed))
    .slice(0, count);
};

const getShortProductName = (product) => {
  const rawName = product?.skus?.[0]?.name_fr || product?.name_fr || 'ce produit';
  return rawName.length > 54 ? `${rawName.slice(0, 51).trim()}...` : rawName;
};

const getProductReviewTemplate = (product) => {
  const shortName = getShortProductName(product);
  const seed = getTextSignature(`${product?.product_id || ''}:${product?.name_fr || ''}:${product?.skus?.[0]?.name_fr || ''}`);
  const serviceReviews = pickStableReviews(FALLBACK_SERVICE_REVIEW_POOL, 4, seed);
  const qualityReviews = FALLBACK_QUALITY_REVIEW_POOL.map((buildReview) => buildReview(shortName));

  return {
    painPoints: serviceReviews.slice(0, 3),
    delivery: serviceReviews[3],
    quality: pickStableReviews(qualityReviews, 1, seed + 17)[0]
  };
};

const buildFallbackProductReviews = (product) => {
  const template = getProductReviewTemplate(product);
  const reviews = [
    ...template.painPoints,
    template.delivery,
    template.quality
  ];

  return reviews.map((review, index) => ({
    ...PRODUCT_REVIEW_PROFILES[index % PRODUCT_REVIEW_PROFILES.length],
    ...review
  }));
};

const normalizeReviewList = (reviews) => {
  if (!Array.isArray(reviews)) return [];

  return reviews
    .map((review) => ({
      name: review?.name || review?.customer_name,
      area: review?.area || review?.district || review?.district_name,
      text: review?.text || review?.content || review?.comment,
      type: review?.type || review?.review_type
    }))
    .filter((review) => review.text);
};

const getDisplayProductReviews = (product) => {
  const storedReviews = normalizeReviewList(product?.reviews || product?.product_reviews);
  const fallbackReviews = buildFallbackProductReviews(product);
  const mergedReviews = [];
  const seenTexts = new Set();

  [...storedReviews, ...fallbackReviews].forEach((review, index) => {
    if (mergedReviews.length >= 5) return;
    const textKey = review.text.trim().toLowerCase();
    if (seenTexts.has(textKey)) return;
    seenTexts.add(textKey);
    mergedReviews.push({
      ...PRODUCT_REVIEW_PROFILES[index % PRODUCT_REVIEW_PROFILES.length],
      ...review,
      name: review.name || PRODUCT_REVIEW_PROFILES[index % PRODUCT_REVIEW_PROFILES.length].name,
      area: review.area || PRODUCT_REVIEW_PROFILES[index % PRODUCT_REVIEW_PROFILES.length].area
    });
  });

  return mergedReviews;
};

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

const normalizeImageList = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return value ? [value] : [];
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
  const [activeProductInfoTab, setActiveProductInfoTab] = useState('details');
  const navigate = useNavigate();
  const { adId, isLoading: adTrackingLoading } = useAdTrackingContext();
  const viewTrackedProductRef = useRef(null);
  const landingEngagementRef = useRef(null);
  const checkoutQuantityExperiment = useMemo(() => getCheckoutQuantityExperiment(), []);
  const isCheckoutOptimizationVariant = isInlineCheckoutVariant(checkoutQuantityExperiment);
  const isCodTrustLanding = isCodTrustLandingVariant(checkoutQuantityExperiment);
  const isAddressFirstLanding = isAddressFirstCheckoutVariant(checkoutQuantityExperiment)
    || isSinglePageCheckoutVariant(checkoutQuantityExperiment);
  const productMainImages = normalizeImageList(product?.image_url);
  const productDetailImages = normalizeImageList(product?.description_fr);
  const promotedDetailImages = productMainImages.length === 1
    ? productDetailImages.slice(0, MAX_PROMOTED_DETAIL_IMAGES)
    : [];
  const galleryImages = [
    ...productMainImages.map((src) => ({ src, type: 'main' })),
    ...promotedDetailImages.map((src) => ({ src, type: 'detail-preview' }))
  ];
  const productReviews = useMemo(() => getDisplayProductReviews(product), [product]);
  const productSwiperModules = [Pagination, Navigation, Autoplay];
  const productGalleryAutoplay = galleryImages.length > 1
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
    setActiveProductInfoTab('details');
  }, [productId]);

  useEffect(() => {
    if (!product || error) return undefined;
    return schedulePaymentPagePreload();
  }, [error, product?.product_id]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        setErrorRedirectCategoryId(null);
        let data;
        
        // 如果已经有初始产品数据，就不需要再次获取
        if (initialProduct) {
          data = initialProduct;
          setLoading(false);
        } else {
          setLoading(true);
          data = await productAPI.getProductDetail(productId);
          setProduct(data);
        }
        
        // 如果产品有product_group_id，获取变体列表
        if (data && data.product_group_id) {
          const variantList = await productAPI.getProductVariants(productId);
          setVariants(variantList);
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

    let cleanupLandingEngagement = null;
    try {
      const landingSessionId = trackProductLandingView(product, {
        ad_id: adId,
        category_id: product.category_id,
        product_type: 'product'
      });
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      landingEngagementRef.current = {
        landingSessionId,
        startedAt,
        maxScrollPercent: 0,
        passiveSent: false,
        checkoutClickSent: false
      };

      const updateMaxScrollPercent = () => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        const state = landingEngagementRef.current;
        if (!state) return;
        const doc = document.documentElement;
        const scrollable = Math.max(doc.scrollHeight - window.innerHeight, 1);
        const current = Math.min(Math.max((window.scrollY / scrollable) * 100, 0), 100);
        state.maxScrollPercent = Math.max(
          state.maxScrollPercent,
          current
        );
      };

      const sendLandingEngagement = (reason) => {
        const state = landingEngagementRef.current;
        if (!state?.landingSessionId) return;
        const isCheckoutClick = reason === 'checkout_click';
        if (isCheckoutClick && state.checkoutClickSent) return;
        if (!isCheckoutClick && (state.passiveSent || state.checkoutClickSent)) return;
        updateMaxScrollPercent();
        if (isCheckoutClick) {
          state.checkoutClickSent = true;
        } else {
          state.passiveSent = true;
        }
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        trackProductLandingEngagement(product, {
          ad_id: adId,
          category_id: product.category_id,
          product_type: 'product',
          landing_session_id: state.landingSessionId,
          landing_duration_ms: now - state.startedAt,
          landing_max_scroll_percent: state.maxScrollPercent,
          landing_exit_reason: reason
        });
      };

      landingEngagementRef.current.send = sendLandingEngagement;

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          sendLandingEngagement('visibility_hidden');
        }
      };
      const handlePageHide = () => sendLandingEngagement('pagehide');

      window.addEventListener('scroll', updateMaxScrollPercent, { passive: true });
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('pagehide', handlePageHide);

      cleanupLandingEngagement = () => {
        window.removeEventListener('scroll', updateMaxScrollPercent);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('pagehide', handlePageHide);
        sendLandingEngagement('unmount');
      };
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

    return cleanupLandingEngagement || undefined;
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
    preloadPaymentPage();
    landingEngagementRef.current?.send?.('checkout_click');

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

      const paymentState = {
        product,
        quantity: defaultQuantity,
        checkoutSessionId,
        checkoutQuantityExperiment: quantityExperiment,
        quantityConfirmed: true
      };
      saveCheckoutPaymentState(paymentState);
      navigate(`/payment?step=1${getLocalPreviewBrowserContextParam()}`, {
        state: paymentState
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
                <div className={`image-container ${image.type === 'detail-preview' ? 'detail-preview-image' : ''}`}>
                  <img
                    src={image.src}
                    alt={`Image produit ${index + 1}`}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    fetchPriority={index === 0 ? 'high' : 'auto'}
                    decoding="async"
                  />
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
              <ServiceInfo variant={isAddressFirstLanding ? 'address_first' : (isCodTrustLanding ? 'cod_trust' : 'benefits')} compact />
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
              <div className={`cta-trust-note ${isCodTrustLanding ? 'cod-trust' : ''}`}>
                {isCodTrustLanding
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

      {/* 产品描述与评价 */}
      <div className="product-description">
        <div className="product-info-tabs" role="tablist" aria-label="Informations produit">
          <button
            type="button"
            role="tab"
            aria-selected={activeProductInfoTab === 'details'}
            className={`product-info-tab ${activeProductInfoTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveProductInfoTab('details')}
          >
            Détails
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeProductInfoTab === 'reviews'}
            className={`product-info-tab ${activeProductInfoTab === 'reviews' ? 'active' : ''}`}
            onClick={() => setActiveProductInfoTab('reviews')}
          >
            Avis
          </button>
        </div>

        {activeProductInfoTab === 'details' ? (
          <div className="product-tab-panel" role="tabpanel">
            {/* 产品特性文字描述 */}
            <div className="description-text">
              {product.content_fr?.split('\n').map((line, index) => (
                <p key={`${product.product_id}-content-${index}`}>{line}</p>
              ))}
            </div>

            {/* 产品描述图片 */}
            {productDetailImages.length > 0 && (
              <div className="description-images">
                {productDetailImages.map((image, index) => (
                  <img
                    key={`${product.product_id}-desc-${index}`}
                    src={image}
                    alt={`Détails produit ${index + 1}`}
                    loading="lazy"
                    decoding="async"
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="product-tab-panel reviews-panel" role="tabpanel">
            <div className="reviews-summary">
              <div>
                <div className="reviews-score">
                  <span>{PRODUCT_REVIEW_SUMMARY.score}</span>
                  <div className="reviews-stars" aria-label={`${PRODUCT_REVIEW_SUMMARY.score} sur 5`}>
                    {[0, 1, 2, 3, 4].map((star) => (
                      <FiStar key={star} aria-hidden="true" />
                    ))}
                  </div>
                </div>
                <div className="reviews-count">5 avis utiles sélectionnés pour vous</div>
              </div>
              <div className="reviews-verified">Retours clients</div>
            </div>

            <div className="review-list">
              {productReviews.map((review) => (
                <article className="review-item" key={`${review.name}-${review.area}`}>
                  <div className="review-content">
                    <div className="review-header">
                      <div>
                        <strong>{review.name}</strong>
                        <span>{review.area}</span>
                      </div>
                      <div className="review-item-stars" aria-label={`${review.rating || 5} sur 5`}>
                        {[0, 1, 2, 3, 4].map((star) => (
                          <FiStar
                            key={star}
                            aria-hidden="true"
                            className={star < (review.rating || 5) ? 'filled' : ''}
                          />
                        ))}
                      </div>
                    </div>
                    <p>{review.text}</p>
                  </div>
                </article>
              ))}
            </div>
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
