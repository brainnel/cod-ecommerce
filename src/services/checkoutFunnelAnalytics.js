import { buildApiUrl } from '../config/api.config.js'

const ANALYTICS_ENDPOINT = '/api/vite/analytics/events'
const DEVICE_ID_STORAGE_KEY = 'cod_checkout_device_id'
const LANDING_SESSION_ID_STORAGE_KEY = 'cod_landing_session_id'
const SESSION_ID_STORAGE_KEY = 'cod_checkout_session_id'
const SESSION_CONTEXT_STORAGE_KEY = 'cod_checkout_context'
const QUANTITY_EXPERIMENT_STORAGE_KEY = 'cod_checkout_quantity_flow_variant_v9'
const AD_ID_STORAGE_KEY = 'facebook_ad_id'
const CHECKOUT_FLOW = 'cod_checkout'
const QUANTITY_FLOW_EXPERIMENT = 'checkout_reduced_friction_single_page_checkout_v9'
const QUANTITY_FLOW_HOLDOUT_PERCENT = 0
const QUANTITY_FLOW_INLINE_PERCENT = 0
const QUANTITY_FLOW_MAP_SEARCH_PERCENT = 0
const QUANTITY_FLOW_TRUST_PERCENT = 0
const QUANTITY_FLOW_TRUST_LANDING_PERCENT = 0
const QUANTITY_FLOW_ADDRESS_FIRST_PERCENT = 0
const QUANTITY_FLOW_SINGLE_PAGE_PERCENT = 100
const QUANTITY_FLOW_SINGLE_PAGE_REVIEW_PERCENT = 0
const PENDING_CHECKOUT_REUSE_MS = 10 * 60 * 1000

const QUANTITY_MODAL_VARIANT = 'quantity_modal'
const INLINE_QUANTITY_VARIANT = 'inline_quantity'
const INLINE_QUANTITY_MAP_SEARCH_VARIANT = 'inline_quantity_map_search'
const COD_TRUST_VARIANT = 'cod_trust'
const COD_TRUST_LANDING_VARIANT = 'cod_trust_landing'
const ADDRESS_FIRST_VARIANT = 'address_first'
const SINGLE_PAGE_CHECKOUT_VARIANT = 'single_page_checkout'
const SINGLE_PAGE_REVIEW_VARIANT = 'single_page_review'
const CHECKOUT_QUANTITY_VARIANTS = [
  QUANTITY_MODAL_VARIANT,
  INLINE_QUANTITY_VARIANT,
  INLINE_QUANTITY_MAP_SEARCH_VARIANT,
  COD_TRUST_VARIANT,
  COD_TRUST_LANDING_VARIANT,
  ADDRESS_FIRST_VARIANT,
  SINGLE_PAGE_CHECKOUT_VARIANT,
  SINGLE_PAGE_REVIEW_VARIANT
]

const getVariantGroup = (variant) => {
  if (variant === INLINE_QUANTITY_VARIANT) return 'friction'
  if (variant === INLINE_QUANTITY_MAP_SEARCH_VARIANT) return 'map_search'
  if (variant === COD_TRUST_VARIANT) return 'trust'
  if (variant === COD_TRUST_LANDING_VARIANT) return 'trust_landing'
  if (variant === ADDRESS_FIRST_VARIANT) return 'address_first'
  if (variant === SINGLE_PAGE_CHECKOUT_VARIANT) return 'single_page'
  if (variant === SINGLE_PAGE_REVIEW_VARIANT) return 'single_page_review'
  return 'holdout'
}

const normalizeCheckoutQuantityVariant = (value) => {
  const normalized = String(value || '').trim()
  if (CHECKOUT_QUANTITY_VARIANTS.includes(normalized)) return normalized
  if (normalized === 'f' || normalized === 'f_group' || normalized === 'map_search') return INLINE_QUANTITY_MAP_SEARCH_VARIANT
  if (normalized === 'c' || normalized === 'c_group' || normalized === 'trust_copy') return COD_TRUST_VARIANT
  if (normalized === 'd' || normalized === 'd_group' || normalized === 'trust_landing') return COD_TRUST_LANDING_VARIANT
  if (normalized === 'e' || normalized === 'e_group' || normalized === 'address_first') return ADDRESS_FIRST_VARIANT
  if (normalized === 'g' || normalized === 'g_group' || normalized === 'single_page') return SINGLE_PAGE_CHECKOUT_VARIANT
  if (normalized === 'h' || normalized === 'h_group' || normalized === 'single_page_review') return SINGLE_PAGE_REVIEW_VARIANT
  return null
}

export const isInlineCheckoutVariant = (experimentOrVariant) => {
  const variant = typeof experimentOrVariant === 'string'
    ? experimentOrVariant
    : experimentOrVariant?.checkout_quantity_variant
  return variant === INLINE_QUANTITY_VARIANT
    || variant === INLINE_QUANTITY_MAP_SEARCH_VARIANT
    || variant === COD_TRUST_VARIANT
    || variant === COD_TRUST_LANDING_VARIANT
    || variant === ADDRESS_FIRST_VARIANT
    || variant === SINGLE_PAGE_CHECKOUT_VARIANT
    || variant === SINGLE_PAGE_REVIEW_VARIANT
}

export const isCodTrustCheckoutVariant = (experimentOrVariant) => {
  const variant = typeof experimentOrVariant === 'string'
    ? experimentOrVariant
    : experimentOrVariant?.checkout_quantity_variant
  return variant === COD_TRUST_VARIANT
}

export const isCodTrustLandingVariant = (experimentOrVariant) => {
  const variant = typeof experimentOrVariant === 'string'
    ? experimentOrVariant
    : experimentOrVariant?.checkout_quantity_variant
  return variant === COD_TRUST_VARIANT || variant === COD_TRUST_LANDING_VARIANT
}

export const isAddressFirstCheckoutVariant = (experimentOrVariant) => {
  const variant = typeof experimentOrVariant === 'string'
    ? experimentOrVariant
    : experimentOrVariant?.checkout_quantity_variant
  return variant === ADDRESS_FIRST_VARIANT
}

export const isSinglePageCheckoutVariant = (experimentOrVariant) => {
  const variant = typeof experimentOrVariant === 'string'
    ? experimentOrVariant
    : experimentOrVariant?.checkout_quantity_variant
  return variant === SINGLE_PAGE_CHECKOUT_VARIANT || variant === SINGLE_PAGE_REVIEW_VARIANT
}

export const isSinglePageReviewCheckoutVariant = (experimentOrVariant) => {
  const variant = typeof experimentOrVariant === 'string'
    ? experimentOrVariant
    : experimentOrVariant?.checkout_quantity_variant
  return variant === SINGLE_PAGE_REVIEW_VARIANT
}

export const isInlineMapSearchCheckoutVariant = (experimentOrVariant) => {
  const variant = typeof experimentOrVariant === 'string'
    ? experimentOrVariant
    : experimentOrVariant?.checkout_quantity_variant
  return variant === INLINE_QUANTITY_MAP_SEARCH_VARIANT
}

const safeGetStorage = (storage, key) => {
  try {
    return storage.getItem(key)
  } catch (error) {
    console.warn('读取 checkout 埋点缓存失败:', error)
    return null
  }
}

const safeSetStorage = (storage, key, value) => {
  try {
    storage.setItem(key, value)
  } catch (error) {
    console.warn('写入 checkout 埋点缓存失败:', error)
  }
}

const createId = (prefix) => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

export const getCheckoutDeviceId = () => {
  if (typeof window === 'undefined') return createId('device')

  const cached = safeGetStorage(window.localStorage, DEVICE_ID_STORAGE_KEY)
  if (cached) return cached

  const deviceId = createId('device')
  safeSetStorage(window.localStorage, DEVICE_ID_STORAGE_KEY, deviceId)
  return deviceId
}

export const getCheckoutSessionId = () => {
  if (typeof window === 'undefined') return null
  return safeGetStorage(window.sessionStorage, SESSION_ID_STORAGE_KEY)
}

export const getLandingSessionId = () => {
  if (typeof window === 'undefined') return null
  return safeGetStorage(window.sessionStorage, LANDING_SESSION_ID_STORAGE_KEY)
}

const getStoredAdId = () => {
  if (typeof window === 'undefined') return null
  return safeGetStorage(window.localStorage, AD_ID_STORAGE_KEY)
}

const getCheckoutContext = () => {
  if (typeof window === 'undefined') return {}

  const rawContext = safeGetStorage(window.sessionStorage, SESSION_CONTEXT_STORAGE_KEY)
  if (!rawContext) return {}

  try {
    return JSON.parse(rawContext) || {}
  } catch (error) {
    console.warn('解析 checkout 埋点上下文失败:', error)
    return {}
  }
}

const saveCheckoutContext = (context) => {
  if (typeof window === 'undefined') return
  safeSetStorage(window.sessionStorage, SESSION_CONTEXT_STORAGE_KEY, JSON.stringify(context))
}

const parseStoredTimestamp = (value) => {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

const sameValue = (left, right) => String(left || '') === String(right || '')

const hashStringToBucket = (value) => {
  const text = String(value || '')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 100
}

const getUrlQuantityVariantOverride = () => {
  if (typeof window === 'undefined') return null

  try {
    const params = new URLSearchParams(window.location.search)
    return normalizeCheckoutQuantityVariant(params.get('checkout_quantity_variant'))
  } catch {
    return null
  }
}

export const getCheckoutQuantityExperiment = () => {
  const fallback = {
    checkout_quantity_experiment: QUANTITY_FLOW_EXPERIMENT,
    checkout_quantity_variant: QUANTITY_MODAL_VARIANT,
    checkout_quantity_ab_group: 'holdout',
    checkout_quantity_holdout_percent: QUANTITY_FLOW_HOLDOUT_PERCENT,
    checkout_quantity_inline_percent: QUANTITY_FLOW_INLINE_PERCENT,
    checkout_quantity_map_search_percent: QUANTITY_FLOW_MAP_SEARCH_PERCENT,
    checkout_quantity_trust_percent: QUANTITY_FLOW_TRUST_PERCENT,
    checkout_quantity_trust_landing_percent: QUANTITY_FLOW_TRUST_LANDING_PERCENT,
    checkout_quantity_address_first_percent: QUANTITY_FLOW_ADDRESS_FIRST_PERCENT,
    checkout_quantity_single_page_percent: QUANTITY_FLOW_SINGLE_PAGE_PERCENT,
    checkout_quantity_single_page_review_percent: QUANTITY_FLOW_SINGLE_PAGE_REVIEW_PERCENT,
    checkout_quantity_split: `${QUANTITY_FLOW_HOLDOUT_PERCENT}/${QUANTITY_FLOW_INLINE_PERCENT}/${QUANTITY_FLOW_MAP_SEARCH_PERCENT}/${QUANTITY_FLOW_TRUST_PERCENT}/${QUANTITY_FLOW_TRUST_LANDING_PERCENT}/${QUANTITY_FLOW_ADDRESS_FIRST_PERCENT}/${QUANTITY_FLOW_SINGLE_PAGE_PERCENT}/${QUANTITY_FLOW_SINGLE_PAGE_REVIEW_PERCENT}`
  }

  if (typeof window === 'undefined') return fallback

  const urlOverride = getUrlQuantityVariantOverride()
  if (urlOverride) {
    return {
      ...fallback,
      checkout_quantity_variant: urlOverride,
      checkout_quantity_ab_group: getVariantGroup(urlOverride)
    }
  }

  const cached = normalizeCheckoutQuantityVariant(safeGetStorage(window.localStorage, QUANTITY_EXPERIMENT_STORAGE_KEY))
  if (cached) {
    return {
      ...fallback,
      checkout_quantity_variant: cached,
      checkout_quantity_ab_group: getVariantGroup(cached)
    }
  }

  const bucket = hashStringToBucket(getCheckoutDeviceId())
  const inlineLimit = QUANTITY_FLOW_HOLDOUT_PERCENT + QUANTITY_FLOW_INLINE_PERCENT
  const mapSearchLimit = inlineLimit + QUANTITY_FLOW_MAP_SEARCH_PERCENT
  const trustLimit = mapSearchLimit + QUANTITY_FLOW_TRUST_PERCENT
  const trustLandingLimit = trustLimit + QUANTITY_FLOW_TRUST_LANDING_PERCENT
  const addressFirstLimit = trustLandingLimit + QUANTITY_FLOW_ADDRESS_FIRST_PERCENT
  const singlePageLimit = addressFirstLimit + QUANTITY_FLOW_SINGLE_PAGE_PERCENT
  const singlePageReviewLimit = singlePageLimit + QUANTITY_FLOW_SINGLE_PAGE_REVIEW_PERCENT
  const variant = bucket < QUANTITY_FLOW_HOLDOUT_PERCENT
    ? QUANTITY_MODAL_VARIANT
    : bucket < inlineLimit
    ? INLINE_QUANTITY_VARIANT
    : bucket < mapSearchLimit
    ? INLINE_QUANTITY_MAP_SEARCH_VARIANT
    : bucket < trustLimit
    ? COD_TRUST_VARIANT
    : bucket < trustLandingLimit
    ? COD_TRUST_LANDING_VARIANT
    : bucket < addressFirstLimit
    ? ADDRESS_FIRST_VARIANT
    : bucket < singlePageLimit
    ? SINGLE_PAGE_CHECKOUT_VARIANT
    : bucket < singlePageReviewLimit
    ? SINGLE_PAGE_REVIEW_VARIANT
    : ADDRESS_FIRST_VARIANT
  safeSetStorage(window.localStorage, QUANTITY_EXPERIMENT_STORAGE_KEY, variant)
  return {
    ...fallback,
    checkout_quantity_variant: variant,
    checkout_quantity_ab_group: getVariantGroup(variant)
  }
}

const canReusePendingCheckoutSession = (existingContext, nextContext) => {
  if (!existingContext?.checkout_started_at) return false
  if (existingContext.quantity_confirmed_at) return false
  if (!sameValue(existingContext.product_id, nextContext.product_id)) return false
  if (!sameValue(existingContext.ad_id, nextContext.ad_id)) return false
  if (!sameValue(existingContext.product_type, nextContext.product_type)) return false

  const startedAt = parseStoredTimestamp(existingContext.checkout_started_at)
  if (!startedAt) return false
  return Date.now() - startedAt <= PENDING_CHECKOUT_REUSE_MS
}

const getSku = (product) => {
  if (!product?.skus || product.skus.length === 0) return null
  return product.skus[0]
}

export const buildCheckoutProductProperties = (product, extra = {}) => {
  const sku = getSku(product)
  const quantity = extra.quantity || 1
  const unitPrice = Number(product?.price || extra.unit_price || 0)
  const quantityExperiment = extra.checkout_quantity_experiment
    ? {
      checkout_quantity_experiment: extra.checkout_quantity_experiment,
      checkout_quantity_variant: extra.checkout_quantity_variant,
      checkout_quantity_ab_group: extra.checkout_quantity_ab_group,
      checkout_quantity_holdout_percent: extra.checkout_quantity_holdout_percent,
      checkout_quantity_inline_percent: extra.checkout_quantity_inline_percent,
      checkout_quantity_map_search_percent: extra.checkout_quantity_map_search_percent,
      checkout_quantity_trust_percent: extra.checkout_quantity_trust_percent,
      checkout_quantity_trust_landing_percent: extra.checkout_quantity_trust_landing_percent,
      checkout_quantity_address_first_percent: extra.checkout_quantity_address_first_percent,
      checkout_quantity_single_page_percent: extra.checkout_quantity_single_page_percent,
      checkout_quantity_single_page_review_percent: extra.checkout_quantity_single_page_review_percent,
      checkout_quantity_split: extra.checkout_quantity_split
    }
    : getCheckoutQuantityExperiment()

  return {
    checkout_flow: CHECKOUT_FLOW,
    ...quantityExperiment,
    product_id: product?.product_id ? String(product.product_id) : extra.product_id || null,
    product_name: product?.name_fr || extra.product_name || null,
    internal_no: product?.internal_no || extra.internal_no || null,
    category_id: product?.category_id ? String(product.category_id) : extra.category_id || null,
    product_type: extra.product_type || product?.product_type || 'product',
    landing_session_id: extra.landing_session_id || getLandingSessionId() || null,
    sku_id: sku?.sku_id ? String(sku.sku_id) : extra.sku_id || (product?.product_id ? String(product.product_id) : null),
    sku_name: sku?.name_fr || extra.sku_name || null,
    quantity,
    unit_price: unitPrice,
    total_price: Number(extra.total_price ?? unitPrice * quantity),
    currency: extra.currency || 'FCFA',
    ad_id: extra.ad_id || getStoredAdId() || null
  }
}

export const startLandingSession = () => {
  const landingSessionId = createId('landing')

  if (typeof window !== 'undefined') {
    safeSetStorage(window.sessionStorage, LANDING_SESSION_ID_STORAGE_KEY, landingSessionId)
  }

  return landingSessionId
}

export const startCheckoutSession = (product, extra = {}) => {
  const checkoutSessionId = createId('checkout')
  const context = {
    ...buildCheckoutProductProperties(product, extra),
    checkout_started_at: extra.checkout_started_at || new Date().toISOString()
  }

  if (typeof window !== 'undefined') {
    safeSetStorage(window.sessionStorage, SESSION_ID_STORAGE_KEY, checkoutSessionId)
    saveCheckoutContext(context)
  }

  return checkoutSessionId
}

export const resumeCheckoutSession = (checkoutSessionId, product, extra = {}) => {
  if (!checkoutSessionId || typeof window === 'undefined') return null

  safeSetStorage(window.sessionStorage, SESSION_ID_STORAGE_KEY, checkoutSessionId)
  saveCheckoutContext(buildCheckoutProductProperties(product, extra))
  return checkoutSessionId
}

export const updateCheckoutContext = (product, extra = {}) => {
  const currentContext = getCheckoutContext()
  const nextContext = {
    ...currentContext,
    ...buildCheckoutProductProperties(product, {
      ...currentContext,
      ...extra
    })
  }
  saveCheckoutContext(nextContext)
  return nextContext
}

const getPageProperties = () => {
  if (typeof window === 'undefined') return {}

  return {
    page_url: window.location.href,
    page_path: window.location.pathname,
    referrer: document.referrer || null
  }
}

const sendAnalyticsPayload = (payload) => {
  const url = buildApiUrl(ANALYTICS_ENDPOINT)
  const body = JSON.stringify(payload)

  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon(url, blob)) return
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch((error) => {
      console.warn('checkout 埋点上报失败:', error)
    })
  } catch (error) {
    console.warn('checkout 埋点发送异常:', error)
  }
}

export const trackCheckoutEvent = (eventName, properties = {}, options = {}) => {
  const sessionId = options.sessionId || getCheckoutSessionId()
  if (!sessionId) return null

  const context = getCheckoutContext()
  const trackedAt = new Date().toISOString()
  const eventProperties = {
    ...context,
    ...properties,
    checkout_flow: CHECKOUT_FLOW,
    event_id: createId('event'),
    ...getPageProperties()
  }

  if (eventName === 'quantity_confirmed') {
    saveCheckoutContext({
      ...eventProperties,
      quantity_confirmed_at: trackedAt
    })
  }

  sendAnalyticsPayload({
    device_id: getCheckoutDeviceId(),
    platform: 'web',
    app_version: 'cod-ecommerce-web',
    events: [
      {
        event_name: eventName,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        properties: eventProperties
      }
    ]
  })

  return sessionId
}

export const trackProductLandingView = (product, extra = {}) => {
  const landingSessionId = startLandingSession(product, extra)
  const eventProperties = {
    ...buildCheckoutProductProperties(product, {
      ...extra,
      landing_session_id: landingSessionId
    }),
    checkout_flow: CHECKOUT_FLOW,
    event_id: createId('event'),
    ...getPageProperties()
  }

  sendAnalyticsPayload({
    device_id: getCheckoutDeviceId(),
    platform: 'web',
    app_version: 'cod-ecommerce-web',
    events: [
      {
        event_name: 'product_landing_view',
        session_id: landingSessionId,
        timestamp: new Date().toISOString(),
        properties: eventProperties
      }
    ]
  })

  return landingSessionId
}

export const trackProductLandingEngagement = (product, extra = {}) => {
  const landingSessionId = extra.landing_session_id || getLandingSessionId()
  if (!landingSessionId) return null

  const eventProperties = {
    ...buildCheckoutProductProperties(product, {
      ...extra,
      landing_session_id: landingSessionId
    }),
    checkout_flow: CHECKOUT_FLOW,
    event_id: createId('event'),
    landing_session_id: landingSessionId,
    landing_duration_ms: Math.max(0, Math.round(Number(extra.landing_duration_ms || 0))),
    landing_max_scroll_percent: Math.min(Math.max(Number(extra.landing_max_scroll_percent || 0), 0), 100),
    landing_exit_reason: extra.landing_exit_reason || 'unknown',
    ...getPageProperties()
  }

  sendAnalyticsPayload({
    device_id: getCheckoutDeviceId(),
    platform: 'web',
    app_version: 'cod-ecommerce-web',
    events: [
      {
        event_name: 'product_landing_engagement',
        session_id: landingSessionId,
        timestamp: new Date().toISOString(),
        properties: eventProperties
      }
    ]
  })

  return landingSessionId
}

export const beginCheckoutFunnel = (product, extra = {}) => {
  const nextContext = buildCheckoutProductProperties(product, extra)
  const existingSessionId = getCheckoutSessionId()
  const existingContext = getCheckoutContext()

  if (existingSessionId && canReusePendingCheckoutSession(existingContext, nextContext)) {
    saveCheckoutContext({
      ...existingContext,
      ...nextContext,
      checkout_started_at: existingContext.checkout_started_at
    })
    return existingSessionId
  }

  const sessionId = startCheckoutSession(product, extra)
  trackCheckoutEvent('checkout_start', buildCheckoutProductProperties(product, extra), { sessionId })
  return sessionId
}
