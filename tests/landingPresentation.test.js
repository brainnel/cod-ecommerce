import assert from 'node:assert/strict'
import test from 'node:test'
import { isClarityLanding, getStoredLandingReviews, getLandingReferencePrice, getBundleSeparatePurchasePrice, getBundleItemUnitPrice, CLARITY_DELIVERY_PROMISE } from '../src/utils/landingPresentation.js'

test('approved design defaults on for local and all production hosts', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.equal(isClarityLanding('', host), true)
  for (const host of ['www.brainnel.com', 'brainnel-vite.com', 'example.com', 'localhost.example.com']) {
    assert.equal(isClarityLanding('', host), true)
    assert.equal(isClarityLanding('?landing_design=clarity', host), true)
    assert.equal(isClarityLanding('?landing_design=original', host), true)
  }
})
test('original landing remains available for local comparison', () => {
  assert.equal(isClarityLanding('?landing_design=original', 'localhost'), false)
  assert.equal(isClarityLanding('?ad_id=123&landing_design=clarity', 'localhost'), true)
})
test('clarity reviews never invent fallback testimonials', () => {
  assert.deepEqual(getStoredLandingReviews({}), [])
  assert.deepEqual(getStoredLandingReviews({ reviews: [null, { text: 'Vrai texte' }, {}] }), [{ text: 'Vrai texte' }])
})

test('reference price uses supplied catalog values without generating discounts', () => {
  assert.equal(getLandingReferencePrice(13000, 41936), 41936)
  assert.equal(getLandingReferencePrice('13000', '41936'), 41936)
  assert.equal(getLandingReferencePrice(13000), null)
})
test('reference prices fail closed for missing, malformed or non-discount values', () => {
  for (const bad of [undefined, null, '', ' ', false, true, [], {}, NaN, Infinity, 'invalid', 0, -5]) {
    assert.equal(getLandingReferencePrice(13000, bad), null)
    assert.equal(getLandingReferencePrice(bad, 41936), null)
  }
  for (const ref of [12000, 13000, 13000.4]) assert.equal(getLandingReferencePrice(13000, ref), null)
  assert.equal(getLandingReferencePrice(14999.6, 15000), null)
})
test('bundle comparison sums actual unit prices and quantities, not generated original price', () => {
  assert.equal(getBundleSeparatePurchasePrice({ cfa_price: 8500, original_price: 99999,
    items: [{ unit_price: 8500, quantity: 1 }, { unit_price: 8000, quantity: 1 }] }), 16500)
  assert.equal(getBundleSeparatePurchasePrice({ cfa_price: 8000,
    items: [{ unit_price: '7100', quantity: 1 }, { unit_price: 3100, quantity: 2 }] }), 14500)
})
test('bundle comparison requires every component price and positive integer quantity', () => {
  assert.equal(getBundleSeparatePurchasePrice({ cfa_price: 8000, original_price: 20000 }), null)
  assert.equal(getBundleSeparatePurchasePrice({ cfa_price: 8000, items: [] }), null)
  for (const bad of [null, {}, { unit_price: 15000 }, { unit_price: 15000, quantity: 0 },
    { unit_price: 15000, quantity: 1.5 }, { unit_price: Infinity, quantity: 1 }]) {
    assert.equal(getBundleSeparatePurchasePrice({ cfa_price: 8000,
      items: [{ unit_price: 9000, quantity: 1 }, bad] }), null)
  }
  assert.equal(getBundleSeparatePurchasePrice({ cfa_price: 9000,
    items: [{ unit_price: 9000, quantity: 1 }] }), null)
})
test('delivery wording promises free home delivery in Abidjan within 48 hours', () => {
  assert.equal(CLARITY_DELIVERY_PROMISE, 'Livraison gratuite à domicile à Abidjan sous 48 h')
})
test('bundle item price stays per unit and matches the separate purchase comparison', () => {
  assert.equal(getBundleItemUnitPrice({ unit_price: 8500, quantity: 2, line_price: 17000 }), 8500)
  assert.equal(getBundleItemUnitPrice({ unit_price: '7100', quantity: 2 }), 7500)
  for (const bad of [undefined, null, '', false, [], 0, -5, NaN, Infinity]) {
    assert.equal(getBundleItemUnitPrice({ unit_price: bad }), null)
  }
  assert.equal(getBundleItemUnitPrice(null), null)
  const items = [{ unit_price: 7100, quantity: 1 }, { unit_price: 3100, quantity: 2 }]
  const displayedSum = items.reduce((sum, item) => sum + getBundleItemUnitPrice(item) * item.quantity, 0)
  assert.equal(getBundleSeparatePurchasePrice({ cfa_price: 8000, items }), displayedSum)
})
