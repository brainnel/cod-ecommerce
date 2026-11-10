// BabiDrama short-drama recommendations shown on the order-success page.
// Everything here is optional: no function may throw into the page, and every
// failure (network, timeout, malformed data, empty list) simply hides the card.

export const DRAMA_PICKS_TIMEOUT_MS = 2500
export const DRAMA_MAX_SERIES = 5
export const DRAMA_MAX_EVENTS = 6
// open = « Continuer sur BabiDrama » / « Épisode 2 » from the inline player
// (with `src`, the link used); play = the inline episode 1 started; complete =
// an episode played to its end in the card (`ep`; BabiDrama orders the big
// card by the finished episodes 1); quarter = episode 1 reached a quarter of
// its length in the card.
export const DRAMA_EVENT_TYPES = ['impression', 'click', 'open', 'complete', 'play', 'quarter']

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

// Since 2026-11-10 d is the baseline, and BabiDrama describes the versions of
// the card itself with the picks (`versions`): the id it counts the page under
// (`v` on events and links), a weight, the handoff the version is built on
// (`base`: a, c or d above) and switches on top of it:
//   hook: the series' hook line is the card's headline, above the player;
//   handoffAfter: BabiDrama opens after that many episodes played here
//     (base d), instead of where the free episodes end.
// A new version made of these needs no release here. `variants` (the three
// weights) remains the fallback when `versions` is missing or malformed.
export const DRAMA_VERSION_BASES = ['a', 'c', 'd']
export const DRAMA_MAX_VERSIONS = 8
const VERSION_ID = /^[a-z][a-z0-9]{0,7}$/
export const isDramaVersionId = (value) => typeof value === 'string' && VERSION_ID.test(value)

// [{ id, base, weight, hook, handoffAfter }] in BabiDrama's order, or null:
// not a list, a malformed entry (the whole list is then distrusted) or no
// weight above 0. A version built on a base this build does not know is left
// out: it gets no order page from here.
export const normalizeVersions = (value) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > DRAMA_MAX_VERSIONS) return null
  const versions = []
  const seen = new Set()
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const weight = Number(item.weight)
    if (!isDramaVersionId(item.id) || seen.has(item.id)) return null
    if (item.weight === null || item.weight === '' || !Number.isFinite(weight) || weight < 0) return null
    seen.add(item.id)
    if (!DRAMA_VERSION_BASES.includes(item.base)) continue
    const handoffAfter = Number(item.handoffAfter)
    versions.push({
      id: item.id,
      base: item.base,
      weight: Math.floor(weight),
      hook: item.hook === true,
      handoffAfter: Number.isInteger(handoffAfter) && handoffAfter >= 1 && handoffAfter <= 30 ? handoffAfter : null,
    })
  }
  return versions.some((version) => version.weight > 0) ? versions : null
}

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

const orderKeyText = (orderKey) => (orderKey === null || orderKey === undefined ? '' : String(orderKey).trim())

// FNV-1a of the order key, as an unsigned 32-bit integer.
const fnv1a = (key) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

// FNV-1a mixes its low bits poorly (order numbers differ in their last
// digits), so a murmur3 finalizer spreads them before a point is taken.
const spread = (value) => {
  let hash = value
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  return (hash ^ (hash >>> 16)) >>> 0
}

// FNV-1a over the order key: the same order always gets the same variant, and
// consecutive order numbers spread evenly. No key (nothing to hash): 'a'.
// With `weights` (BabiDrama's shares) the hash picks a point of the order's own
// and the versions take their share of the line, so an order keeps its version
// while the shares stay the same.
export const dramaVariant = (orderKey, override = null, weights = null) => {
  if (DRAMA_KNOWN_VARIANTS.includes(override)) return override
  const key = orderKeyText(orderKey)
  const shares = normalizeWeights(weights)
  if (!key) return shares ? DRAMA_VARIANTS.find((variant) => shares[variant] > 0) : DRAMA_VARIANTS[0]
  const hash = fnv1a(key)
  if (!shares) return DRAMA_VARIANTS[hash % DRAMA_VARIANTS.length]
  const total = DRAMA_VARIANTS.reduce((sum, variant) => sum + shares[variant], 0)
  let point = spread(hash) % total
  for (const variant of DRAMA_VARIANTS) {
    if (point < shares[variant]) return variant
    point -= shares[variant]
  }
  return DRAMA_VARIANTS[0]
}

const plainVersion = (id) => ({ id, base: id, weight: 0, hook: false, handoffAfter: null })

// The version of the card an order page gets, as { id, base, hook,
// handoffAfter }: from BabiDrama's `versions` when the picks carry a usable
// list (the order's point on the line of their weights, as above), else the
// variant of the three weights with nothing on top. `override` (dev preview)
// names a version of the list, or one of the plain variants.
export const dramaVersion = (orderKey, override = null, { versions = null, variants = null } = {}) => {
  const list = normalizeVersions(versions)
  if (typeof override === 'string' && override) {
    const named = list?.find((version) => version.id === override)
    if (named) return named
    if (DRAMA_KNOWN_VARIANTS.includes(override)) return plainVersion(override)
  }
  if (!list) return plainVersion(dramaVariant(orderKey, null, variants))
  const live = list.filter((version) => version.weight > 0)
  const key = orderKeyText(orderKey)
  if (!key) return live[0]
  const total = live.reduce((sum, version) => sum + version.weight, 0)
  let point = spread(fnv1a(key)) % total
  for (const version of live) {
    if (point < version.weight) return version
    point -= version.weight
  }
  return live[0]
}

// A BabiDrama link with what its analytics read: `p` (product), `src` (which
// link of the card) and `v` (the version's id). An URL that cannot be parsed
// is returned unchanged; unknown values are left out.
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
  if (isDramaVersionId(variant)) parsed.searchParams.set('v', variant)
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
  return {
    mode,
    series: ordered.slice(0, DRAMA_MAX_SERIES),
    variants: normalizeWeights(response.variants),
    versions: normalizeVersions(response.versions),
  }
}

// JSON text for the events endpoint (sent as text/plain), or null when there
// is no valid event. At most DRAMA_MAX_EVENTS events per request.
// `variant` (the id of the card version of this page view) goes with every
// request as `v`; an open carries the link used (`src`), a finished episode
// its number (`ep`, from episode 2 on).
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
    ...(isDramaVersionId(variant) ? { v: variant } : {}),
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
