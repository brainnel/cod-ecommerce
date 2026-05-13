import { buildApiUrl } from '../config/api.config.js'

const ANALYTICS_ENDPOINT = '/api/vite/analytics/events'
const DEVICE_ID_STORAGE_KEY = 'cod_checkout_device_id'
const LANDING_SESSION_ID_STORAGE_KEY = 'cod_landing_session_id'
const SESSION_ID_STORAGE_KEY = 'cod_checkout_session_id'
const SESSION_CONTEXT_STORAGE_KEY = 'cod_checkout_context'
const AD_ID_STORAGE_KEY = 'facebook_ad_id'
const CHECKOUT_FLOW = 'cod_checkout'

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

const getSku = (product) => {
  if (!product?.skus || product.skus.length === 0) return null
  return product.skus[0]
}

export const buildCheckoutProductProperties = (product, extra = {}) => {
  const sku = getSku(product)
  const quantity = extra.quantity || 1
  const unitPrice = Number(product?.price || extra.unit_price || 0)

  return {
    checkout_flow: CHECKOUT_FLOW,
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

export const startLandingSession = (product, extra = {}) => {
  const landingSessionId = createId('landing')

  if (typeof window !== 'undefined') {
    safeSetStorage(window.sessionStorage, LANDING_SESSION_ID_STORAGE_KEY, landingSessionId)
  }

  return landingSessionId
}

export const startCheckoutSession = (product, extra = {}) => {
  const checkoutSessionId = createId('checkout')
  const context = buildCheckoutProductProperties(product, extra)

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
  const eventProperties = {
    ...context,
    ...properties,
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

export const beginCheckoutFunnel = (product, extra = {}) => {
  const sessionId = startCheckoutSession(product, extra)
  trackCheckoutEvent('checkout_start', buildCheckoutProductProperties(product, extra), { sessionId })
  return sessionId
}
