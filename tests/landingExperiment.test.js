import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createServer } from 'vite'
import {
  getLandingExperimentBucket, pickLandingVariant, landingVariantEventProperties
} from '../src/utils/landingExperiment.js'
import { getLandingImageBucket } from '../src/utils/landingImageOptimization.js'
import { getCheckoutOptimizationBucket } from '../src/utils/checkoutOptimizationExperiment.js'

const UPLOADS = 'https://api.brainnel.com/admin/static/uploads/'
const B_IMAGES = [`${UPLOADS}main.jpg`, `${UPLOADS}b2.jpg`, `${UPLOADS}b3.jpg`]
const B_DETAILS = [`${UPLOADS}d1.jpg`, `${UPLOADS}d2.jpg`]
const experiment = (overrides = {}) => ({
  id: 12,
  variants: [{ key: 'A', weight: 50 }, { key: 'B', weight: 50, image_url: B_IMAGES, description_fr: B_DETAILS }],
  ...overrides
})
const devices = Array.from({ length: 4000 }, (_, i) => `device_${i.toString(16)}-${(i * 7919).toString(36)}`)

test('a device keeps its bucket for one experiment and gets another one for the next experiment', () => {
  for (const device of devices.slice(0, 50)) {
    const bucket = getLandingExperimentBucket(12, device)
    assert.ok(Number.isInteger(bucket) && bucket >= 0 && bucket < 100)
    assert.equal(getLandingExperimentBucket(12, device), bucket)
  }
  const moved = devices.slice(0, 500).filter((d) => getLandingExperimentBucket(12, d) !== getLandingExperimentBucket(13, d)).length
  assert.ok(moved > 450, `only ${moved} of 500 devices changed bucket between experiments`)
})

test('no bucket without a usable experiment id or device id', () => {
  for (const [id, device] of [[0, 'device_a'], [-1, 'device_a'], ['12', 'device_a'], [1.5, 'device_a'], [12, ''], [12, '   '], [12, null], [12, undefined]]) {
    assert.equal(getLandingExperimentBucket(id, device), null)
  }
})

test('a 50/50 experiment splits devices about evenly', () => {
  const b = devices.filter((d) => pickLandingVariant({ experiment: experiment(), deviceId: d }).key === 'B').length
  assert.ok(Math.abs(b / devices.length - 0.5) < 0.03, `B share ${b / devices.length}`)
})

test('the split is independent of the WebP rollout and the checkout experiment', () => {
  const inB = devices.filter((d) => pickLandingVariant({ experiment: experiment(), deviceId: d }).key === 'B')
  const webpShare = inB.filter((d) => getLandingImageBucket(d) < 50).length / inB.length
  const checkoutShare = inB.filter((d) => getCheckoutOptimizationBucket(d) < 50).length / inB.length
  assert.ok(Math.abs(webpShare - 0.5) < 0.04, `WebP share inside B ${webpShare}`)
  assert.ok(Math.abs(checkoutShare - 0.5) < 0.04, `checkout share inside B ${checkoutShare}`)
})

test('variant A keeps the product lists, variant B carries its own', () => {
  const a = devices.map((d) => pickLandingVariant({ experiment: experiment(), deviceId: d })).find((v) => v.key === 'A')
  const b = devices.map((d) => pickLandingVariant({ experiment: experiment(), deviceId: d })).find((v) => v.key === 'B')
  assert.deepEqual({ id: a.id, imageUrl: a.imageUrl, descriptionFr: a.descriptionFr }, { id: 12, imageUrl: null, descriptionFr: null })
  assert.deepEqual({ id: b.id, imageUrl: b.imageUrl, descriptionFr: b.descriptionFr }, { id: 12, imageUrl: B_IMAGES, descriptionFr: B_DETAILS })
})

test('weights are honoured, including 100/0 and 0/100', () => {
  const weights = (a, b) => experiment({ variants: [{ key: 'A', weight: a }, { key: 'B', weight: b, image_url: B_IMAGES, description_fr: B_DETAILS }] })
  const share = (exp) => devices.filter((d) => pickLandingVariant({ experiment: exp, deviceId: d }).key === 'B').length / devices.length
  assert.equal(share(weights(100, 0)), 0)
  assert.equal(share(weights(0, 100)), 1)
  assert.ok(Math.abs(share(weights(80, 20)) - 0.2) < 0.03)
})

test('anything unexpected means no experiment', () => {
  const device = 'device_abc'
  const bad = [
    undefined, null, 'x', [], {},
    experiment({ id: 0 }), experiment({ id: '12' }),
    experiment({ variants: [{ key: 'A', weight: 50 }] }),
    experiment({ variants: [{ key: 'B', weight: 50, image_url: B_IMAGES, description_fr: B_DETAILS }, { key: 'A', weight: 50 }] }),
    experiment({ variants: [{ key: 'A', weight: 60 }, { key: 'B', weight: 50, image_url: B_IMAGES, description_fr: B_DETAILS }] }),
    experiment({ variants: [{ key: 'A', weight: '50' }, { key: 'B', weight: 50, image_url: B_IMAGES, description_fr: B_DETAILS }] }),
    experiment({ variants: [{ key: 'A', weight: 50 }, { key: 'B', weight: 50, image_url: [], description_fr: B_DETAILS }] }),
    experiment({ variants: [{ key: 'A', weight: 50 }, { key: 'B', weight: 50, image_url: ['http://insecure/x.jpg'], description_fr: B_DETAILS }] }),
    experiment({ variants: [{ key: 'A', weight: 50 }, { key: 'B', weight: 50, image_url: B_IMAGES, description_fr: 'd1.jpg' }] }),
    experiment({ variants: [{ key: 'A', weight: 50 }, { key: 'B', weight: 50, image_url: Array(13).fill(B_IMAGES[0]), description_fr: B_DETAILS }] })
  ]
  for (const value of bad) assert.equal(pickLandingVariant({ experiment: value, deviceId: device }), null)
  assert.equal(pickLandingVariant({ experiment: experiment(), deviceId: '' }), null)
  assert.equal(pickLandingVariant(), null)
})

test('event properties exist only for a picked variant', () => {
  assert.deepEqual(landingVariantEventProperties({ id: 12, key: 'B' }), { lp_exp: 12, lp_var: 'B' })
  assert.deepEqual(landingVariantEventProperties({ id: 12, key: 'A' }), { lp_exp: 12, lp_var: 'A' })
  for (const value of [null, undefined, {}, { id: '12', key: 'B' }, { id: 12, key: 'C' }]) {
    assert.deepEqual(landingVariantEventProperties(value), {})
  }
})

// ------------------------------------------------- what the landing page reports

const mem = () => {
  const data = new Map()
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) }
}

let server
let analytics
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  analytics = await server.ssrLoadModule('/src/services/checkoutFunnelAnalytics.js')
})
after(async () => { await server?.close() })

test('product_landing_view reports the experiment and variant; checkout and order events are unchanged', async () => {
  const originalWindow = globalThis.window, originalDocument = globalThis.document
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const sent = []
  globalThis.document = { referrer: '' }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { sendBeacon: (url, body) => { sent.push(body); return true } } })
  const product = { product_id: '833967860394', name_fr: 'Real product', price: 10000, skus: [] }
  const run = async (extra) => {
    sent.length = 0
    const localStorage = mem(); localStorage.setItem('cod_checkout_device_id', 'device_lp-test')
    globalThis.window = { localStorage, sessionStorage: mem(), location: { hostname: 'www.brainnel.com', search: '',
      pathname: '/product/833967860394', href: 'https://www.brainnel.com/product/833967860394' } }
    analytics.trackProductLandingView(product, { product_type: 'product', img_opt: 'orig', ...extra })
    analytics.beginCheckoutFunnel(product)
    analytics.trackCheckoutEvent('order_create_success', { order_no: 'TEST-NOT-SENT' })
    // one request per event: { device_id, events: [event] }
    return (await Promise.all(sent.map((b) => b.text()))).map((text) => {
      const body = JSON.parse(text)
      return { ...body.events[0], device_id: body.events[0].device_id ?? body.device_id }
    })
  }
  try {
    const withB = await run(landingVariantEventProperties({ id: 12, key: 'B' }))
    assert.deepEqual(withB.map((e) => e.event_name), ['product_landing_view', 'checkout_start', 'order_create_success'])
    assert.equal(withB[0].properties.lp_exp, 12)
    assert.equal(withB[0].properties.lp_var, 'B')
    assert.equal(withB[0].properties.img_opt, 'orig')
    assert.equal(withB[0].device_id, 'device_lp-test')
    for (const event of withB.slice(1)) {
      assert.equal('lp_exp' in event.properties, false, event.event_name)
      assert.equal('lp_var' in event.properties, false, event.event_name)
      assert.equal(event.device_id, 'device_lp-test')
    }
    // the order event still links back to the landing session of that view
    assert.equal(withB[2].properties.landing_session_id, withB[0].properties.landing_session_id)

    const none = await run(landingVariantEventProperties(null))
    assert.equal('lp_exp' in none[0].properties, false)
    assert.equal('lp_var' in none[0].properties, false)

    for (const bad of [{ lp_exp: '12', lp_var: 'B' }, { lp_exp: 12, lp_var: 'C' }, { lp_exp: 12 }, { lp_var: 'A' }]) {
      const events = await run(bad)
      assert.equal('lp_exp' in events[0].properties, false, JSON.stringify(bad))
      assert.equal('lp_var' in events[0].properties, false, JSON.stringify(bad))
    }
  } finally {
    globalThis.window = originalWindow; globalThis.document = originalDocument
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
  }
})
