import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startCustomerCommunitySync } from '../src/services/customerCommunity.js'

const group = { id: 'vip-6', url: 'https://chat.whatsapp.com/GQ9QZYGU5flEs89cMGgZbR' }
const second = { id: 'vip-14', url: 'https://chat.whatsapp.com/FE3anudbW1R0EfXrT8kbCU' }
const flush = () => new Promise(resolve => setImmediate(resolve))
const response = (groups) => ({ ok: true, json: async () => ({ groups }) })
const setup = (fetchImpl) => {
  const updates = []
  const eventTarget = new EventTarget()
  const visibilityTarget = new EventTarget()
  visibilityTarget.visibilityState = 'visible'
  let interval
  let timeout
  const timers = {
    setInterval: (fn, delay) => { assert.equal(delay, 60_000); interval = fn; return 1 },
    clearInterval: () => { interval = null },
    setTimeout: (fn, delay) => { assert.equal(delay, 5_000); timeout = fn; return 2 },
    clearTimeout: () => { timeout = null },
  }
  const sync = startCustomerCommunitySync({ url: 'https://api.example/api/customer-community', onGroups: groups => updates.push(groups), fetchImpl, eventTarget, visibilityTarget, timers })
  return { ...sync, updates, eventTarget, visibilityTarget, tick: () => interval?.(), expire: () => timeout?.(), interval: () => interval }
}

test('configuration fetch is public GET without phone, credentials, analytics or forced refresh', async () => {
  const calls = []
  const sync = setup(async (...args) => { calls.push(args); return response([group]) })
  await flush()
  assert.deepEqual(sync.updates, [[group]])
  assert.equal(calls[0][0], 'https://api.example/api/customer-community')
  assert.equal(calls[0][1].method, 'GET')
  assert.equal(calls[0][1].credentials, 'omit')
  assert.equal(calls[0][1].cache, 'no-store')
  assert.equal(calls[0][1].body, undefined)
  sync.stop()
})

test('60 second and focus refresh replace groups, and all-disabled clears a prior valid pool', async () => {
  const queue = [[group], [second], []]
  const sync = setup(async () => response(queue.shift()))
  await flush()
  sync.tick()
  await flush()
  sync.eventTarget.dispatchEvent(new Event('focus'))
  await flush()
  assert.deepEqual(sync.updates, [[group], [second], []])
  sync.stop()
  assert.equal(sync.interval(), null)
})

test('network, HTTP and malformed failures do not publish invalid or hardcoded fallback groups', async () => {
  let behavior = 'network'
  const sync = setup(async () => {
    if (behavior === 'network') throw new Error('offline')
    if (behavior === 'http') return { ok: false }
    if (behavior === 'invalid') return response([group, group])
    return response([group])
  })
  await flush()
  assert.deepEqual(sync.updates, [])
  behavior = 'valid'
  await sync.refresh()
  for (behavior of ['http', 'invalid', 'network']) await sync.refresh()
  assert.deepEqual(sync.updates, [[group]])
  sync.stop()
})

test('in-flight refreshes are coalesced and unmount aborts without updating state', async () => {
  let resolve
  let signal
  let calls = 0
  const sync = setup((url, options) => { calls++; signal = options.signal; return new Promise(done => { resolve = done }) })
  await sync.refresh()
  sync.tick()
  sync.eventTarget.dispatchEvent(new Event('focus'))
  assert.equal(calls, 1)
  sync.stop()
  assert.equal(signal.aborted, true)
  resolve(response([group]))
  await flush()
  assert.deepEqual(sync.updates, [])
  await sync.refresh()
  sync.eventTarget.dispatchEvent(new Event('focus'))
  assert.equal(calls, 1)
})

test('timeout aborts request, later refresh can recover; hidden pages resume on visibility', async () => {
  let calls = 0
  let signal
  const sync = setup((url, options) => {
    calls++
    signal = options.signal
    if (calls > 1) return Promise.resolve(response([group]))
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
  })
  sync.expire()
  await flush()
  assert.equal(signal.aborted, true)
  assert.deepEqual(sync.updates, [])
  sync.visibilityTarget.visibilityState = 'hidden'
  sync.tick()
  assert.equal(calls, 1)
  sync.visibilityTarget.visibilityState = 'visible'
  sync.visibilityTarget.dispatchEvent(new Event('visibilitychange'))
  await flush()
  assert.deepEqual(sync.updates, [[group]])
  sync.stop()
})
