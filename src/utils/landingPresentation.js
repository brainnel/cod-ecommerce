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

// Product copy (content_fr) is written as one "Label: value" spec per line.
// The SKU model name, when it differs from the title, leads the list.
const SPEC_LINE = /^([^:]{1,40}?)\s*:\s*(\S.*)$/
export const buildProductSpecRows = (model, content) => {
  const rows = []
  const modelName = typeof model === 'string' ? model.trim() : ''
  if (modelName) rows.push({ label: 'Modèle', value: modelName })
  const lines = typeof content === 'string' ? content.split('\n') : []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const match = SPEC_LINE.exec(line)
    rows.push(match ? { label: match[1].trim(), value: match[2].trim() } : { label: '', value: line })
  }
  return rows
}

export const getStoredLandingReviews = (product) => {
  const reviews = product?.reviews || product?.product_reviews
  return Array.isArray(reviews)
    ? reviews.filter(review => typeof (review?.text || review?.content || review?.comment) === 'string')
    : []
}
