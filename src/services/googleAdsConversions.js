const GOOGLE_ADS_ID = 'AW-17793385318'
const GOOGLE_PURCHASE_LABEL = 'FJMeCPyCxLccEOaGxqRC'
const GOOGLE_PURCHASE_SEND_TO = `${GOOGLE_ADS_ID}/${GOOGLE_PURCHASE_LABEL}`
const SENT_PURCHASE_STORAGE_PREFIX = 'cod_google_ads_purchase_conversion_sent_'

const safeGetSessionStorage = (key) => {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null
    return window.sessionStorage.getItem(key)
  } catch (error) {
    return null
  }
}

const safeSetSessionStorage = (key, value) => {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return
    window.sessionStorage.setItem(key, value)
  } catch (error) {
    // Ignore storage failures; Google Ads tracking must never block checkout.
  }
}

export const trackGoogleAdsPurchaseConversion = ({ transactionId }) => {
  if (typeof window === 'undefined') return false
  if (typeof window.gtag !== 'function') return false

  const normalizedTransactionId = String(transactionId || '').trim()
  if (!normalizedTransactionId) return false

  const storageKey = `${SENT_PURCHASE_STORAGE_PREFIX}${normalizedTransactionId}`
  if (safeGetSessionStorage(storageKey) === '1') return false

  window.gtag('event', 'conversion', {
    send_to: GOOGLE_PURCHASE_SEND_TO,
    value: 1.0,
    currency: 'USD',
    transaction_id: normalizedTransactionId
  })

  safeSetSessionStorage(storageKey, '1')
  return true
}
