import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DRAMA_MAX_EVENTS,
  DRAMA_VARIANTS,
  buildEventsBody,
  dramaLink,
  dramaVariant,
  eventsUrl,
  fetchDramaPicks,
  orderForDisplay,
  pidForProduct,
  picksUrl,
  sendDramaEvents,
  shuffle,
} from '../src/services/dramaPicks.js'

const series = (slug, extra = {}) => ({
  slug, title: `Titre ${slug}`, genres: ['Romance', 'Vengeance'], episodeCount: 73, freeEpisodes: 5,
  hook: '💔 Elle surprend son mari…', coverUrl: `https://img.babidrama.com/i/${slug}/cover-x.webp`,
  watchUrl: `https://babidrama.com/w/${slug}/1?c=brainnel`, ...extra,
})
const response = (mode, slugs) => ({ pid: '830827813382', mode, series: slugs.map((slug) => series(slug)) })
const okResponse = (data) => ({ ok: true, json: async () => data })

test('pid: digits for single products, bundle-<id> for bundles, nothing otherwise', () => {
  assert.equal(pidForProduct({ product_id: '830827813382' }), '830827813382')
  assert.equal(pidForProduct({ product_id: 830827813382 }), '830827813382')
  assert.equal(pidForProduct({ product_id: 'bundle:42' }), 'bundle-42')
  for (const product of [null, undefined, {}, { product_id: null }, { product_id: '' }, { product_id: 'test-only' },
    { product_id: 'bundle:' }, { product_id: 'bundle:abc' }, { product_id: 'bundle-42' }, { product_id: '12a' }, { product_id: -5 }, { product_id: 1.5 }]) {
    assert.equal(pidForProduct(product), null, JSON.stringify(product))
  }
})

test('urls encode the pid and tolerate a trailing slash on the base', () => {
  assert.equal(picksUrl('https://babidrama.com', 'bundle-42'), 'https://babidrama.com/api/partner/brainnel/picks?pid=bundle-42')
  assert.equal(picksUrl('https://staging.example/', 'a&b'), 'https://staging.example/api/partner/brainnel/picks?pid=a%26b')
  assert.equal(eventsUrl('https://babidrama.com/'), 'https://babidrama.com/api/partner/brainnel/events')
  assert.equal(eventsUrl(''), 'https://babidrama.com/api/partner/brainnel/events')
})

test('shuffle is a Fisher–Yates permutation on a copy', () => {
  const input = ['a', 'b', 'c', 'd']
  const result = shuffle(input, () => 0)
  assert.deepEqual(input, ['a', 'b', 'c', 'd'])
  assert.deepEqual(result, ['b', 'c', 'd', 'a'])
  assert.deepEqual(shuffle(input, () => 0.999999), ['a', 'b', 'c', 'd'])
  assert.deepEqual(shuffle(input, () => 1), ['a', 'b', 'c', 'd'], 'random()=1 must not index out of range')
  assert.deepEqual(shuffle([]), [])
  assert.deepEqual(shuffle(null), [])
  for (let run = 0; run < 50; run += 1) assert.deepEqual([...shuffle(input)].sort(), input)
})

test('ranked keeps API order, explore is shuffled with the given random source', () => {
  const ranked = orderForDisplay(response('ranked', ['a', 'b', 'c']), () => 0)
  assert.equal(ranked.mode, 'ranked')
  assert.deepEqual(ranked.series.map((s) => s.slug), ['a', 'b', 'c'])
  const explore = orderForDisplay(response('explore', ['a', 'b', 'c']), () => 0)
  assert.equal(explore.mode, 'explore')
  assert.deepEqual(explore.series.map((s) => s.slug), ['b', 'c', 'a'])
  assert.equal(orderForDisplay(response('unknown', ['a', 'b']), () => 0).mode, 'ranked')
})

test('display list is validated, de-duplicated and capped at five', () => {
  const result = orderForDisplay({
    mode: 'ranked',
    series: [
      series('a'), series('a'), null, 'x', series('', {}), series('no-title', { title: ' ' }),
      series('js', { watchUrl: 'javascript:alert(1)' }), series('rel', { watchUrl: '/w/rel/1' }),
      series('b', { coverUrl: 'javascript:alert(1)', genres: ['Drame', 3, ''], episodeCount: '12', freeEpisodes: null, hook: 7 }),
      series('c'), series('d'), series('e'), series('f'),
    ],
  })
  assert.deepEqual(result.series.map((s) => s.slug), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(result.series[1], {
    slug: 'b', title: 'Titre b', genres: ['Drame'], episodeCount: 12, freeEpisodes: null, hook: '', coverUrl: null,
    watchUrl: 'https://babidrama.com/w/b/1?c=brainnel',
  })
  assert.equal(orderForDisplay(response('ranked', ['a'])).series[0].coverUrl, 'https://img.babidrama.com/i/a/cover-x.webp')
  for (const bad of [null, undefined, 'x', {}, { series: null }, { series: [] }, { series: [series('x', { watchUrl: 'ftp://x' })] }]) {
    assert.equal(orderForDisplay(bad), null, JSON.stringify(bad))
  }
})

test('events body keeps only valid events and caps them at six', () => {
  const events = Array.from({ length: 9 }, (_, i) => ({ type: i % 2 ? 'click' : 'impression', slug: `s${i}`, slot: i % 5, extra: 'drop' }))
  const body = JSON.parse(buildEventsBody('830827813382', events))
  assert.equal(body.pid, '830827813382')
  assert.equal(body.events.length, DRAMA_MAX_EVENTS)
  assert.deepEqual(body.events[1], { type: 'click', slug: 's1', slot: 1 })
  const filtered = JSON.parse(buildEventsBody('p', [{ type: 'view', slug: 'a', slot: 0 }, { type: 'click', slug: '', slot: 0 },
    { type: 'click', slug: 'a', slot: 5 }, { type: 'click', slug: 'a', slot: -1 }, { type: 'click', slug: 'a', slot: '1' }, { type: 'click', slug: 'ok', slot: 4 }]))
  assert.deepEqual(filtered.events, [{ type: 'click', slug: 'ok', slot: 4 }])
  assert.equal(buildEventsBody('p', []), null)
  // « Continuer sur BabiDrama » / « Épisode 2 » from the inline player.
  assert.deepEqual(JSON.parse(buildEventsBody('p', [{ type: 'open', slug: 'a', slot: 2, extra: 'drop' }])),
    { pid: 'p', events: [{ type: 'open', slug: 'a', slot: 2 }] })
  assert.equal(buildEventsBody('', [{ type: 'click', slug: 'a', slot: 0 }]), null)
  assert.equal(buildEventsBody('p', null), null)
})

test('events go out by sendBeacon as text/plain, falling back to a no-cors keepalive fetch', async () => {
  const beacons = []
  const sent = sendDramaEvents('p', [{ type: 'click', slug: 'a', slot: 0 }], {
    baseUrl: 'https://babidrama.com',
    navigatorImpl: { sendBeacon: (url, blob) => { beacons.push({ url, blob }); return true } },
    fetchImpl: () => { throw new Error('fetch must not run') },
  })
  assert.equal(sent, true)
  assert.equal(beacons[0].url, 'https://babidrama.com/api/partner/brainnel/events')
  assert.equal(beacons[0].blob.type, 'text/plain;charset=utf-8')
  assert.deepEqual(JSON.parse(await beacons[0].blob.text()), { pid: 'p', events: [{ type: 'click', slug: 'a', slot: 0 }] })

  for (const navigatorImpl of [{ sendBeacon: () => false }, { sendBeacon: () => { throw new Error('blocked') } }, undefined]) {
    const calls = []
    const fetchImpl = (url, init) => { calls.push({ url, init }); return Promise.reject(new Error('offline')) }
    assert.equal(sendDramaEvents('p', [{ type: 'impression', slug: 'a', slot: 0 }], { baseUrl: 'https://babidrama.com', navigatorImpl, fetchImpl }), true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://babidrama.com/api/partner/brainnel/events')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.mode, 'no-cors')
    assert.equal(calls[0].init.keepalive, true)
    assert.equal(calls[0].init.headers['Content-Type'], 'text/plain;charset=UTF-8')
    assert.equal(JSON.parse(calls[0].init.body).events[0].type, 'impression')
  }
  await new Promise((resolve) => setTimeout(resolve, 0)) // rejected fetch must not surface

  assert.equal(sendDramaEvents('p', [], { navigatorImpl: { sendBeacon: () => { throw new Error('no') } } }), false)
  assert.doesNotThrow(() => sendDramaEvents('p', [{ type: 'click', slug: 'a', slot: 0 }], {
    navigatorImpl: { sendBeacon: () => false }, fetchImpl: () => { throw new Error('sync failure') },
  }))
  assert.equal(sendDramaEvents('p', [{ type: 'click', slug: 'a', slot: 0 }], { navigatorImpl: {}, fetchImpl: null }), false)
})

test('fetch: GET without credentials, resolves the display list', async () => {
  const calls = []
  const result = await fetchDramaPicks('bundle-42', {
    baseUrl: 'https://babidrama.com',
    random: () => 0,
    fetchImpl: async (url, init) => { calls.push({ url, init }); return okResponse(response('ranked', ['a', 'b'])) },
  })
  assert.deepEqual(result.series.map((s) => s.slug), ['a', 'b'])
  assert.equal(calls[0].url, 'https://babidrama.com/api/partner/brainnel/picks?pid=bundle-42')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.credentials, 'omit')
  assert.ok(calls[0].init.signal instanceof AbortSignal)
})

test('fetch: failures, bad payloads and empty lists resolve to null', async () => {
  const cases = [
    async () => { throw new TypeError('Failed to fetch') },
    async () => ({ ok: false, status: 403, json: async () => ({ series: [series('a')] }) }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json') } }),
    async () => okResponse({ pid: 'p', mode: 'ranked', series: [] }),
    async () => okResponse(null),
    async () => null,
  ]
  for (const fetchImpl of cases) assert.equal(await fetchDramaPicks('p', { fetchImpl }), null)
  let called = false
  assert.equal(await fetchDramaPicks(null, { fetchImpl: async () => { called = true } }), null)
  assert.equal(await fetchDramaPicks('p', { fetchImpl: 'nope' }), null)
  assert.equal(called, false)
})

test('fetch: times out (aborting the request) even if fetch ignores the signal', async () => {
  let signal
  const started = Date.now()
  const result = await fetchDramaPicks('p', {
    timeoutMs: 30,
    fetchImpl: (url, init) => { signal = init.signal; return new Promise(() => {}) },
  })
  assert.equal(result, null)
  assert.equal(signal.aborted, true)
  assert.ok(Date.now() - started < 1000)

  const respectsAbort = await fetchDramaPicks('p', {
    timeoutMs: 30,
    fetchImpl: (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }),
  })
  assert.equal(respectsAbort, null)
})

test('fetch: uses 2500 ms by default and an external abort cancels it', async () => {
  const delays = []
  const timers = { setTimeout: (fn, delay) => { delays.push(delay); return 1 }, clearTimeout: () => {} }
  await fetchDramaPicks('p', { timers, fetchImpl: async () => okResponse(response('ranked', ['a'])) })
  assert.deepEqual(delays, [2500])

  const controller = new AbortController()
  let innerSignal
  const pending = fetchDramaPicks('p', {
    signal: controller.signal,
    fetchImpl: (url, init) => new Promise((resolve, reject) => {
      innerSignal = init.signal
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }),
  })
  controller.abort()
  assert.equal(await pending, null)
  assert.equal(innerSignal.aborted, true)
  assert.equal(await fetchDramaPicks('p', { signal: controller.signal, fetchImpl: async () => okResponse(response('ranked', ['a'])) }), null)
})

test('a slow body after the timeout cannot resurrect the card', async () => {
  let release
  const result = await fetchDramaPicks('p', {
    timeoutMs: 20,
    fetchImpl: async () => ({ ok: true, json: () => new Promise((resolve) => { release = () => resolve(response('ranked', ['a'])) }) }),
  })
  assert.equal(result, null)
  release?.()
})

test('variant: stable per order, spread over the three versions, a for an order without number', () => {
  const counts = { a: 0, b: 0, c: 0, d: 0 }
  for (let n = 659000; n < 662000; n += 1) {
    const key = `FL-${n}-00001`
    const variant = dramaVariant(key)
    assert.ok(DRAMA_VARIANTS.includes(variant))
    assert.equal(dramaVariant(key), variant)
    counts[variant] += 1
  }
  for (const variant of DRAMA_VARIANTS) assert.ok(counts[variant] > 900 && counts[variant] < 1100, JSON.stringify(counts))
  // d took over b's third of the orders; a and c kept theirs.
  assert.deepEqual(DRAMA_VARIANTS, ['a', 'd', 'c'])
  assert.equal(counts.b, 0)
  for (const empty of ['', '   ', null, undefined]) assert.equal(dramaVariant(empty), 'a')
  assert.equal(dramaVariant(2611081513488681), dramaVariant('2611081513488681'))
  // The dev preview may force a version; anything else is ignored.
  assert.equal(dramaVariant('FL-1', 'c'), 'c')
  assert.equal(dramaVariant('', 'b'), 'b')
  assert.equal(dramaVariant('FL-1', 'd'), 'd')
  assert.equal(dramaVariant('FL-659000-00001', 'z'), dramaVariant('FL-659000-00001'))
})

test('links to BabiDrama carry the product, the link used and the variant, and nothing unexpected', () => {
  const watch = 'https://babidrama.com/w/le-mari/1?c=brainnel'
  assert.equal(dramaLink(watch, { pid: '830827813382', source: 'continue', variant: 'a' }),
    'https://babidrama.com/w/le-mari/1?c=brainnel&p=830827813382&src=continue&v=a')
  assert.equal(dramaLink(`${watch}&t=47`, { pid: 'bundle-12', source: 'auto_next', variant: 'c' }),
    'https://babidrama.com/w/le-mari/1?c=brainnel&t=47&p=bundle-12&src=auto_next&v=c')
  // A `p` already set by BabiDrama is kept once.
  assert.equal(dramaLink(`${watch}&p=830827813382`, { pid: '830827813382', source: 'thumbnail', variant: 'b' }),
    'https://babidrama.com/w/le-mari/1?c=brainnel&p=830827813382&src=thumbnail&v=b')
  assert.equal(dramaLink(watch, { pid: '<script>', source: 'evil', variant: 'zz' }), watch)
  assert.equal(dramaLink(watch), watch)
  for (const bad of ['javascript:alert(1)', 'not a url', '', null, undefined]) assert.equal(dramaLink(bad, { pid: '1', source: 'next', variant: 'a' }), bad)
})

test('a finished episode 1 is an accepted event', () => {
  assert.deepEqual(JSON.parse(buildEventsBody('830827813382', [{ type: 'complete', slug: 'le-mari', slot: 0 }])),
    { pid: '830827813382', events: [{ type: 'complete', slug: 'le-mari', slot: 0 }] })
  assert.equal(buildEventsBody('830827813382', [{ type: 'completed', slug: 'le-mari', slot: 0 }]), null)
})
