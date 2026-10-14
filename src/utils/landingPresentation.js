const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export const CLARITY_DELIVERY_PROMISE = 'Livraison gratuite à domicile à Abidjan sous 48 h'

const positiveAmount = (value) => {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

// The single-product catalog value is indicative, not verified price history.
// Do not invent a fallback or show two prices that format to the same FCFA value.
export const getLandingReferencePrice = (price, referencePrice) => {
  const current = positiveAmount(price)
  const reference = positiveAmount(referencePrice)
  return current !== null && reference !== null && Math.round(current) > 0
    && Math.round(reference) > Math.round(current) ? reference : null
}

export const getBundleItemUnitPrice = (item) => {
  const price = positiveAmount(item?.unit_price)
  if (price === null) return null
  const rounded = Math.ceil(price / 500) * 500
  return Number.isFinite(rounded) ? rounded : null
}

export const getBundleSeparatePurchasePrice = (bundle) => {
  if (!Array.isArray(bundle?.items) || !bundle.items.length) return null
  let total = 0
  for (const item of bundle.items) {
    const unitPrice = getBundleItemUnitPrice(item)
    const quantity = positiveAmount(item?.quantity)
    if (unitPrice === null || !Number.isSafeInteger(quantity)) return null
    // Match the single-product API's per-SKU upward rounding, before quantity.
    // Missing component prices cannot silently contribute zero to the total.
    total += unitPrice * quantity
  }
  return getLandingReferencePrice(bundle.cfa_price, total)
}

// Production uses the approved design on every domain. Only loopback previews
// can opt into the previous layout; public URL parameters cannot change rollout.
export const isClarityLanding = (
  search = typeof window === 'undefined' ? '' : window.location.search,
  hostname = typeof window === 'undefined' ? '' : window.location.hostname
) => !LOCAL_HOSTS.has(hostname) || new URLSearchParams(search).get('landing_design') !== 'original'

export const getStoredLandingReviews = (product) => {
  const reviews = product?.reviews || product?.product_reviews
  return Array.isArray(reviews)
    ? reviews.filter(review => typeof (review?.text || review?.content || review?.comment) === 'string')
    : []
}
