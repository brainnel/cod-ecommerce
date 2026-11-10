// BabiDrama short-drama recommendations shown on the order-success page.
// Everything here is optional: no function may throw into the page, and every
// failure (network, timeout, malformed data, empty list) simply hides the card.

export const DRAMA_PICKS_TIMEOUT_MS = 2500
export const DRAMA_MAX_SERIES = 5
export const DRAMA_MAX_EVENTS = 6
// open = « Continuer sur BabiDrama » / « Épisode 2 » from the inline player
// (with `src`, the link used); play = the inline episode 1 started; complete =
// an episode played to its end in the card (`ep`; BabiDrama orders the big
// card by the finished episodes 1).
export const DRAMA_EVENT_TYPES = ['impression', 'click', 'open', 'complete', 'play']

// Test of when the customer is sent to BabiDrama (2026-11-10). Measured on
// 2026-11-08…09: customers who finished episode 1 here and opened episode 2
// kept watching there (72 % watched an episode for 20 s or more), those who
// tapped « Continuer » a few seconds in mostly left within 20 s (14 %).
//   a: « Continuer sur BabiDrama » under the playing episode (as before);
//   b: no link while episode 1 plays, episode 2 offered when it ends (retired
//      the same day, see d);
//   c: as b, and episode 2 opens by itself after a countdown the customer
//      can cancel;
//   d: as c, but the following free episodes play here one after the other,
//      and BabiDrama only opens where the free episodes end. In the web view
//      most customers order from, a link opens in the same window: BabiDrama
//      replaced this page, and Back brought them here again within seconds.
// Orders are split over DRAMA_VARIANTS; d took b's third, so a and c kept
// theirs. DRAMA_KNOWN_VARIANTS are the versions the card can still render.
// BabiDrama sends the shares with the picks (`variants`: weights of a, c and
// d, set in its console and by its growth agent), so the split changes without
// a release here; equal thirds from the order number when it sends none.
export const DRAMA_VARIANTS = ['a', 'd', 'c']
export const DRAMA_KNOWN_VARIANTS = ['a', 'b', 'c', 'd']

// { a, c, d } as whole weights ≥ 0 with at least one above 0, or null.
export const normalizeWeights = (value) => {
  if (!value || typeof value !== 'object') return null
  const weights = {}
  let total = 0
  for (const variant of DRAMA_VARIANTS) {
    const weight = Number(value[variant])
    if (!Number.isFinite(weight) || weight < 0) return null
    weights[variant] = Math.floor(weight)
    total += weights[variant]
  }
  return total > 0 ? weights : null
}
export const DRAMA_AUTO_NEXT_SECONDS = 5
// Which link of the card opened BabiDrama (`src` on its URL).
export const DRAMA_LINK_SOURCES = ['continue', 'next', 'auto_next', 'thumbnail', 'fallback']

const DEFAULT_DRAMA_BASE_URL = 'https://babidrama.com'
const PICKS_PATH = '/api/partner/brainnel/picks'
const EVENTS_PATH = '/api/partner/brainnel/events'

export const getDramaBaseUrl = () => import.meta.env?.VITE_BABIDRAMA_BASE_URL || DEFAULT_DRAMA_BASE_URL

export const trimDramaBase = (base) => String(base || DEFAULT_DRAMA_BASE_URL).replace(/\/+$/, '')

// Single product: its numeric id. Bundle (synthetic product built by the
// checkout as "bundle:<id>"): "bundle-<id>". Anything else gets no card.
export const pidForProduct = (product) => {
  const raw = product?.product_id
  if (raw === null || raw === undefined) return null
  const id = String(raw).trim()
  if (/^\d+$/.test(id)) return id
  const bundle = id.match(/^bundle:(\d+)$/)
  return bundle ? `bundle-${bundle[1]}` : null
}

// FNV-1a over the order key: the same order always gets the same variant, and
// consecutive order numbers spread evenly. No key (nothing to hash): 'a'.
// With `weights` (BabiDrama's shares) the hash picks a point of the order's own
// and the versions take their share of the line, so an order keeps its version
// while the shares stay the same.
export const dramaVariant = (orderKey, override = null, weights = null) => {
  if (DRAMA_KNOWN_VARIANTS.includes(override)) return override
  const key = orderKey === null || orderKey === undefined ? '' : String(orderKey).trim()
  const shares = normalizeWeights(weights)
  if (!key) return shares ? DRAMA_VARIANTS.find((variant) => shares[variant] > 0) : DRAMA_VARIANTS[0]
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  hash >>>= 0
  if (!shares) return DRAMA_VARIANTS[hash % DRAMA_VARIANTS.length]
  const total = DRAMA_VARIANTS.reduce((sum, variant) => sum + shares[variant], 0)
  // FNV-1a mixes its low bits poorly (order numbers differ in their last
  // digits), so a murmur3 finalizer spreads them before taking the point.
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash = (hash ^ (hash >>> 16)) >>> 0
  let point = hash % total
  for (const variant of DRAMA_VARIANTS) {
    if (point < shares[variant]) return variant
    point -= shares[variant]
  }
  return DRAMA_VARIANTS[0]
}

// A BabiDrama link with what its analytics read: `p` (product), `src` (which
// link of the card) and `v` (variant). An URL that cannot be parsed is returned
// unchanged; unknown values are left out.
export const dramaLink = (url, { pid = null, source = null, variant = null } = {}) => {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return url
  if (pid && /^(?:\d{1,20}|bundle-\d{1,10})$/.test(String(pid))) parsed.searchParams.set('p', String(pid))
  if (DRAMA_LINK_SOURCES.includes(source)) parsed.searchParams.set('src', source)
  if (DRAMA_KNOWN_VARIANTS.includes(variant)) parsed.searchParams.set('v', variant)
  return parsed.toString()
}

export const picksUrl = (base, pid) => `${trimDramaBase(base)}${PICKS_PATH}?pid=${encodeURIComponent(pid)}`

export const eventsUrl = (base) => `${trimDramaBase(base)}${EVENTS_PATH}`

// Fisher–Yates on a copy; the input list is never mutated.
export const shuffle = (list, random = Math.random) => {
  const result = Array.isArray(list) ? [...list] : []
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(random() * (i + 1)))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const isWebUrl = (value) => {
  if (typeof value !== 'string' || !value) return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

// Inline data: images are accepted for covers only (used by the dev preview).
const normalizeCoverUrl = (value) => (
  isWebUrl(value) || (typeof value === 'string' && /^data:image\//.test(value)) ? value : null
)

const toCount = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && value !== null && value !== '' ? Math.floor(number) : null
}

const nonEmptyText = (value) => (typeof value === 'string' ? value.trim() : '')

export const normalizeSeries = (item) => {
  if (!item || typeof item !== 'object') return null
  const slug = nonEmptyText(item.slug)
  const title = nonEmptyText(item.title)
  // watchUrl becomes an href, so only http(s) links are ever rendered.
  if (!slug || !title || !isWebUrl(item.watchUrl)) return null
  return {
    slug,
    title,
    genres: Array.isArray(item.genres) ? item.genres.map(nonEmptyText).filter(Boolean) : [],
    episodeCount: toCount(item.episodeCount),
    freeEpisodes: toCount(item.freeEpisodes),
    hook: nonEmptyText(item.hook),
    coverUrl: normalizeCoverUrl(item.coverUrl),
    watchUrl: item.watchUrl,
  }
}

// Validates the picks response and returns the list in display order
// ("explore" is shuffled once, "ranked" keeps the API order), or null when
// there is nothing to show. Index 0 is the big card; 1..4 are thumbnails.
export const orderForDisplay = (response, random = Math.random) => {
  if (!response || typeof response !== 'object' || !Array.isArray(response.series)) return null
  const seen = new Set()
  const valid = []
  for (const item of response.series) {
    const series = normalizeSeries(item)
    if (!series || seen.has(series.slug)) continue
    seen.add(series.slug)
    valid.push(series)
  }
  if (!valid.length) return null
  const mode = response.mode === 'explore' ? 'explore' : 'ranked'
  const ordered = mode === 'explore' ? shuffle(valid, random) : valid
  return { mode, series: ordered.slice(0, DRAMA_MAX_SERIES), variants: normalizeWeights(response.variants) }
}

// JSON text for the events endpoint (sent as text/plain), or null when there
// is no valid event. At most DRAMA_MAX_EVENTS events per request.
// `variant` (the card version of this page view) goes with every request as
// `v`; an open carries the link used (`src`), a finished episode its number
// (`ep`, from episode 2 on).
export const buildEventsBody = (pid, events, variant = null) => {
  if (!pid || !Array.isArray(events)) return null
  const valid = events
    .filter((event) => event && DRAMA_EVENT_TYPES.includes(event.type)
      && typeof event.slug === 'string' && event.slug
      && Number.isInteger(event.slot) && event.slot >= 0 && event.slot < DRAMA_MAX_SERIES)
    .slice(0, DRAMA_MAX_EVENTS)
    .map(({ type, slug, slot, src, ep }) => ({
      type,
      slug,
      slot,
      ...(type === 'open' && DRAMA_LINK_SOURCES.includes(src) ? { src } : {}),
      ...(type === 'complete' && Number.isInteger(ep) && ep > 1 && ep <= 30 ? { ep } : {}),
    }))
  if (!valid.length) return null
  return JSON.stringify({
    pid: String(pid),
    ...(DRAMA_KNOWN_VARIANTS.includes(variant) ? { v: variant } : {}),
    events: valid,
  })
}

// Fire-and-forget: never awaited, never throws. Returns true when a request
// was handed to the browser.
export const sendDramaEvents = (pid, events, {
  variant = null,
  baseUrl = getDramaBaseUrl(),
  navigatorImpl = globalThis.navigator,
  fetchImpl = globalThis.fetch,
} = {}) => {
  try {
    const body = buildEventsBody(pid, events, variant)
    if (!body) return false
    const url = eventsUrl(baseUrl)
    if (typeof navigatorImpl?.sendBeacon === 'function') {
      try {
        if (navigatorImpl.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return true
      } catch {
        // Fall through to fetch.
      }
    }
    if (typeof fetchImpl !== 'function') return false
    const pending = fetchImpl(url, {
      method: 'POST',
      body,
      keepalive: true,
      mode: 'no-cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    })
    pending?.catch?.(() => {})
    return true
  } catch {
    return false
  }
}

// Resolves to orderForDisplay(...) or null; never rejects. The timeout also
// wins when a fetch implementation ignores the abort signal.
export const fetchDramaPicks = async (pid, {
  timeoutMs = DRAMA_PICKS_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  baseUrl = getDramaBaseUrl(),
  random = Math.random,
  signal,
  timers = globalThis,
} = {}) => {
  if (!pid || typeof fetchImpl !== 'function' || signal?.aborted) return null
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener?.('abort', abort)
  let timer
  const timeout = new Promise((resolve) => {
    timer = timers.setTimeout(() => { abort(); resolve(null) }, timeoutMs)
  })
  const request = (async () => {
    const response = await fetchImpl(picksUrl(baseUrl, pid), {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response?.ok) return null
    const payload = await response.json()
    return controller.signal.aborted ? null : orderForDisplay(payload, random)
  })().catch(() => null)
  try {
    return await Promise.race([request, timeout])
  } finally {
    timers.clearTimeout(timer)
    signal?.removeEventListener?.('abort', abort)
  }
}
