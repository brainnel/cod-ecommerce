import assert from 'node:assert/strict'
import test from 'node:test'
import { isClarityLanding, getStoredLandingReviews, getBundleItemUnitPrice, CLARITY_DELIVERY_PROMISE } from '../src/utils/landingPresentation.js'

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

test('delivery wording promises free home delivery in Abidjan within 48 hours', () => {
  assert.equal(CLARITY_DELIVERY_PROMISE, 'Livraison gratuite à domicile à Abidjan sous 48 h')
})
test('bundle item price stays per unit without changing the catalog amount', () => {
  assert.equal(getBundleItemUnitPrice({ unit_price: 8500, quantity: 2, line_price: 17000 }), 8500)
  assert.equal(getBundleItemUnitPrice({ unit_price: '7100', quantity: 2 }), 7500)
  for (const bad of [undefined, null, '', ' ', false, true, [], {}, 0, -5, NaN, Infinity, 'invalid']) {
    assert.equal(getBundleItemUnitPrice({ unit_price: bad }), null)
  }
  assert.equal(getBundleItemUnitPrice(null), null)
  const item = Object.freeze({ unit_price: 7100, quantity: 2, line_price: 14200 })
  assert.equal(getBundleItemUnitPrice(item), 7500)
  assert.deepEqual(item, { unit_price: 7100, quantity: 2, line_price: 14200 })
})
