const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export const CLARITY_DELIVERY_PROMISE = 'Livraison gratuite à domicile à Abidjan sous 48 h'

const positiveAmount = (value) => {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export const getBundleItemUnitPrice = (item) => {
  const price = positiveAmount(item?.unit_price)
  if (price === null) return null
  const rounded = Math.ceil(price / 500) * 500
  return Number.isFinite(rounded) ? rounded : null
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
