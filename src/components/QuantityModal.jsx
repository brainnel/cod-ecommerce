import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { trackAddToCartEvent, getClientInfo } from '../services/facebookConversions'
import {
  buildCheckoutProductProperties,
  getCheckoutQuantityExperiment,
  getCheckoutSessionId,
  startCheckoutSession,
  trackCheckoutEvent,
  updateCheckoutContext
} from '../services/checkoutFunnelAnalytics'
import { getLocalPreviewBrowserContextParam } from '../utils/checkoutBrowserContextPreview'
import './QuantityModal.css'

const QuantityModal = ({ isOpen, onClose, product, checkoutQuantityExperiment }) => {
  const navigate = useNavigate()
  const [quantity, setQuantity] = useState(1)
  const [isClosing, setIsClosing] = useState(false)

  if (!isOpen) return null

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      setIsClosing(false)
      onClose()
    }, 300) // 等待动画完成
  }

  const handleQuantityChange = (newQuantity) => {
    if (newQuantity >= 1 && newQuantity <= product.stock) {
      setQuantity(newQuantity)
    }
  }

  const handleConfirm = () => {
    const totalPrice = product.price * quantity
    let checkoutSessionId = getCheckoutSessionId()
    const quantityExperiment = checkoutQuantityExperiment || getCheckoutQuantityExperiment()

    if (!checkoutSessionId) {
      checkoutSessionId = startCheckoutSession(product, {
        quantity,
        total_price: totalPrice,
        ...quantityExperiment
      })
      trackCheckoutEvent('checkout_start', buildCheckoutProductProperties(product, {
        quantity,
        total_price: totalPrice,
        ...quantityExperiment
      }), { sessionId: checkoutSessionId })
    }

    updateCheckoutContext(product, {
      quantity,
      total_price: totalPrice,
      ...quantityExperiment
    })
    trackCheckoutEvent('quantity_confirmed', buildCheckoutProductProperties(product, {
      quantity,
      total_price: totalPrice,
      quantity_confirm_method: 'quantity_modal',
      ...quantityExperiment
    }), { sessionId: checkoutSessionId })

    try {
      trackAddToCartEvent({
        productId: product.product_id,
        quantity,
        totalPrice,
        unitPrice: product.price
      }, getClientInfo()).catch(err => console.warn('Facebook AddToCart 事件失败:', err))
    } catch (fbError) {
      console.warn('Facebook AddToCart 事件错误:', fbError)
    }

    // 跳转到付款页面，传递产品和数量信息
    navigate(`/payment?step=1${getLocalPreviewBrowserContextParam()}`, {
      state: {
        product,
        quantity,
        checkoutSessionId,
        checkoutQuantityExperiment: quantityExperiment,
        quantityConfirmed: true
      }
    })
    handleClose()
    setQuantity(1) // 重置数量
  }

  const formatPrice = (price) => {
    return price.toString()
  }

  const totalPrice = product.price * quantity

  return (
    <div className={`modal-overlay ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* 关闭按钮 */}
        <button className="modal-close" onClick={handleClose}>
          ×
        </button>

        {/* 产品信息 */}
        <div className="modal-product-info">
          <img 
            src={product.image_url?.[0]} 
            alt={product.name_fr} 
            className="modal-product-image"
          />
          <div className="modal-product-details">
            <h3 className="modal-product-title">{product.name_fr}</h3>
            <div className="modal-product-price">
              {formatPrice(product.price)} FCFA
            </div>
            <div className="modal-stock-info">
              Stock disponible: {product.stock} pièces
            </div>
          </div>
        </div>

        {/* 数量选择 */}
        <div className="quantity-section">
          <label className="quantity-label">Quantité:</label>
          <div className="quantity-controls">
            <button 
              className="quantity-btn"
              onClick={() => handleQuantityChange(quantity - 1)}
              disabled={quantity <= 1}
            >
              -
            </button>
            <input 
              type="number"
              value={quantity}
              onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
              className="quantity-input"
              min="1"
              max={product.stock}
            />
            <button 
              className="quantity-btn"
              onClick={() => handleQuantityChange(quantity + 1)}
              disabled={quantity >= product.stock}
            >
              +
            </button>
          </div>
        </div>

        {/* 总价显示 */}
        <div className="total-price-section">
          <div className="total-price-label">Total:</div>
          <div className="total-price-value">
            {formatPrice(totalPrice)} FCFA
          </div>
        </div>

        {/* 确认按钮 */}
        <div className="modal-actions">
          <button className="confirm-btn" onClick={handleConfirm}>
            Confirmer la commande
          </button>
        </div>
      </div>
    </div>
  )
}

export default QuantityModal
