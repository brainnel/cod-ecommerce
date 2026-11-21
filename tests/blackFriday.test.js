import assert from 'node:assert/strict'
import test from 'node:test'
import { BLACK_FRIDAY, getBlackFridayOffer, getBlackFridayTimeLeft } from '../src/utils/blackFriday.js'

const DURING = Date.UTC(2026, 10, 22, 12)

test('usual price is the current price ÷ 0.7 to the nearest 100 FCFA', () => {
  for (const [price, usual] of [[10000, 14300], [9500, 13600], [16000, 22900], [8500, 12100], [7500, 10700], [500, 700], ['10000', 14300]]) {
    const offer = getBlackFridayOffer(price, DURING)
    assert.equal(offer.usualPrice, usual, `price ${price}`)
    assert.equal(offer.price, Number(price))
    assert.equal(offer.saving, usual - Number(price))
    assert.equal(offer.id, 'bf2026')
    assert.equal(offer.endsAt, BLACK_FRIDAY.endsAt)
  }
})

test('rounding keeps the usual price within half a point of a 30 % discount', () => {
  for (let price = 5000; price <= 60000; price += 500) {
    const { usualPrice, saving } = getBlackFridayOffer(price, DURING)
    assert.equal(Math.round(saving / usualPrice * 100), 30, `price ${price}`)
  }
})

test('no offer for a price that is not a positive amount', () => {
  for (const bad of [undefined, null, '', ' ', 0, -5, NaN, Infinity, 'abc', true, false, [], {}]) {
    assert.equal(getBlackFridayOffer(bad, DURING), null)
  }
})

test('the offer ends on 30 November 2026 at 23:59:59 in Abidjan', () => {
  assert.equal(new Date(BLACK_FRIDAY.endsAt).toISOString(), '2026-11-30T23:59:59.000Z')
  assert.notEqual(getBlackFridayOffer(10000, BLACK_FRIDAY.endsAt - 1), null)
  assert.equal(getBlackFridayOffer(10000, BLACK_FRIDAY.endsAt), null)
  assert.equal(getBlackFridayOffer(10000, Date.UTC(2026, 11, 1)), null)
  assert.equal(getBlackFridayOffer(10000, NaN), null)
})

test('time left is split into days, hours, minutes and seconds', () => {
  const end = BLACK_FRIDAY.endsAt
  const span = (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000
  assert.deepEqual(getBlackFridayTimeLeft(end, end - span), { days: 2, hours: 3, minutes: 4, seconds: 5 })
  assert.deepEqual(getBlackFridayTimeLeft(end, end - 999), { days: 0, hours: 0, minutes: 0, seconds: 0 })
  assert.deepEqual(getBlackFridayTimeLeft(end, end - 86400 * 1000), { days: 1, hours: 0, minutes: 0, seconds: 0 })
})

test('no time is shown after the end or when the device clock is far off', () => {
  const end = BLACK_FRIDAY.endsAt
  assert.equal(getBlackFridayTimeLeft(end, end), null)
  assert.equal(getBlackFridayTimeLeft(end, end + 1000), null)
  assert.equal(getBlackFridayTimeLeft(end, end - 11 * 86400 * 1000), null)
  assert.equal(getBlackFridayTimeLeft(end, NaN), null)
})
