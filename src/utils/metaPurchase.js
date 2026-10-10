// Purchase uses the created order, not the checkout's synthetic bundle product.
// Keep these values aligned with MetaQualifiedPurchaseService.build_event.
const sentPurchaseIds = new Set()

export const normalizeMetaPhone = (value) => {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('00225')) digits = digits.slice(2)
  if (!digits) return null
  // In Côte d'Ivoire the initial 0 belongs to the significant 10-digit number.
  return digits.startsWith('225') ? digits : `225${digits}`
}

const catalogContentId = async (productId) => {
  const path = `/product/${String(productId).trim()}`
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(path))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export const buildBrowserPurchasePayload = async (order) => {
  const orderNo = String(order?.order_no || '').trim()
  if (!orderNo || !Array.isArray(order.items) || !order.items.length) return null

  const value = Number(order.actual_amount ?? order.total_amount)
  if (!Number.isFinite(value) || value < 0) return null

  const contents = await Promise.all(order.items.map(async (item) => {
    const productId = String(item.product_id || '').trim()
    const quantity = Number(item.quantity)
    const itemPrice = Number(item.unit_price)
    if (!productId || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(itemPrice) || itemPrice < 0) {
      throw new Error('Invalid created-order item for Meta Purchase')
    }
    return { id: await catalogContentId(productId), quantity, item_price: itemPrice }
  }))

  return {
    eventId: `purchase_${orderNo}`,
    customData: {
      currency: 'XOF',
      value,
      order_id: orderNo,
      content_type: 'product',
      content_ids: contents.map(item => item.id),
      contents,
      num_items: contents.reduce((sum, item) => sum + item.quantity, 0)
    }
  }
}

export const trackBrowserPurchase = async (order, pixel) => {
  const orderNo = String(order?.order_no || '').trim()
  if (!orderNo) return { success: false, skipped: 'missing_order_no' }
  if (typeof pixel !== 'function') return { success: false, skipped: 'pixel_unavailable' }
  const eventId = `purchase_${orderNo}`
  if (sentPurchaseIds.has(eventId)) return { success: true, duplicate: true, eventId }

  // Lock before hashing so concurrent callbacks cannot enqueue two browser events.
  sentPurchaseIds.add(eventId)
  try {
    const payload = await buildBrowserPurchasePayload(order)
    if (!payload) {
      sentPurchaseIds.delete(eventId)
      return { success: false, skipped: 'invalid_order_payload' }
    }
    pixel('track', 'Purchase', payload.customData, { eventID: payload.eventId })
    return { success: true, eventId }
  } catch {
    sentPurchaseIds.delete(eventId)
    // Pixel/crypto failures must never turn a successful order into a checkout error.
    return { success: false, skipped: 'browser_purchase_failed' }
  }
}
