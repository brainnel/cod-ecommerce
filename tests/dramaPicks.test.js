import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DRAMA_MAX_EVENTS,
  DRAMA_VARIANTS,
  buildEventsBody,
  dramaLink,
  dramaVariant,
  dramaVersion,
  eventsUrl,
  normalizeVersions,
  normalizeWeights,
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
  // The id of a version BabiDrama describes is carried as it is; anything else is left out.
  assert.equal(dramaLink(watch, { pid: '830827813382', source: 'auto_next', variant: 'e' }),
    'https://babidrama.com/w/le-mari/1?c=brainnel&p=830827813382&src=auto_next&v=e')
  for (const variant of ['<x>', 'E', '9a', 'toolongid1', '', 7, null]) {
    assert.equal(dramaLink(watch, { pid: '<script>', source: 'evil', variant }), watch, String(variant))
  }
  assert.equal(dramaLink(watch), watch)
  for (const bad of ['javascript:alert(1)', 'not a url', '', null, undefined]) assert.equal(dramaLink(bad, { pid: '1', source: 'next', variant: 'a' }), bad)
})

test('variant shares come from BabiDrama: weights of a, c and d, stable per order', () => {
  const split = (weights) => {
    const counts = { a: 0, c: 0, d: 0 }
    for (let n = 659000; n < 665000; n += 1) {
      const key = `FL-${n}-00001`
      const variant = dramaVariant(key, null, weights)
      assert.equal(dramaVariant(key, null, weights), variant)
      counts[variant] += 1
    }
    return counts
  }
  const even = split({ a: 34, c: 33, d: 33 })
  for (const variant of DRAMA_VARIANTS) assert.ok(even[variant] > 1850 && even[variant] < 2190, JSON.stringify(even))
  const skewed = split({ a: 10, c: 20, d: 70 })
  assert.ok(skewed.a > 480 && skewed.a < 720, JSON.stringify(skewed))
  assert.ok(skewed.c > 1050 && skewed.c < 1350, JSON.stringify(skewed))
  assert.ok(skewed.d > 4000 && skewed.d < 4400, JSON.stringify(skewed))
  // A version at 0 is off; the control alone gets every order.
  assert.deepEqual(split({ a: 0, c: 1, d: 1 }).a, 0)
  assert.deepEqual(split({ a: 100, c: 0, d: 0 }), { a: 6000, c: 0, d: 0 })
  // An order without number takes the first version that is on.
  assert.equal(dramaVariant('', null, { a: 0, c: 0, d: 5 }), 'd')
  // Unusable shares fall back to the thirds of the order number; a forced version wins.
  for (const bad of [null, undefined, {}, { a: 1, c: 1 }, { a: -1, c: 1, d: 1 }, { a: 0, c: 0, d: 0 }, { a: 'x', c: 1, d: 1 }, 'a']) {
    assert.equal(normalizeWeights(bad), null)
    assert.equal(dramaVariant('FL-659000-00001', null, bad), dramaVariant('FL-659000-00001'))
  }
  assert.deepEqual(normalizeWeights({ a: 34.9, c: '33', d: 33, b: 9 }), { a: 34, d: 33, c: 33 })
  assert.equal(dramaVariant('FL-1', 'b', { a: 1, c: 1, d: 1 }), 'b')
})

test('the display list carries the shares BabiDrama sent, or none', () => {
  assert.equal(orderForDisplay(response('ranked', ['a', 'b'])).variants, null)
  assert.deepEqual(orderForDisplay({ ...response('ranked', ['a', 'b']), variants: { a: 10, c: 45, d: 45 } }).variants,
    { a: 10, d: 45, c: 45 })
  assert.equal(orderForDisplay({ ...response('ranked', ['a']), variants: { a: 0, c: 0, d: 0 } }).variants, null)
})

test('events tell BabiDrama the card version, the link used and the episode finished', () => {
  const body = JSON.parse(buildEventsBody('830827813382', [
    { type: 'impression', slug: 'le-mari', slot: 0, src: 'next', ep: 2 },
    { type: 'play', slug: 'le-mari', slot: 0 },
    { type: 'open', slug: 'le-mari', slot: 0, src: 'auto_next' },
    { type: 'open', slug: 'le-mari', slot: 0, src: 'evil' },
    { type: 'complete', slug: 'le-mari', slot: 0, ep: 1 },
    { type: 'complete', slug: 'le-mari', slot: 0, ep: 3 },
  ], 'd'))
  assert.deepEqual(body, {
    pid: '830827813382',
    v: 'd',
    events: [
      { type: 'impression', slug: 'le-mari', slot: 0 },
      { type: 'play', slug: 'le-mari', slot: 0 },
      { type: 'open', slug: 'le-mari', slot: 0, src: 'auto_next' },
      { type: 'open', slug: 'le-mari', slot: 0 },
      { type: 'complete', slug: 'le-mari', slot: 0 },
      { type: 'complete', slug: 'le-mari', slot: 0, ep: 3 },
    ],
  })
  // A malformed version id is left out; episodes outside 2–30 are sent as episode 1 would be.
  for (const variant of ['Z', 'd!', '9', 'toolongid1', '', 4, null]) {
    assert.equal('v' in JSON.parse(buildEventsBody('p', [{ type: 'click', slug: 'a', slot: 0 }], variant)), false, String(variant))
  }
  // A quarter of episode 1 watched is its own event, with the version's id.
  assert.deepEqual(JSON.parse(buildEventsBody('830827813382', [{ type: 'quarter', slug: 'le-mari', slot: 0, ep: 1, src: 'next' }], 'e')),
    { pid: '830827813382', v: 'e', events: [{ type: 'quarter', slug: 'le-mari', slot: 0 }] })
  assert.deepEqual(JSON.parse(buildEventsBody('p', [{ type: 'complete', slug: 'a', slot: 0, ep: 31 }], 'a')).events,
    [{ type: 'complete', slug: 'a', slot: 0 }])
})

test('a finished episode 1 is an accepted event', () => {
  assert.deepEqual(JSON.parse(buildEventsBody('830827813382', [{ type: 'complete', slug: 'le-mari', slot: 0 }])),
    { pid: '830827813382', events: [{ type: 'complete', slug: 'le-mari', slot: 0 }] })
  assert.equal(buildEventsBody('830827813382', [{ type: 'completed', slug: 'le-mari', slot: 0 }]), null)
})

const VERSIONS = [
  { id: 'a', weight: 10, base: 'a' },
  { id: 'c', weight: 0, base: 'c' },
  { id: 'd', weight: 90, base: 'd' },
  { id: 'e', weight: 90, base: 'd', hook: true },
]

test('versions: BabiDrama\u2019s list is read strictly, a malformed one is distrusted as a whole', () => {
  assert.deepEqual(normalizeVersions(VERSIONS), [
    { id: 'a', base: 'a', weight: 10, hook: false, handoffAfter: null },
    { id: 'c', base: 'c', weight: 0, hook: false, handoffAfter: null },
    { id: 'd', base: 'd', weight: 90, hook: false, handoffAfter: null },
    { id: 'e', base: 'd', weight: 90, hook: true, handoffAfter: null },
  ])
  // Switches: only `true` turns the hook on; the handoff point is a whole number of episodes, 1–30.
  assert.deepEqual(normalizeVersions([
    { id: 'd', weight: 1.9, base: 'd', hook: 'yes', handoffAfter: 0 },
    { id: 'k3', weight: '2', base: 'd', hook: true, handoffAfter: 3, extra: 'dropped' },
    { id: 'k31', weight: 1, base: 'd', handoffAfter: 31 },
    { id: 'kf', weight: 1, base: 'd', handoffAfter: 2.5 },
  ]), [
    { id: 'd', base: 'd', weight: 1, hook: false, handoffAfter: null },
    { id: 'k3', base: 'd', weight: 2, hook: true, handoffAfter: 3 },
    { id: 'k31', base: 'd', weight: 1, hook: false, handoffAfter: null },
    { id: 'kf', base: 'd', weight: 1, hook: false, handoffAfter: null },
  ])
  // A version built on a handoff this build cannot render gets no order page; the others keep theirs.
  assert.deepEqual(normalizeVersions([{ id: 'd', weight: 5, base: 'd' }, { id: 'z', weight: 5, base: 'x' }]).map((version) => version.id), ['d'])
  assert.equal(normalizeVersions([{ id: 'z', weight: 5, base: 'x' }]), null)
  // Nothing usable: not a list, empty, too long, a broken entry, a repeated id, no weight above 0.
  const d = { id: 'd', weight: 1, base: 'd' }
  for (const bad of [
    null, undefined, {}, 'd', [], Array.from({ length: 9 }, (_, n) => ({ id: `v${n}`, weight: 1, base: 'd' })),
    [d, null], [d, 'e'], [d, { id: 'E', weight: 1, base: 'd' }], [d, { id: '', weight: 1, base: 'd' }], [d, { weight: 1, base: 'd' }],
    [d, { id: 'e', weight: -1, base: 'd' }], [d, { id: 'e', weight: 'x', base: 'd' }], [d, { id: 'e', weight: null, base: 'd' }],
    [d, { id: 'e', base: 'd' }], [d, { id: 'd', weight: 2, base: 'd' }],
    [{ id: 'd', weight: 0, base: 'd' }, { id: 'e', weight: 0, base: 'd' }],
  ]) assert.equal(normalizeVersions(bad), null, JSON.stringify(bad))
})

test('versions: an order keeps its version, the weights give the shares, the fallback is the three variants', () => {
  const split = (versions) => {
    const counts = {}
    for (let n = 659000; n < 665000; n += 1) {
      const key = `FL-${n}-00001`
      const version = dramaVersion(key, null, { versions })
      assert.deepEqual(dramaVersion(key, null, { versions }), version)
      counts[version.id] = (counts[version.id] || 0) + 1
    }
    return counts
  }
  // 10 / 0 / 90 / 90 of 190: about 5 %, none, 47 % and 47 % of 6,000 orders.
  const counts = split(VERSIONS)
  assert.equal(counts.c, undefined)
  assert.ok(counts.a > 230 && counts.a < 400, JSON.stringify(counts))
  assert.ok(counts.d > 2650 && counts.d < 3030, JSON.stringify(counts))
  assert.ok(counts.e > 2650 && counts.e < 3030, JSON.stringify(counts))
  assert.deepEqual(split([{ id: 'd', weight: 100, base: 'd' }, { id: 'e', weight: 0, base: 'd', hook: true }]), { d: 6000 })
  // What the card needs of a version: the id to report, the handoff to follow and its switches.
  const hook = dramaVersion('FL-1', 'e', { versions: VERSIONS })
  assert.deepEqual(hook, { id: 'e', base: 'd', weight: 90, hook: true, handoffAfter: null })
  // A version of the list can be named even at weight 0 (dev preview); an unknown name is ignored.
  assert.equal(dramaVersion('FL-1', 'c', { versions: VERSIONS }).base, 'c')
  assert.deepEqual(dramaVersion('FL-659000-00001', 'zz', { versions: VERSIONS }), dramaVersion('FL-659000-00001', null, { versions: VERSIONS }))
  // An order without number takes the first version that is on.
  assert.equal(dramaVersion('', null, { versions: VERSIONS }).id, 'a')
  assert.equal(dramaVersion(null, null, { versions: VERSIONS.slice(1) }).id, 'd')
  // Without a usable list: exactly the variant of the three weights (or of the order number), nothing on top.
  for (const versions of [null, undefined, [], [{ id: 'E', weight: 1, base: 'd' }], 'd']) {
    for (const variants of [null, { a: 10, c: 0, d: 90 }, { a: 34, c: 33, d: 33 }]) {
      for (const key of ['FL-659000-00001', 'FL-659001-00001', 2611081513488681, '']) {
        const variant = dramaVariant(key, null, variants)
        assert.deepEqual(dramaVersion(key, null, { versions, variants }), { id: variant, base: variant, weight: 0, hook: false, handoffAfter: null })
      }
    }
  }
  assert.deepEqual(dramaVersion('FL-1'), { id: dramaVariant('FL-1'), base: dramaVariant('FL-1'), weight: 0, hook: false, handoffAfter: null })
  assert.equal(dramaVersion('FL-1', 'b').id, 'b')
  assert.equal(dramaVersion('FL-1', 'e').id, dramaVariant('FL-1'))
})

test('the display list carries BabiDrama\u2019s versions next to the three weights, or none', () => {
  const plain = orderForDisplay(response('ranked', ['a', 'b']))
  assert.equal(plain.versions, null)
  const both = orderForDisplay({ ...response('ranked', ['a', 'b']), variants: { a: 10, c: 0, d: 90 }, versions: VERSIONS })
  assert.deepEqual(both.variants, { a: 10, d: 90, c: 0 })
  assert.deepEqual(both.versions.map((version) => `${version.id}:${version.weight}`), ['a:10', 'c:0', 'd:90', 'e:90'])
  assert.equal(orderForDisplay({ ...response('ranked', ['a']), versions: [{ id: 'd', weight: 0, base: 'd' }] }).versions, null)
  // A broken list never hides the card: the three weights still decide.
  const broken = orderForDisplay({ ...response('ranked', ['a']), variants: { a: 0, c: 0, d: 1 }, versions: [{ id: 'D', weight: 1 }] })
  assert.equal(broken.versions, null)
  assert.equal(dramaVersion('FL-1', null, broken).id, 'd')
})
