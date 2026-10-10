import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { buildBrowserPurchasePayload, normalizeMetaPhone, trackBrowserPurchase } from '../src/utils/metaPurchase.js'

const hash = value => createHash('sha256').update(value).digest('hex')
const order = (orderNo = 'FL-META-TEST') => ({
  order_no: orderNo,
  actual_amount: 12000,
  total_amount: 15000,
  currency: 'FCFA',
  items: [{ product_id: '123', quantity: 2, unit_price: 7500 }]
})

test('CI phone hashing input preserves significant zero with all accepted prefixes', () => {
  for (const prefix of ['01', '05', '07']) {
    for (const input of [`${prefix} 12 34 56 78`, `+225${prefix}12345678`, `00225${prefix}12345678`]) {
      assert.equal(normalizeMetaPhone(input), `225${prefix}12345678`)
    }
  }
  assert.equal(normalizeMetaPhone(''), null)
  assert.equal(normalizeMetaPhone(null), null)
  assert.equal(hash(normalizeMetaPhone('0712345678')), hash('2250712345678'))
  assert.notEqual(hash(normalizeMetaPhone('0712345678')), hash('225712345678'))
})

test('single-product Purchase matches CAPI identity, XOF, actual amount and catalog IDs', async () => {
  const payload = await buildBrowserPurchasePayload(order())
  assert.equal(payload.eventId, 'purchase_FL-META-TEST')
  assert.deepEqual(payload.customData, {
    currency: 'XOF', value: 12000, order_id: 'FL-META-TEST', content_type: 'product',
    content_ids: [hash('/product/123')],
    contents: [{ id: hash('/product/123'), quantity: 2, item_price: 7500 }],
    num_items: 2
  })
})

test('bundle Purchase uses authoritative child items, not synthetic bundle ID', async () => {
  const payload = await buildBrowserPurchasePayload({
    ...order('BD-META-TEST'),
    items: [
      { product_id: '123', quantity: 2, unit_price: 3000 },
      { product_id: '456', quantity: 1, unit_price: 6000 }
    ]
  })
  assert.equal(payload.eventId, 'purchase_BD-META-TEST')
  assert.deepEqual(payload.customData.content_ids, [hash('/product/123'), hash('/product/456')])
  assert.equal(payload.customData.num_items, 3)
  assert.equal(payload.customData.value, 12000)
})

test('browser event is queued once, with eventID equal to server event_id', async () => {
  const calls = []
  const pixel = (...args) => calls.push(args)
  const created = order('FL-CONCURRENT-TEST')
  const results = await Promise.all([trackBrowserPurchase(created, pixel), trackBrowserPurchase(created, pixel)])
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].slice(0, 2), ['track', 'Purchase'])
  assert.deepEqual(calls[0][3], { eventID: 'purchase_FL-CONCURRENT-TEST' })
  assert.equal(results.filter(result => result.duplicate).length, 1)
})

test('missing Pixel does not mark order sent and permits a later retry', async () => {
  const created = order('FL-PIXEL-LATE-TEST')
  assert.equal((await trackBrowserPurchase(created, undefined)).skipped, 'pixel_unavailable')
  let calls = 0
  assert.equal((await trackBrowserPurchase(created, () => { calls++ })).success, true)
  assert.equal(calls, 1)
})

test('Pixel error cannot reject checkout and remains retryable', async () => {
  const created = order('FL-PIXEL-THROW-TEST')
  const result = await trackBrowserPurchase(created, () => { throw new Error('blocked') })
  assert.equal(result.skipped, 'browser_purchase_failed')
  assert.equal((await trackBrowserPurchase(created, () => {})).success, true)
})

test('invalid response never invents a timestamp or order-id based Purchase', async () => {
  let calls = 0
  for (const created of [{}, { order_id: 42 }, { ...order('FL-MISSING-ITEMS'), items: [] }, { ...order('FL-BAD-AMOUNT'), actual_amount: 'invalid' }]) {
    assert.equal((await trackBrowserPurchase(created, () => { calls++ })).success, false)
  }
  assert.equal(calls, 0)
})

test('bad item data is safely skipped', async () => {
  assert.equal((await trackBrowserPurchase({ ...order('BD-BAD-ITEM'), items: [{ product_id: '123', quantity: 0, unit_price: 10 }] }, () => {})).skipped, 'browser_purchase_failed')
})
