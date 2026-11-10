// A free episode of a BabiDrama series (episode 1, then the following ones in
// variant d), autoplayed inline in the order-success card.
// Like the picks, nothing here may throw into the page: every failure resolves
// to a status, and the card then shows the cover and its link instead.

import { getDramaBaseUrl, trimDramaBase } from './dramaPicks.js'

export const DRAMA_EPISODE_TIMEOUT_MS = 8000
// No `canplay` this long after the source is set: the video counts as failed.
export const DRAMA_START_TIMEOUT_MS = 8000
// BabiDrama's watch page resumes at `?t=` only once something was watched.
export const DRAMA_RESUME_AFTER_S = 3
// Smallest first: mobile data is expensive, 480p is what the card plays.
export const DRAMA_RENDITIONS = ['480p', '720p', '1080p']

const EPISODE_PATH = '/api/partner/brainnel/episode'
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

// Highest episode BabiDrama serves to the shop (free episodes only, 404 beyond).
export const DRAMA_INLINE_MAX_EPISODE = 30

export const episodeNumber = (value) => {
  const number = Number(value)
  return Number.isInteger(number) && number >= 1 && number <= DRAMA_INLINE_MAX_EPISODE ? number : 1
}

// `&ep=` only from episode 2 on: episode 1 keeps the URL (and edge cache entry) it always had.
export const episodeUrl = (base, slug, ep = 1) => {
  const url = `${trimDramaBase(base)}${EPISODE_PATH}?slug=${encodeURIComponent(slug)}`
  const number = episodeNumber(ep)
  return number > 1 ? `${url}&ep=${number}` : url
}

const parseUrl = (value) => {
  if (typeof value !== 'string' || !value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

// Video and poster sources: https only. Plain http is accepted for a loopback
// host only when the caller allows it (the dev preview proxy on 127.0.0.1).
export const isMediaUrl = (value, { allowLoopbackHttp = false } = {}) => {
  const url = parseUrl(value)
  if (!url) return false
  if (url.protocol === 'https:') return true
  return allowLoopbackHttp && url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
}

// Links become hrefs: http(s) only, never javascript: or relative paths.
const isLinkUrl = (value) => {
  const url = parseUrl(value)
  return Boolean(url) && (url.protocol === 'https:' || url.protocol === 'http:')
}

// watchUrl + `t=<whole seconds>` once more than 3 s were played; otherwise the
// watch URL unchanged (also when it cannot be parsed).
export const continueUrl = (watchUrl, currentTime) => {
  const seconds = Number(currentTime)
  if (!Number.isFinite(seconds) || seconds <= DRAMA_RESUME_AFTER_S) return watchUrl
  const url = parseUrl(watchUrl)
  if (!url) return watchUrl
  url.searchParams.set('t', String(Math.floor(seconds)))
  return url.toString()
}

const toSeconds = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && value !== null && value !== '' ? Math.floor(number) : null
}

// Validates the episode response. Returns null unless it is the requested
// series with a usable watch link and at least one acceptable rendition.
export const normalizeEpisode = (payload, { slug, allowLoopbackHttp = false } = {}) => {
  if (!payload || typeof payload !== 'object') return null
  const payloadSlug = typeof payload.slug === 'string' ? payload.slug.trim() : ''
  if (!payloadSlug || (slug && payloadSlug !== slug)) return null
  if (!isLinkUrl(payload.watchUrl)) return null
  const urls = payload.urls && typeof payload.urls === 'object' ? payload.urls : {}
  const rendition = DRAMA_RENDITIONS.find((name) => isMediaUrl(urls[name], { allowLoopbackHttp }))
  if (!rendition) return null
  return {
    slug: payloadSlug,
    title: typeof payload.title === 'string' ? payload.title.trim() : '',
    rendition,
    videoUrl: urls[rendition],
    posterUrl: isMediaUrl(payload.posterUrl, { allowLoopbackHttp }) ? payload.posterUrl : null,
    durationS: toSeconds(payload.durationS),
    watchUrl: payload.watchUrl,
    nextUrl: isLinkUrl(payload.nextUrl) ? payload.nextUrl : null,
    episodeIndex: episodeNumber(payload.episodeIndex),
    // The next episode is free and ready: the card may go on with it (variant d).
    nextInline: payload.nextInline === true,
  }
}

// Resolves to { status: 'ok', episode } | { status: 'not_found' } |
// { status: 'error', reason: 'timeout' | 'network' | 'http' | 'invalid' } |
// { status: 'aborted' }. Never rejects. Called only when the card is about to
// play: every response issues new signed playback URLs.
export const fetchDramaEpisode = async (slug, {
  ep = 1,
  timeoutMs = DRAMA_EPISODE_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  baseUrl = getDramaBaseUrl(),
  allowLoopbackHttp = false,
  signal,
  timers = globalThis,
} = {}) => {
  if (!slug || typeof fetchImpl !== 'function') return { status: 'error', reason: 'invalid' }
  if (signal?.aborted) return { status: 'aborted' }
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener?.('abort', abort)
  let timer
  const timeout = new Promise((resolve) => {
    timer = timers.setTimeout(() => { abort(); resolve({ status: 'error', reason: 'timeout' }) }, timeoutMs)
  })
  const request = (async () => {
    const response = await fetchImpl(episodeUrl(baseUrl, slug, ep), {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (response?.status === 404) return { status: 'not_found' }
    if (!response?.ok) return { status: 'error', reason: 'http' }
    let payload
    try {
      payload = await response.json()
    } catch {
      return controller.signal.aborted ? { status: 'aborted' } : { status: 'error', reason: 'invalid' }
    }
    if (controller.signal.aborted) return { status: 'aborted' }
    const episode = normalizeEpisode(payload, { slug, allowLoopbackHttp })
    return episode ? { status: 'ok', episode } : { status: 'error', reason: 'invalid' }
  })().catch(() => (signal?.aborted ? { status: 'aborted' } : { status: 'error', reason: 'network' }))
  try {
    return await Promise.race([request, timeout])
  } finally {
    timers.clearTimeout(timer)
    signal?.removeEventListener?.('abort', abort)
  }
}

// Whole seconds actually played (sum of the video's `played` ranges).
export const playedSeconds = (ranges) => {
  try {
    let total = 0
    for (let index = 0; index < (ranges?.length || 0); index += 1) {
      total += Math.max(0, ranges.end(index) - ranges.start(index))
    }
    return Number.isFinite(total) ? Math.floor(total) : 0
  } catch {
    return 0
  }
}

export const freeEpisodesLine = (count) => {
  if (!Number.isInteger(count) || count < 1) return ''
  return count === 1 ? 'Le premier épisode est gratuit' : `Les ${count} premiers épisodes sont gratuits`
}
