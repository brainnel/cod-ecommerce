import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getWhatsAppCustomerGroup, WHATSAPP_CUSTOMER_GROUPS } from '../src/config/customerCommunity.js'

test('active pool contains only the 19 approved groups, excluding eight paused groups and the full group', () => {
  const activeNumbers = [6, 8, 9, 10, 11, 12, 13, 15, 16, 17, 19, 20, 23, 25, 26, 29, 30, 31, 32]
  const pausedInvites = [
    'KoL8Rmx8deOFBgCsquEagD', 'FX7n7uCDRZL8QOFIdaNLMc',
    'DX4uwaZaQKvC2LdNBskDcC', 'GebYIM4riFB5FuOdvv0u3u',
    'FtLUpIXH6SuJrAlDLfI3Xq', 'EQMQpApWENZ23tYKcspRPt',
    'BmOkzxOyUc0IvwWRMOcuyq', 'GibefhXb86uKvLgVCipgSy'
  ]
  assert.equal(WHATSAPP_CUSTOMER_GROUPS.length, 19)
  assert.equal(new Set(WHATSAPP_CUSTOMER_GROUPS.map((group) => group.url)).size, 19)
  assert.deepEqual(WHATSAPP_CUSTOMER_GROUPS.map((group) => group.id), activeNumbers.map((number) => `vip-${number}`))
  for (const group of WHATSAPP_CUSTOMER_GROUPS) {
    assert.match(group.url, /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{22}$/)
    assert.ok(!group.url.includes('J9FXDmYfDxw82BKo3Nzy57'))
    for (const invite of pausedInvites) assert.ok(!group.url.includes(invite))
  }
})

test('phone formatting, country prefix and later orders keep the same assignment', () => {
  const expected = getWhatsAppCustomerGroup({ phone: '0700000123', orderId: 'FL-1' })
  for (const phone of ['0700000123', '07 00 00 01 23', '+2250700000123', '2250700000123', '002250700000123']) {
    assert.equal(getWhatsAppCustomerGroup({ phone, orderId: 'BD-2' }), expected)
  }
})

test('missing phone uses a stable order fallback and never the retired invite', () => {
  for (const input of [{ orderId: 'FL-123' }, { phone: '', orderId: 'BD-456' }, {}, undefined]) {
    assert.equal(getWhatsAppCustomerGroup(input), getWhatsAppCustomerGroup(input))
    assert.ok(WHATSAPP_CUSTOMER_GROUPS.includes(getWhatsAppCustomerGroup(input)))
  }
  const groups = new Set(Array.from({ length: 1000 }, (_, i) => getWhatsAppCustomerGroup({ orderId: `FL-${i}` }).id))
  assert.equal(groups.size, 19)
})

test('sequential and dispersed customer numbers spread across all groups within 15 percent of equal shares', () => {
  for (const sequence of ['sequential', 'dispersed']) {
    const counts = Object.fromEntries(WHATSAPP_CUSTOMER_GROUPS.map((group) => [group.id, 0]))
    const sampleSize = 27000
    for (let i = 0; i < sampleSize; i += 1) {
      const suffix = sequence === 'sequential' ? i : (Math.imul(i, 7919) >>> 0) % 100000000
      const phone = `${['01', '05', '07'][i % 3]}${String(suffix).padStart(8, '0')}`
      counts[getWhatsAppCustomerGroup({ phone }).id] += 1
    }
    for (const [id, count] of Object.entries(counts)) {
      const expected = sampleSize / WHATSAPP_CUSTOMER_GROUPS.length
      assert.ok(Math.abs(count - expected) < expected * 0.15, `${sequence} ${id}: ${count}`)
    }
  }
})
