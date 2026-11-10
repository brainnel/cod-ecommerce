import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DRAMA_EPISODE_TIMEOUT_MS,
  continueUrl,
  episodeUrl,
  fetchDramaEpisode,
  freeEpisodesLine,
  isMediaUrl,
  normalizeEpisode,
  playedSeconds,
} from '../src/services/dramaEpisode.js'
import { buildEventsBody } from '../src/services/dramaPicks.js'

const signed = (quality) => `https://v.babidrama.com/v/01M6NYBBXC/1/${quality}.mp4?t=1794171600.sig-${quality}`
const payload = (extra = {}) => ({
  slug: 'numero-un-moins-que-rien',
  title: 'Numéro un, moins que rien',
  episodeIndex: 1,
  durationS: 196,
  posterUrl: 'https://img.babidrama.com/i/01M6/ep001.webp',
  urls: { '480p': signed('480p'), '720p': signed('720p'), '1080p': signed('1080p') },
  watchUrl: 'https://babidrama.com/w/numero-un-moins-que-rien/1?c=brainnel',
  nextUrl: 'https://babidrama.com/w/numero-un-moins-que-rien/2?c=brainnel',
  ...extra,
})
const okResponse = (data) => ({ ok: true, status: 200, json: async () => data })

test('episode url encodes the slug and tolerates a trailing slash on the base', () => {
  assert.equal(episodeUrl('https://babidrama.com', 'le-mari'), 'https://babidrama.com/api/partner/brainnel/episode?slug=le-mari')
  assert.equal(episodeUrl('https://staging.example/', 'a&b c'), 'https://staging.example/api/partner/brainnel/episode?slug=a%26b%20c')
  assert.equal(episodeUrl('', 'x'), 'https://babidrama.com/api/partner/brainnel/episode?slug=x')
  assert.equal(episodeUrl('/__preview/api/babidrama', 'x'), '/__preview/api/babidrama/api/partner/brainnel/episode?slug=x')
})

test('continue url appends t=<whole seconds> only after 3 s', () => {
  const watch = 'https://babidrama.com/w/le-mari/1?c=brainnel'
  assert.equal(continueUrl(watch, 47.9), 'https://babidrama.com/w/le-mari/1?c=brainnel&t=47')
  assert.equal(continueUrl(watch, 3.2), 'https://babidrama.com/w/le-mari/1?c=brainnel&t=3')
  for (const time of [0, 2.99, 3, -5, NaN, Infinity, undefined, null, 'abc']) assert.equal(continueUrl(watch, time), watch, String(time))
  assert.equal(continueUrl('https://babidrama.com/w/x/1', 12), 'https://babidrama.com/w/x/1?t=12')
  assert.equal(continueUrl('https://babidrama.com/w/x/1?c=brainnel&t=5', 90.5), 'https://babidrama.com/w/x/1?c=brainnel&t=90', 'replaces a stale t')
  assert.equal(continueUrl('not a url', 60), 'not a url')
})

test('media urls: https only; http only for loopback and only when allowed (dev preview)', () => {
  assert.equal(isMediaUrl(signed('480p')), true)
  for (const bad of ['http://v.babidrama.com/v/a/1/480p.mp4', 'javascript:alert(1)', 'data:video/mp4;base64,AAAA',
    '/v/a/1/480p.mp4', '//v.babidrama.com/v/a.mp4', 'blob:https://x/1', '', null, 42]) {
    assert.equal(isMediaUrl(bad), false, String(bad))
  }
  const local = 'http://127.0.0.1:4173/__preview/api/bdvideo/v/a/1/480p.mp4?t=1'
  assert.equal(isMediaUrl(local), false)
  assert.equal(isMediaUrl(local, { allowLoopbackHttp: true }), true)
  assert.equal(isMediaUrl('http://localhost:4173/x.mp4', { allowLoopbackHttp: true }), true)
  assert.equal(isMediaUrl('http://192.168.1.5:4173/x.mp4', { allowLoopbackHttp: true }), false)
  assert.equal(isMediaUrl('http://127.0.0.1.evil.example/x.mp4', { allowLoopbackHttp: true }), false)
})

test('normalization keeps the requested series and plays the 480p rendition', () => {
  assert.deepEqual(normalizeEpisode(payload(), { slug: 'numero-un-moins-que-rien' }), {
    slug: 'numero-un-moins-que-rien',
    title: 'Numéro un, moins que rien',
    rendition: '480p',
    videoUrl: signed('480p'),
    posterUrl: 'https://img.babidrama.com/i/01M6/ep001.webp',
    durationS: 196,
    watchUrl: 'https://babidrama.com/w/numero-un-moins-que-rien/1?c=brainnel',
    nextUrl: 'https://babidrama.com/w/numero-un-moins-que-rien/2?c=brainnel',
    episodeIndex: 1,
    nextInline: false,
  })
  // 480p missing or not https: the next smallest acceptable rendition.
  assert.equal(normalizeEpisode(payload({ urls: { '1080p': signed('1080p'), '720p': signed('720p') } })).rendition, '720p')
  const mixed = normalizeEpisode(payload({ urls: { '480p': 'http://v.babidrama.com/v/a/1/480p.mp4', '1080p': signed('1080p') } }))
  assert.equal(mixed.rendition, '1080p')
  assert.equal(mixed.videoUrl, signed('1080p'))
  // Optional fields degrade to null instead of rejecting the episode.
  const minimal = normalizeEpisode(payload({ posterUrl: 'http://img.babidrama.com/p.webp', nextUrl: 'javascript:alert(1)', durationS: 'x', title: 7 }))
  assert.equal(minimal.posterUrl, null)
  assert.equal(minimal.nextUrl, null)
  assert.equal(minimal.durationS, null)
  assert.equal(minimal.title, '')
  assert.equal(normalizeEpisode(payload({ nextUrl: null })).nextUrl, null)
})

test('normalization rejects non-https videos, foreign series and unusable watch links', () => {
  const rejected = [
    null, undefined, 'x', [], {},
    payload({ urls: { '480p': 'http://v.babidrama.com/v/a/1/480p.mp4' } }),
    payload({ urls: { '480p': 'javascript:alert(1)', '720p': 'data:video/mp4;base64,AAAA', '1080p': '/v/a/1/1080p.mp4' } }),
    payload({ urls: {} }),
    payload({ urls: null }),
    payload({ urls: { '360p': signed('360p') } }),
    payload({ watchUrl: 'javascript:alert(1)' }),
    payload({ watchUrl: '/w/x/1' }),
    payload({ slug: '' }),
  ]
  for (const bad of rejected) assert.equal(normalizeEpisode(bad, { slug: 'numero-un-moins-que-rien' }), null, JSON.stringify(bad))
  assert.equal(normalizeEpisode(payload(), { slug: 'another-series' }), null, 'answer for another series')
  const local = payload({ urls: { '480p': 'http://127.0.0.1:4173/__preview/api/bdvideo/v/a/1/480p.mp4?t=1' } })
  assert.equal(normalizeEpisode(local), null)
  assert.equal(normalizeEpisode(local, { allowLoopbackHttp: true }).rendition, '480p')
})

test('fetch: one GET without credentials resolves the normalized episode', async () => {
  const calls = []
  const result = await fetchDramaEpisode('numero-un-moins-que-rien', {
    baseUrl: 'https://babidrama.com',
    fetchImpl: async (url, init) => { calls.push({ url, init }); return okResponse(payload()) },
  })
  assert.equal(result.status, 'ok')
  assert.equal(result.episode.videoUrl, signed('480p'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://babidrama.com/api/partner/brainnel/episode?slug=numero-un-moins-que-rien')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.credentials, 'omit')
  assert.ok(calls[0].init.signal instanceof AbortSignal)
})

test('fetch: 404, failures and bad payloads resolve to a status, never reject', async () => {
  const slug = 'numero-un-moins-que-rien'
  const cases = [
    [async () => ({ ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND' } }) }), { status: 'not_found' }],
    [async () => ({ ok: false, status: 503, json: async () => ({}) }), { status: 'error', reason: 'http' }],
    [async () => { throw new TypeError('Failed to fetch') }, { status: 'error', reason: 'network' }],
    [async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json') } }), { status: 'error', reason: 'invalid' }],
    [async () => okResponse(payload({ urls: { '480p': 'http://v.babidrama.com/a.mp4' } })), { status: 'error', reason: 'invalid' }],
    [async () => okResponse(payload({ slug: 'other' })), { status: 'error', reason: 'invalid' }],
    [async () => null, { status: 'error', reason: 'http' }],
  ]
  for (const [fetchImpl, expected] of cases) assert.deepEqual(await fetchDramaEpisode(slug, { fetchImpl }), expected)
  let called = false
  assert.deepEqual(await fetchDramaEpisode('', { fetchImpl: async () => { called = true } }), { status: 'error', reason: 'invalid' })
  assert.deepEqual(await fetchDramaEpisode(slug, { fetchImpl: 'nope' }), { status: 'error', reason: 'invalid' })
  assert.equal(called, false)
})

test('fetch: times out after 8 s by default (aborting) and honours an external abort', async () => {
  const delays = []
  const timers = { setTimeout: (fn, delay) => { delays.push(delay); return 1 }, clearTimeout: () => {} }
  await fetchDramaEpisode('x', { timers, fetchImpl: async () => okResponse(payload({ slug: 'x' })) })
  assert.deepEqual(delays, [DRAMA_EPISODE_TIMEOUT_MS])
  assert.equal(DRAMA_EPISODE_TIMEOUT_MS, 8000)

  let signal
  const timedOut = await fetchDramaEpisode('x', { timeoutMs: 20, fetchImpl: (url, init) => { signal = init.signal; return new Promise(() => {}) } })
  assert.deepEqual(timedOut, { status: 'error', reason: 'timeout' })
  assert.equal(signal.aborted, true)

  const controller = new AbortController()
  const pending = fetchDramaEpisode('x', {
    signal: controller.signal,
    fetchImpl: (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }),
  })
  controller.abort()
  assert.deepEqual(await pending, { status: 'aborted' })
  assert.deepEqual(await fetchDramaEpisode('x', { signal: controller.signal, fetchImpl: async () => okResponse(payload()) }), { status: 'aborted' })
})

test('seconds watched add up the played ranges; free line follows the series', () => {
  const ranges = (...pairs) => ({ length: pairs.length, start: (i) => pairs[i][0], end: (i) => pairs[i][1] })
  assert.equal(playedSeconds(ranges([0, 12.4], [30, 41.9])), 24)
  assert.equal(playedSeconds(ranges()), 0)
  assert.equal(playedSeconds(null), 0)
  assert.equal(playedSeconds({ length: 1, start: () => { throw new Error('index') }, end: () => 1 }), 0)
  assert.equal(freeEpisodesLine(5), 'Les 5 premiers épisodes sont gratuits')
  assert.equal(freeEpisodesLine(1), 'Le premier épisode est gratuit')
  for (const none of [0, null, undefined, -1, 2.5]) assert.equal(freeEpisodesLine(none), '')
})

test('player events: open joins impression and click with the same body shape', () => {
  const body = JSON.parse(buildEventsBody('830827813382', [
    { type: 'click', slug: 'numero-un-moins-que-rien', slot: 0 },
    { type: 'open', slug: 'numero-un-moins-que-rien', slot: 0, seconds: 40 },
  ]))
  assert.deepEqual(body, {
    pid: '830827813382',
    events: [
      { type: 'click', slug: 'numero-un-moins-que-rien', slot: 0 },
      { type: 'open', slug: 'numero-un-moins-que-rien', slot: 0 },
    ],
  })
  assert.equal(buildEventsBody('p', [{ type: 'play', slug: 'a', slot: 0 }]), null)
})

test('later free episodes: ep in the URL from episode 2 on, the episode number and nextInline in the answer', async () => {
  assert.equal(episodeUrl('https://babidrama.com', 'le-mari', 1), 'https://babidrama.com/api/partner/brainnel/episode?slug=le-mari')
  assert.equal(episodeUrl('https://babidrama.com', 'le-mari', 2), 'https://babidrama.com/api/partner/brainnel/episode?slug=le-mari&ep=2')
  for (const bad of [0, -1, 1.5, 31, 'x', null, undefined]) assert.equal(episodeUrl('https://babidrama.com', 'le-mari', bad), 'https://babidrama.com/api/partner/brainnel/episode?slug=le-mari', String(bad))
  // Answers from before the field existed read as episode 1 with nothing to follow.
  const first = normalizeEpisode(payload(), { slug: 'numero-un-moins-que-rien' })
  assert.equal(first.episodeIndex, 1)
  assert.equal(first.nextInline, false)
  const second = normalizeEpisode(payload({ episodeIndex: 2, nextInline: true }), { slug: 'numero-un-moins-que-rien' })
  assert.equal(second.episodeIndex, 2)
  assert.equal(second.nextInline, true)
  assert.equal(normalizeEpisode(payload({ nextInline: 'yes' }), { slug: 'numero-un-moins-que-rien' }).nextInline, false)
  const urls = []
  const result = await fetchDramaEpisode('numero-un-moins-que-rien', {
    ep: 3,
    baseUrl: 'https://babidrama.com',
    fetchImpl: async (url) => { urls.push(url); return okResponse(payload({ episodeIndex: 3, nextInline: false })) },
  })
  assert.deepEqual(urls, ['https://babidrama.com/api/partner/brainnel/episode?slug=numero-un-moins-que-rien&ep=3'])
  assert.equal(result.status, 'ok')
  assert.equal(result.episode.episodeIndex, 3)
})
