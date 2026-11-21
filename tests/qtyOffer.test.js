import assert from 'node:assert/strict'
import { before, after, beforeEach, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import {
  normalizeQtyOffer, getQtyOfferBucket, pickQtyOfferArm, qtyOfferUnitPrice, getCheckoutPricing,
  qtyOfferEventProperties, rememberQtyOfferArm, recallQtyOfferArm, resolveQtyOfferArm,
  resetRememberedQtyOfferArms
} from '../src/utils/qtyOffer.js'
import { getLandingExperimentBucket } from '../src/utils/landingExperiment.js'

const offer = (overrides = {}) => ({ id: 1, weight_b: 50, tiers: [{ qty: 2, pct: 10 }, { qty: 3, pct: 15 }], ...overrides })
const devices = Array.from({ length: 2000 }, (_, i) => `device_${i.toString(16)}-${(i * 7919).toString(36)}`)
const mem = () => {
  const data = new Map()
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) }
}

beforeEach(() => resetRememberedQtyOfferArms())

// ------------------------------------------------------------------ payload

test('a well-formed payload is kept as is', () => {
  assert.deepEqual(normalizeQtyOffer(offer()), offer())
  assert.deepEqual(normalizeQtyOffer(offer({ weight_b: 0 })), offer({ weight_b: 0 }))
  assert.deepEqual(normalizeQtyOffer(offer({ weight_b: 100, tiers: [{ qty: 2, pct: 0 }, { qty: 3, pct: 60 }] })),
    offer({ weight_b: 100, tiers: [{ qty: 2, pct: 0 }, { qty: 3, pct: 60 }] }))
  // only the contract's fields come out
  assert.deepEqual(Object.keys(normalizeQtyOffer({ ...offer(), note: 'x' })), ['id', 'weight_b', 'tiers'])
})

test('anything malformed means no offer', () => {
  const bad = [
    undefined, null, 'x', 7, true, [], {}, JSON.stringify(offer()),
    offer({ id: 0 }), offer({ id: -1 }), offer({ id: '1' }), offer({ id: 1.5 }), offer({ id: true }), offer({ id: null }),
    offer({ weight_b: -1 }), offer({ weight_b: 101 }), offer({ weight_b: '50' }), offer({ weight_b: 50.5 }), offer({ weight_b: true }),
    offer({ weight_b: undefined }),
    offer({ tiers: undefined }), offer({ tiers: [] }), offer({ tiers: [{ qty: 2, pct: 10 }] }),
    offer({ tiers: [{ qty: 2, pct: 10 }, { qty: 3, pct: 15 }, { qty: 4, pct: 20 }] }),
    offer({ tiers: [{ qty: 3, pct: 15 }, { qty: 2, pct: 10 }] }),
    offer({ tiers: [{ qty: '2', pct: 10 }, { qty: 3, pct: 15 }] }),
    offer({ tiers: [{ qty: 2, pct: 61 }, { qty: 3, pct: 15 }] }),
    offer({ tiers: [{ qty: 2, pct: -1 }, { qty: 3, pct: 15 }] }),
    offer({ tiers: [{ qty: 2, pct: '10' }, { qty: 3, pct: 15 }] }),
    offer({ tiers: [{ qty: 2, pct: true }, { qty: 3, pct: 15 }] }),
    offer({ tiers: [{ qty: 2, pct: 10.5 }, { qty: 3, pct: 15 }] }),
    offer({ tiers: [null, { qty: 3, pct: 15 }] }),
    offer({ tiers: { 0: { qty: 2, pct: 10 }, 1: { qty: 3, pct: 15 }, length: 2 } })
  ]
  for (const value of bad) {
    assert.equal(normalizeQtyOffer(value), null, JSON.stringify(value))
    assert.equal(pickQtyOfferArm({ offer: value, deviceId: 'device_abc' }), null, JSON.stringify(value))
  }
})

// ------------------------------------------------------------------ arm

test('a device keeps its bucket for one offer and gets another one for the next offer', () => {
  for (const device of devices.slice(0, 50)) {
    const bucket = getQtyOfferBucket(1, device)
    assert.ok(Number.isInteger(bucket) && bucket >= 0 && bucket < 100)
    assert.equal(getQtyOfferBucket(1, device), bucket)
  }
  const moved = devices.slice(0, 500).filter((d) => getQtyOfferBucket(1, d) !== getQtyOfferBucket(2, d)).length
  assert.ok(moved > 450, `only ${moved} of 500 devices changed bucket between offers`)
  // the same loop as the landing experiment, with its own salt
  const sameAsLanding = devices.slice(0, 500).filter((d) => getQtyOfferBucket(1, d) === getLandingExperimentBucket(1, d)).length
  assert.ok(sameAsLanding < 30, `${sameAsLanding} of 500 devices share the landing bucket`)
})

test('no bucket and no arm without a usable offer id or device id', () => {
  for (const [id, device] of [[0, 'device_a'], [-1, 'device_a'], ['1', 'device_a'], [1.5, 'device_a'], [1, ''], [1, '   '], [1, null], [1, undefined]]) {
    assert.equal(getQtyOfferBucket(id, device), null)
  }
  assert.equal(pickQtyOfferArm({ offer: offer(), deviceId: '' }), null)
  assert.equal(pickQtyOfferArm({ offer: offer() }), null)
  assert.equal(pickQtyOfferArm(), null)
})

test('the arm is A below 100 - weight_b and B from there', () => {
  for (const device of devices.slice(0, 200)) {
    const pick = pickQtyOfferArm({ offer: offer({ weight_b: 30 }), deviceId: device })
    assert.deepEqual(Object.keys(pick), ['id', 'arm', 'bucket'])
    assert.equal(pick.id, 1)
    assert.equal(pick.bucket, getQtyOfferBucket(1, device))
    assert.equal(pick.arm, pick.bucket < 70 ? 'A' : 'B')
  }
})

test('weight 0 puts every device in A, 100 every device in B, 50 about half', () => {
  const share = (weight) => devices.filter((d) => pickQtyOfferArm({ offer: offer({ weight_b: weight }), deviceId: d }).arm === 'B').length / devices.length
  assert.equal(share(0), 0)
  assert.equal(share(100), 1)
  const half = share(50)
  assert.ok(Math.abs(half - 0.5) < 0.04, `B share ${half}`)
})

// ------------------------------------------------------------------ price rule

test('unit prices follow the contract examples', () => {
  const o = offer()
  assert.equal(qtyOfferUnitPrice(10000, 2, o), 9000)
  assert.equal(qtyOfferUnitPrice(10000, 3, o), 8500)
  assert.equal(qtyOfferUnitPrice(10000, 2, o) * 2, 18000)
  assert.equal(qtyOfferUnitPrice(10000, 3, o) * 3, 25500)
  assert.equal(qtyOfferUnitPrice(7500, 2, o), 6800)
  assert.equal(qtyOfferUnitPrice(7500, 2, o) * 2, 13600)
  assert.equal(qtyOfferUnitPrice(7500, 3, o), 6400)
  assert.equal(qtyOfferUnitPrice(7500, 3, o) * 3, 19200)
  assert.equal(qtyOfferUnitPrice(4500, 3, o), 3800)
  assert.equal(qtyOfferUnitPrice(10000, 2, offer({ tiers: [{ qty: 2, pct: 0 }, { qty: 3, pct: 0 }] })), 10000)
})

test('one piece has no discount and four or five pieces use the 3-piece rate', () => {
  const o = offer()
  assert.equal(qtyOfferUnitPrice(10000, 1, o), 10000)
  assert.equal(qtyOfferUnitPrice(7500, 1, o), 7500)
  assert.equal(qtyOfferUnitPrice(10000, 4, o), 8500)
  assert.equal(qtyOfferUnitPrice(10000, 5, o), 8500)
  assert.equal(qtyOfferUnitPrice(7500, 5, o), 6400)
  // without a usable offer the base price is untouched
  assert.equal(qtyOfferUnitPrice(10000, 3, null), 10000)
})

test('checkout pricing is today\'s without an offer or in arm A, the offer\'s in arm B', () => {
  const plain = { product_id: 'p1', price: 10000 }
  const withOffer = { ...plain, qty_offer: offer() }
  const today = (q) => ({ unitPrice: 10000, total: 10000 * q, fullTotal: 10000 * q, saved: 0, pct: 0, offerId: null })
  for (const q of [1, 2, 3, 5]) {
    assert.deepEqual(getCheckoutPricing(plain, q, null), today(q))
    assert.deepEqual(getCheckoutPricing(withOffer, q, null), today(q))
    assert.deepEqual(getCheckoutPricing(withOffer, q, { id: 1, arm: 'A', bucket: 3 }), today(q))
    // arm B but no (or another) offer in the product: today's numbers, no qty_offer_id
    assert.deepEqual(getCheckoutPricing(plain, q, { id: 1, arm: 'B', bucket: 80 }), today(q))
    assert.deepEqual(getCheckoutPricing({ ...plain, qty_offer: offer({ id: 2 }) }, q, { id: 1, arm: 'B', bucket: 80 }), today(q))
    assert.deepEqual(getCheckoutPricing({ ...plain, qty_offer: offer({ tiers: [] }) }, q, { id: 1, arm: 'B', bucket: 80 }), today(q))
  }
  const b = { id: 1, arm: 'B', bucket: 80 }
  assert.deepEqual(getCheckoutPricing(withOffer, 1, b), { unitPrice: 10000, total: 10000, fullTotal: 10000, saved: 0, pct: 0, offerId: 1 })
  assert.deepEqual(getCheckoutPricing(withOffer, 2, b), { unitPrice: 9000, total: 18000, fullTotal: 20000, saved: 2000, pct: 10, offerId: 1 })
  assert.deepEqual(getCheckoutPricing(withOffer, 3, b), { unitPrice: 8500, total: 25500, fullTotal: 30000, saved: 4500, pct: 15, offerId: 1 })
  assert.deepEqual(getCheckoutPricing(withOffer, 5, b), { unitPrice: 8500, total: 42500, fullTotal: 50000, saved: 7500, pct: 15, offerId: 1 })
  // weight_b is ignored once a device is in B (paused offers keep the price)
  assert.equal(getCheckoutPricing({ ...plain, qty_offer: offer({ weight_b: 0 }) }, 3, b).total, 25500)
})

// ------------------------------------------------------------------ kept arm

test('event properties exist only for an arm', () => {
  assert.deepEqual(qtyOfferEventProperties({ id: 1, arm: 'B', bucket: 80 }), { qo_exp: 1, qo_var: 'B' })
  assert.deepEqual(qtyOfferEventProperties({ id: 1, arm: 'A', bucket: 3 }), { qo_exp: 1, qo_var: 'A' })
  for (const value of [null, undefined, {}, { id: '1', arm: 'B', bucket: 1 }, { id: 1, arm: 'C', bucket: 1 }]) {
    assert.deepEqual(qtyOfferEventProperties(value), {})
  }
})

test('the arm kept for a product survives a reload through sessionStorage, and a kept "no offer" wins', () => {
  const storage = mem()
  assert.equal(recallQtyOfferArm('p1', storage), undefined)
  rememberQtyOfferArm('p1', { id: 1, arm: 'B', bucket: 80 }, storage)
  rememberQtyOfferArm(2, null, storage)
  resetRememberedQtyOfferArms()
  assert.deepEqual(recallQtyOfferArm('p1', storage), { id: 1, arm: 'B', bucket: 80 })
  assert.equal(recallQtyOfferArm('2', storage), null)

  const deviceId = 'device_abc'
  const allB = offer({ weight_b: 100 })
  assert.equal(resolveQtyOfferArm({ productId: 2, offer: allB, deviceId, storage }), null)
  assert.deepEqual(resolveQtyOfferArm({ productId: 3, offer: allB, deviceId, storage }), pickQtyOfferArm({ offer: allB, deviceId }))
  assert.equal(recallQtyOfferArm(3, storage).arm, 'B')
  assert.equal(resolveQtyOfferArm({ productId: 4, offer: null, deviceId, storage }), null)
})

test('unusable storage never breaks the kept arm', () => {
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  rememberQtyOfferArm('p9', { id: 1, arm: 'A', bucket: 3 }, broken)
  assert.deepEqual(recallQtyOfferArm('p9', broken), { id: 1, arm: 'A', bucket: 3 })
  const garbage = mem(); garbage.setItem('cod_qty_offer_arms_v1', '{not json')
  assert.equal(recallQtyOfferArm('p10', garbage), undefined)
  rememberQtyOfferArm('p10', { id: 1, arm: 'B', bucket: 99 }, garbage)
  resetRememberedQtyOfferArms()
  assert.deepEqual(recallQtyOfferArm('p10', garbage), { id: 1, arm: 'B', bucket: 99 })
})

// ------------------------------------------------- analytics, checkout page and popup (vite)

let server
let analytics
let ssrQtyOffer
let PaymentPage, QtyOfferModal, AdTrackingContext
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    define: { 'import.meta.env.VITE_ENABLE_CONSOLE_LOGS': JSON.stringify('false') },
    appType: 'custom',
    logLevel: 'silent'
  })
  analytics = await server.ssrLoadModule('/src/services/checkoutFunnelAnalytics.js')
  ssrQtyOffer = await server.ssrLoadModule('/src/utils/qtyOffer.js')
  PaymentPage = (await server.ssrLoadModule('/src/pages/PaymentPage.jsx')).default
  QtyOfferModal = (await server.ssrLoadModule('/src/components/QtyOfferModal.jsx')).default
  AdTrackingContext = (await server.ssrLoadModule('/src/contexts/AdTrackingContext.jsx')).default
})
after(async () => { await server?.close() })

const withBrowser = async (fn) => {
  const originalWindow = globalThis.window, originalDocument = globalThis.document
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const sent = []
  globalThis.document = { referrer: '' }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { sendBeacon: (url, body) => { sent.push(body); return true } } })
  const localStorage = mem(); localStorage.setItem('cod_checkout_device_id', 'device_qo-test')
  globalThis.window = { localStorage, sessionStorage: mem(), location: { hostname: 'www.brainnel.com', search: '',
    pathname: '/product/1', href: 'https://www.brainnel.com/product/1' } }
  const events = async () => (await Promise.all(sent.map((b) => b.text()))).map((text) => JSON.parse(text).events[0])
  try {
    return await fn({ events })
  } finally {
    globalThis.window = originalWindow; globalThis.document = originalDocument
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
  }
}

test('landing view and every checkout event of the product carry qo_exp / qo_var; arm B reports offer prices', async () => {
  for (const [weight, arm, unit3] of [[100, 'B', 8500], [0, 'A', 10000]]) {
    await withBrowser(async ({ events }) => {
      const product = { product_id: `qo-${weight}`, name_fr: 'Produit', price: 10000, skus: [], qty_offer: offer({ weight_b: weight }) }
      const pick = ssrQtyOffer.pickQtyOfferArm({ offer: product.qty_offer, deviceId: analytics.getCheckoutDeviceId() })
      assert.equal(pick.arm, arm)
      ssrQtyOffer.rememberQtyOfferArm(product.product_id, pick)
      analytics.trackProductLandingView(product, { product_type: 'product' })
      const sessionId = analytics.beginCheckoutFunnel(product)
      analytics.trackCheckoutEvent('qty_offer_view', analytics.buildCheckoutProductProperties(product, { quantity: 1 }), { sessionId })
      analytics.trackCheckoutEvent('quantity_confirmed', {
        ...analytics.buildCheckoutProductProperties(product, { quantity: 3, total_price: 3 * unit3 }),
        quantity_confirm_method: 'qty_offer_popup'
      }, { sessionId })
      analytics.trackCheckoutEvent('order_create_success', { order_no: 'TEST-NOT-SENT' })
      const sent = await events()
      assert.deepEqual(sent.map((e) => e.event_name), ['product_landing_view', 'checkout_start', 'qty_offer_view', 'quantity_confirmed', 'order_create_success'])
      for (const event of sent) {
        assert.equal(event.properties.qo_exp, 1, event.event_name)
        assert.equal(event.properties.qo_var, arm, event.event_name)
      }
      const confirmed = sent[3].properties
      assert.deepEqual([confirmed.quantity, confirmed.unit_price, confirmed.total_price, confirmed.quantity_confirm_method],
        [3, unit3, 3 * unit3, 'qty_offer_popup'])
      // the order event keeps the confirmed context
      assert.equal(sent[4].properties.total_price, 3 * unit3)
    })
  }
})

test('a product without an offer carries neither property, even after a context that had them', async () => {
  await withBrowser(async ({ events }) => {
    const product = { product_id: 'qo-none', name_fr: 'Produit', price: 10000, skus: [] }
    ssrQtyOffer.rememberQtyOfferArm(product.product_id, null)
    analytics.trackProductLandingView(product, { product_type: 'product' })
    const sessionId = analytics.beginCheckoutFunnel(product)
    analytics.trackCheckoutEvent('submit_order_click', { qo_exp: 1, qo_var: 'B', product_id: 'qo-none' }, { sessionId })
    for (const event of await events()) {
      assert.equal('qo_exp' in event.properties, false, event.event_name)
      assert.equal('qo_var' in event.properties, false, event.event_name)
      assert.equal(event.properties.unit_price, 10000)
    }
  })
})

const renderPayment = (state) => renderToStaticMarkup(createElement(MemoryRouter, {
  initialEntries: [{ pathname: '/payment', search: '?step=1', state }]
}, createElement(AdTrackingContext.Provider, { value: { adId: null, isLoading: false } }, createElement(PaymentPage))))
const experiment = { checkout_quantity_variant: 'single_page_checkout' }

test('checkout page shows the offer total and the discount line in arm B, today\'s card in arm A', () => {
  const base = { name_fr: 'Produit test', price: 10000, stock: 99, image_url: [], skus: [{ sku_id: 'sku-test' }] }
  const b = renderPayment({ product: { ...base, product_id: 'qo-page-b', qty_offer: offer({ weight_b: 100 }) }, quantity: 3, checkoutQuantityExperiment: experiment })
  assert.match(b, /8\u202f500 FCFA/)
  assert.match(b, /<s>30\u202f000 FCFA<\/s><strong>25\u202f500 FCFA<\/strong>/)
  assert.match(b, /Remise −15 % · −4\u202f500 FCFA/)

  const a = renderPayment({ product: { ...base, product_id: 'qo-page-a', qty_offer: offer({ weight_b: 0 }) }, quantity: 3, checkoutQuantityExperiment: experiment })
  const none = renderPayment({ product: { ...base, product_id: 'qo-page-none' }, quantity: 3, checkoutQuantityExperiment: experiment })
  assert.match(a, /<strong>30000 FCFA<\/strong>/)
  assert.doesNotMatch(a, /Remise|<s>/)
  assert.equal(a.replaceAll('qo-page-a', 'X'), none.replaceAll('qo-page-none', 'X'))
})

test('popup: three radio tiles, 1 chosen by default, tiers above the stock sold out', () => {
  const product = { product_id: 'qo-popup', name_fr: 'Produit', price: 10000, stock: 2, image_url: ['https://x/a.jpg'], qty_offer: offer() }
  const html = renderToStaticMarkup(createElement(QtyOfferModal, { product, offerArm: { id: 1, arm: 'B', bucket: 80 } }))
  assert.equal((html.match(/role="radio"/g) || []).length, 3)
  assert.match(html, /role="radio" aria-checked="true"[^>]*aria-label="1 pièce, 10\u202f000 FCFA"/)
  assert.match(html, /aria-label="2 pièces, 18\u202f000 FCFA, -10 %"/)
  assert.match(html, /aria-label="3 pièces, 25\u202f500 FCFA, épuisé"[^>]*disabled=""/)
  assert.match(html, /Épuisé/)
  assert.match(html, /9\u202f000 \/ pièce/)
  assert.match(html, /Combien en voulez-vous \?/)
  assert.match(html, /Continuer/)
})
