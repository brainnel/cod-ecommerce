import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampCheckoutQuantity, getCheckoutQuantityLimit, MAX_CHECKOUT_QUANTITY } from '../src/utils/checkoutQuantity.js'

test('checkout caps all positive high-stock and bundle quantities at five', () => {
  assert.equal(MAX_CHECKOUT_QUANTITY, 5)
  for (const product of [{ stock: 99 }, { stock: '50' }, { stock: 5 }, { product_type: 'bundle', stock: 99 }]) {
    assert.equal(getCheckoutQuantityLimit(product), 5)
    for (const quantity of [5, 6, 99, '999999', 100000000]) assert.equal(clampCheckoutQuantity(quantity, product), 5)
  }
})

test('lower known stock still wins and integer amounts are preserved', () => {
  for (const stock of [1, 2, 3, 4, '3']) {
    assert.equal(getCheckoutQuantityLimit({ stock }), Number(stock))
    assert.equal(clampCheckoutQuantity(99, { stock }), Number(stock))
  }
  for (const quantity of [1, 2, 3, 4, 5]) assert.equal(clampCheckoutQuantity(quantity, { stock: 99 }), quantity)
  assert.equal(clampCheckoutQuantity('3.9', { stock: 99 }), 3)
})

test('missing or nonpositive stock retains the fallback but never permits more than five', () => {
  for (const product of [undefined, {}, { stock: null }, { stock: '' }, { stock: 0 }, { stock: -1 }, { stock: Infinity }, { stock: 'unknown' }]) {
    assert.equal(getCheckoutQuantityLimit(product), 5)
    assert.equal(clampCheckoutQuantity(99, product), 5)
  }
})

test('blank, invalid, negative and decimal input cannot produce zero, NaN or fractional quantity', () => {
  for (const quantity of [undefined, null, '', 'abc', Infinity, NaN, 0, -10, '0.8']) {
    assert.equal(clampCheckoutQuantity(quantity, { stock: 99 }), 1)
  }
  assert.equal(clampCheckoutQuantity(99, { stock: 0.5 }), 1)
})
