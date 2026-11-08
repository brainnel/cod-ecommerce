// BabiDrama short-drama recommendations shown on the order-success page.
// Everything here is optional: no function may throw into the page, and every
// failure (network, timeout, malformed data, empty list) simply hides the card.

export const DRAMA_PICKS_TIMEOUT_MS = 2500
export const DRAMA_MAX_SERIES = 5
export const DRAMA_MAX_EVENTS = 6
// open = « Continuer sur BabiDrama » / « Épisode 2 » from the inline player.
export const DRAMA_EVENT_TYPES = ['impression', 'click', 'open']

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
  return { mode, series: ordered.slice(0, DRAMA_MAX_SERIES) }
}

// JSON text for the events endpoint (sent as text/plain), or null when there
// is no valid event. At most DRAMA_MAX_EVENTS events per request.
export const buildEventsBody = (pid, events) => {
  if (!pid || !Array.isArray(events)) return null
  const valid = events
    .filter((event) => event && DRAMA_EVENT_TYPES.includes(event.type)
      && typeof event.slug === 'string' && event.slug
      && Number.isInteger(event.slot) && event.slot >= 0 && event.slot < DRAMA_MAX_SERIES)
    .slice(0, DRAMA_MAX_EVENTS)
    .map(({ type, slug, slot }) => ({ type, slug, slot }))
  if (!valid.length) return null
  return JSON.stringify({ pid: String(pid), events: valid })
}

// Fire-and-forget: never awaited, never throws. Returns true when a request
// was handed to the browser.
export const sendDramaEvents = (pid, events, {
  baseUrl = getDramaBaseUrl(),
  navigatorImpl = globalThis.navigator,
  fetchImpl = globalThis.fetch,
} = {}) => {
  try {
    const body = buildEventsBody(pid, events)
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
