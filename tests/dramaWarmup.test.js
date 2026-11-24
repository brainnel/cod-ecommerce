import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  DRAMA_MEDIA_ORIGIN,
  DRAMA_WARM_DELAY_MS,
  DRAMA_WARM_KEY,
  scheduleDramaWarm,
  warmDramaAtOrder,
  warmDramaPicks,
  warmPid,
} from '../src/services/dramaWarmup.js'
import {
  DRAMA_WARM_KEY as CARD_WARM_KEY,
  DRAMA_WARM_MAX_AGE_MS,
  fetchDramaPicks,
  pidForProduct,
  picksUrl,
  takeWarmPicks,
} from '../src/services/dramaPicks.js'

const series = (slug) => ({
  slug, title: `Titre ${slug}`, genres: ['Romance'], episodeCount: 73, freeEpisodes: 8, hook: 'Accroche',
  coverUrl: `https://img.babidrama.com/i/${slug}/cover-x.webp`, watchUrl: `https://babidrama.com/w/${slug}/1?c=brainnel`,
})
const answer = (slugs) => ({ pid: '801', mode: 'ranked', series: slugs.map(series), versions: [{ id: 'd', weight: 90, base: 'd' }] })
const okResponse = (data) => ({ ok: true, json: async () => data })
const immediate = { setTimeout: () => 1, clearTimeout: () => {} }

// A timer set that runs its callbacks only when told to.
const manualTimers = () => {
  const pending = new Map()
  let next = 1
  return {
    setTimeout: (callback, ms) => { pending.set(next, { callback, ms }); return next++ },
    clearTimeout: (id) => { pending.delete(id) },
    delays: () => [...pending.values()].map((entry) => entry.ms),
    run: () => { const all = [...pending.values()]; pending.clear(); all.forEach((entry) => entry.callback()) },
  }
}

const fakeDocument = () => {
  const links = []
  return {
    links,
    head: { appendChild: (link) => { links.push(link) } },
    createElement: () => ({}),
    querySelector: (selector) => links.find((link) => selector.includes(`href="${link.href}"`)) || null,
  }
}

test('the checkout derives the same BabiDrama id as the card', () => {
  for (const product of [{ product_id: '830827813382' }, { product_id: 830827813382 }, { product_id: 'bundle:42' },
    { product_id: ' 77 ' }, null, undefined, {}, { product_id: null }, { product_id: '' }, { product_id: 'test-only' },
    { product_id: 'bundle:' }, { product_id: 'bundle:abc' }, { product_id: 'bundle-42' }, { product_id: '12a' },
    { product_id: -5 }, { product_id: 1.5 }]) {
    assert.equal(warmPid(product), pidForProduct(product), JSON.stringify(product))
  }
  assert.equal(DRAMA_WARM_KEY, CARD_WARM_KEY)
})

test('asks for the picks once per product and leaves the answer for the card', async () => {
  const store = {}
  const urls = []
  const fetchImpl = async (url, init) => { urls.push([url, init]); return okResponse(answer(['a', 'b'])) }
  const options = { fetchImpl, store, timers: immediate, now: () => 1000, baseUrl: 'https://babidrama.com/' }
  assert.equal(warmDramaPicks({ product_id: 801 }, options), true)
  // Pending or answered: not asked again.
  assert.equal(warmDramaPicks({ product_id: 801 }, options), false)
  assert.deepEqual(await store[DRAMA_WARM_KEY].promise, answer(['a', 'b']))
  assert.equal(warmDramaPicks({ product_id: '801' }, options), false)
  assert.equal(urls.length, 1)
  // The same request the card makes: no credentials, no preflight.
  assert.equal(urls[0][0], picksUrl('https://babidrama.com', '801'))
  assert.equal(urls[0][1].credentials, 'omit')
  assert.deepEqual(urls[0][1].headers, { Accept: 'application/json' })
  assert.equal(store[DRAMA_WARM_KEY].pid, '801')
  assert.equal(store[DRAMA_WARM_KEY].at, 1000)
  // Another product replaces it.
  assert.equal(warmDramaPicks({ product_id: 'bundle:7' }, options), true)
  assert.equal(store[DRAMA_WARM_KEY].pid, 'bundle-7')
  assert.match(urls[1][0], /pid=bundle-7$/)
})

test('a failed request resolves to null, is marked, and is asked again', async () => {
  const cases = [
    async () => { throw new Error('offline') },
    async () => ({ ok: false, status: 503, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => { throw new Error('not json') } }),
    async () => okResponse('nope'),
    () => { throw new Error('sync') },
  ]
  for (const fetchImpl of cases) {
    const store = {}
    assert.equal(warmDramaPicks({ product_id: 801 }, { fetchImpl, store, timers: immediate }), true)
    assert.equal(await store[DRAMA_WARM_KEY].promise, null)
    assert.equal(store[DRAMA_WARM_KEY].failed, true)
    assert.equal(takeWarmPicks('801', { store }), null)
    assert.equal(warmDramaPicks({ product_id: 801 }, { fetchImpl: async () => okResponse(answer(['a'])), store, timers: immediate }), true)
    assert.deepEqual(await takeWarmPicks('801', { store }), answer(['a']))
  }
})

test('nothing is asked without a product BabiDrama knows, or without fetch; nothing throws', () => {
  const store = {}
  let called = 0
  const fetchImpl = async () => { called += 1; return okResponse(answer(['a'])) }
  for (const product of [null, {}, { product_id: 'test-only' }]) {
    assert.equal(warmDramaPicks(product, { fetchImpl, store, timers: immediate }), false)
    assert.equal(warmDramaAtOrder(product, { fetchImpl, store, timers: immediate, documentImpl: fakeDocument() }), 0)
  }
  assert.equal(warmDramaPicks({ product_id: 801 }, { fetchImpl: null, store, timers: immediate }), false)
  assert.equal(called, 0)
  assert.equal(DRAMA_WARM_KEY in store, false)
  // A store that cannot be written, timers that throw: still no exception.
  assert.equal(warmDramaPicks({ product_id: 801 }, { fetchImpl, store: Object.freeze({}), timers: immediate }), false)
  assert.equal(warmDramaPicks({ product_id: 801 }, { fetchImpl, store: {}, timers: { setTimeout: () => { throw new Error('x') } } }), false)
  assert.equal(typeof scheduleDramaWarm({ product_id: 801 }, { timers: { setTimeout: () => { throw new Error('x') } } }), 'function')
})

test('the request is given up after its timeout', async () => {
  const timers = manualTimers()
  const store = {}
  let aborted = false
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')) })
  })
  assert.equal(warmDramaPicks({ product_id: 801 }, { fetchImpl, store, timers, timeoutMs: 5000 }), true)
  await Promise.resolve()
  assert.deepEqual(timers.delays(), [5000])
  timers.run()
  assert.equal(await store[DRAMA_WARM_KEY].promise, null)
  assert.equal(aborted, true)
  assert.equal(store[DRAMA_WARM_KEY].failed, true)
})

test('the checkout asks a moment after it appeared, and not at all when it is left first', async () => {
  const timers = manualTimers()
  const store = {}
  let called = 0
  const fetchImpl = async () => { called += 1; return okResponse(answer(['a'])) }
  const cancel = scheduleDramaWarm({ product_id: 801 }, { fetchImpl, store, timers })
  assert.deepEqual(timers.delays(), [DRAMA_WARM_DELAY_MS])
  assert.equal(called, 0)
  cancel()
  timers.run()
  assert.equal(called, 0)
  scheduleDramaWarm({ product_id: 801 }, { fetchImpl, store, timers })
  timers.run()
  await store[DRAMA_WARM_KEY].promise
  assert.equal(called, 1)
  // No product BabiDrama knows: no timer at all.
  scheduleDramaWarm({ product_id: 'x' }, { fetchImpl, store, timers })()
  assert.deepEqual(timers.delays().filter((ms) => ms === DRAMA_WARM_DELAY_MS), [])
})

test('sending the order opens both connections once, and asks for the picks if nothing did', async () => {
  const store = {}
  const documentImpl = fakeDocument()
  let called = 0
  const fetchImpl = async () => { called += 1; return okResponse(answer(['a'])) }
  const options = { fetchImpl, store, timers: immediate, documentImpl, baseUrl: 'https://babidrama.com' }
  assert.equal(warmDramaAtOrder({ product_id: 801 }, options), 2)
  assert.deepEqual(documentImpl.links.map((link) => [link.rel, link.href, link.crossOrigin]), [
    ['preconnect', 'https://babidrama.com', 'anonymous'],
    ['preconnect', DRAMA_MEDIA_ORIGIN, 'anonymous'],
  ])
  assert.equal(called, 1)
  // A second tap (or a retry after a refused order): nothing more.
  assert.equal(warmDramaAtOrder({ product_id: 801 }, options), 0)
  assert.equal(documentImpl.links.length, 2)
  assert.equal(called, 1)
  // Without a document the picks are still asked for.
  const bare = {}
  assert.equal(warmDramaAtOrder({ product_id: 802 }, { ...options, store: bare, documentImpl: undefined }), 0)
  assert.equal(bare[DRAMA_WARM_KEY].pid, '802')
})

test('the card takes the early answer only for its product and while it is recent', async () => {
  const store = {}
  warmDramaPicks({ product_id: 801 }, { fetchImpl: async () => okResponse(answer(['a', 'b'])), store, timers: immediate, now: () => 1000 })
  assert.equal(takeWarmPicks('802', { store, now: () => 2000 }), null)
  assert.equal(takeWarmPicks('801', { store, now: () => 1000 + DRAMA_WARM_MAX_AGE_MS }), null)
  assert.equal(takeWarmPicks('801', { store, now: () => 500 }), null)
  assert.equal(takeWarmPicks(null, { store }), null)
  assert.equal(takeWarmPicks('801', { store: {} }), null)
  assert.equal(takeWarmPicks('801', { store: { [DRAMA_WARM_KEY]: { pid: '801', at: 1000, promise: 'nope' } }, now: () => 1500 }), null)
  const warm = takeWarmPicks('801', { store, now: () => 2000 })
  // Used without another request, and reported as such.
  const reports = []
  const picks = await fetchDramaPicks('801', {
    warm, timers: immediate, report: (info) => reports.push(info),
    fetchImpl: async () => { throw new Error('must not be called') },
  })
  assert.deepEqual(picks.series.map((item) => item.slug), ['a', 'b'])
  assert.deepEqual(picks.versions, [{ id: 'd', base: 'd', weight: 90, hook: false, handoffAfter: null }])
  assert.deepEqual(reports, [{ outcome: 'ok', source: 'warm' }])
})

test('the checkout imports nothing of the card but the warm-up, and the warm-up imports nothing', () => {
  const warmup = readFileSync(new URL('../src/services/dramaWarmup.js', import.meta.url), 'utf8')
  assert.doesNotMatch(warmup, /^\s*import\s/m)
  // The checkout's two calls are a release of their own (2026-11-24: not wired yet). Whenever it
  // imports something of BabiDrama, it is the warm-up alone.
  const checkout = readFileSync(new URL('../src/pages/PaymentPage.jsx', import.meta.url), 'utf8')
  const dramaImports = checkout.split('\n').filter((line) => /^import .*[dD]rama/.test(line))
  assert.ok(dramaImports.length <= 1)
  for (const line of dramaImports) {
    assert.equal(line, "import { scheduleDramaWarm, warmDramaAtOrder } from '../services/dramaWarmup'")
  }
})
