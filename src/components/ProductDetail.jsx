import { useState, useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Navigation } from 'swiper/modules';
import { useNavigate } from 'react-router-dom';
import { productAPI } from '../services/api';
import Countdown from './Countdown';
import QuantityModal from './QuantityModal';
import ServiceInfo from './ServiceInfo';
import ProductVariants from './ProductVariants';
import logoImage from '../assets/logo.png';

// Import Swiper styles
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';

const ProductDetail = ({ productId = "194", initialProduct = null }) => {
  const [product, setProduct] = useState(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [variants, setVariants] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
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
        setError('Échec de récupération des informations produit');
        console.error('Error fetching product:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [productId, initialProduct]);

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
      </div>
    );
  }

  if (!product) {
    return (
      <div className="error-container">
        <p>Les informations produit n'existent pas</p>
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

  // 设置倒计时目标时间（7天后）
  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + 7)

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

      {/* 倒计时组件 */}
      <Countdown targetDate={targetDate} />

      {/* 产品图片轮播 */}
      <div className="product-gallery">
        <Swiper
          modules={[Pagination, Navigation]}
          spaceBetween={0}
          slidesPerView={1}
          pagination={{ clickable: true }}
          navigation={true}
          className="main-swiper"
        >
          {product.image_url?.map((image, index) => (
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

      {/* 产品信息 */}
      <div className="product-info">
        <h1 className="product-title">{product.name_fr}</h1>
        
        {/* 价格信息 */}
        <div className="price-section">
          <div className="current-price">{formatPrice(product.price)} FCFA</div>
          {product.original_price && product.original_price > product.price && (
            <div className="original-price">{formatPrice(product.original_price)} FCFA</div>
          )}
        </div>

        {/* 库存信息 */}
        <div className="stock-info">
          <span className="stock-label">Stock : </span>
          <span className={`stock-count ${product.stock < 10 ? 'low-stock' : ''}`}>
            {product.stock} pièces
          </span>
        </div>

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
      <ServiceInfo />

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

      {/* 底部操作按钮 */}
      <div className="bottom-actions">
        <button 
          type="button" 
          className="buy-now-btn"
          onClick={() => setIsModalOpen(true)}
        >
          Commander maintenant - Paiement à la livraison
        </button>
      </div>

      {/* 数量选择弹窗 */}
      <QuantityModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        product={product}
        onConfirm={handleOrderConfirm}
      />
    </div>
  );
};

export default ProductDetail;
