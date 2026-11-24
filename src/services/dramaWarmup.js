// Asks BabiDrama for the confirmation page's picks while the customer is still
// on the checkout, and opens the connections its player needs at the moment the
// order is sent. Measured 2026-11-11…15 on 6,098 orders: the card appeared 1 to
// 2.5 s after the order (median 1.6 s: the page's code, then a first connection
// to babidrama.com) and never on 11.6 % of them, where the 2.5 s the picks were
// given ran out; the first picture came another 1.4 s later, and 42 % of the
// customers who saw it had left within 5 s.
//
// Not wired into the checkout as of 2026-11-24: PaymentPage.jsx calls neither
// scheduleDramaWarm (in an effect on the product) nor warmDramaAtOrder (when the
// order is sent) yet, so the confirmation page asks for its picks itself.
//
// Self-contained on purpose: the checkout imports this file alone, so none of
// the card's code is loaded before the order and nothing of it can fail there.
// The confirmation page reads the answer from `globalThis` (dramaPicks.js
// `takeWarmPicks`). Nothing here throws, waits for anything or touches the
// order.

export const DRAMA_WARM_KEY = '__bdDramaWarm'
// After the checkout appeared: its own requests go first.
export const DRAMA_WARM_DELAY_MS = 2000
export const DRAMA_WARM_TIMEOUT_MS = 10000
// Where the episodes are played from (the signed URLs of the episode answer).
export const DRAMA_MEDIA_ORIGIN = 'https://v.babidrama.com'

const DEFAULT_BASE_URL = 'https://babidrama.com'
const PICKS_PATH = '/api/partner/brainnel/picks'

export const warmBaseUrl = () => String(import.meta.env?.VITE_BABIDRAMA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')

// The same ids as dramaPicks.js `pidForProduct` (tests/dramaWarmup.test.js
// keeps the two alike): digits for a product, "bundle-<id>" for the checkout's
// synthetic "bundle:<id>", nothing otherwise.
export const warmPid = (product) => {
  const raw = product?.product_id
  if (raw === null || raw === undefined) return null
  const id = String(raw).trim()
  if (/^\d+$/.test(id)) return id
  const bundle = id.match(/^bundle:(\d+)$/)
  return bundle ? `bundle-${bundle[1]}` : null
}

// Starts the request for the product's picks unless one is already held for it
// (pending or answered; a failed one is asked again). The entry on `store` is
// { pid, at, failed, promise }: `promise` resolves to BabiDrama's raw answer,
// or to null when the request failed. Returns true when a request was started.
export const warmDramaPicks = (product, {
  fetchImpl = globalThis.fetch,
  store = globalThis,
  baseUrl = warmBaseUrl(),
  now = Date.now,
  timers = globalThis,
  timeoutMs = DRAMA_WARM_TIMEOUT_MS,
} = {}) => {
  try {
    const pid = warmPid(product)
    if (!pid || typeof fetchImpl !== 'function') return false
    const held = store[DRAMA_WARM_KEY]
    if (held && held.pid === pid && !held.failed) return false
    const entry = { pid, at: now(), failed: false, promise: null }
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = timers.setTimeout(() => { try { controller?.abort() } catch { /* nothing to stop */ } }, timeoutMs)
    // Sent at once; a fetch that throws instead of rejecting is a failed request like another.
    const ask = () => {
      try {
        return Promise.resolve(fetchImpl(`${String(baseUrl).replace(/\/+$/, '')}${PICKS_PATH}?pid=${encodeURIComponent(pid)}`, {
          method: 'GET',
          credentials: 'omit',
          headers: { Accept: 'application/json' },
          ...(controller ? { signal: controller.signal } : {}),
        }))
      } catch (error) {
        return Promise.reject(error)
      }
    }
    entry.promise = ask()
      .then((response) => (response?.ok ? response.json() : null))
      .catch(() => null)
      .then((payload) => {
        try { timers.clearTimeout(timer) } catch { /* already fired */ }
        const answer = payload && typeof payload === 'object' ? payload : null
        if (!answer) entry.failed = true
        return answer
      })
    store[DRAMA_WARM_KEY] = entry
    return true
  } catch {
    return false
  }
}

// The checkout's effect: asks for the picks a moment after the page appeared.
// Returns the cleanup that cancels a request not started yet.
export const scheduleDramaWarm = (product, { delayMs = DRAMA_WARM_DELAY_MS, timers = globalThis, ...options } = {}) => {
  try {
    if (!warmPid(product)) return () => {}
    const timer = timers.setTimeout(() => { warmDramaPicks(product, { timers, ...options }) }, delayMs)
    return () => { try { timers.clearTimeout(timer) } catch { /* already fired */ } }
  } catch {
    return () => {}
  }
}

// <link rel="preconnect"> once per origin. `crossorigin`: the card's requests
// carry no credentials, and a connection opened with them would not be reused.
const preconnect = (documentImpl, origin) => {
  const head = documentImpl?.head
  if (!head || typeof documentImpl.createElement !== 'function') return false
  if (typeof documentImpl.querySelector === 'function'
    && documentImpl.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return false
  const link = documentImpl.createElement('link')
  link.rel = 'preconnect'
  link.href = origin
  link.crossOrigin = 'anonymous'
  head.appendChild(link)
  return true
}

// At the moment the order is sent: the picks if nothing answered yet, and the
// connections to BabiDrama and to its video host, so that the episode and its
// first picture do not start with two handshakes each. Returns the number of
// connections asked for.
export const warmDramaAtOrder = (product, { documentImpl = globalThis.document, baseUrl = warmBaseUrl(), ...options } = {}) => {
  try {
    if (!warmPid(product)) return 0
    warmDramaPicks(product, { baseUrl, ...options })
    let opened = 0
    // A relative base (the local preview's proxy) is this site: nothing to open for it.
    const origins = [DRAMA_MEDIA_ORIGIN]
    try { origins.unshift(new URL(baseUrl).origin) } catch { /* same origin */ }
    for (const origin of new Set(origins)) {
      try { if (preconnect(documentImpl, origin)) opened += 1 } catch { /* the card connects by itself */ }
    }
    return opened
  } catch {
    return 0
  }
}
