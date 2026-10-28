import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getWhatsAppCustomerGroup, WHATSAPP_CUSTOMER_GROUPS } from '../src/config/customerCommunity.js'

test('active pool contains 27 unique WhatsApp invites for VIP 6–32 and excludes the full group', () => {
  assert.equal(WHATSAPP_CUSTOMER_GROUPS.length, 27)
  assert.equal(new Set(WHATSAPP_CUSTOMER_GROUPS.map((group) => group.url)).size, 27)
  assert.deepEqual(WHATSAPP_CUSTOMER_GROUPS.map((group) => group.id), Array.from({ length: 27 }, (_, i) => `vip-${i + 6}`))
  for (const group of WHATSAPP_CUSTOMER_GROUPS) {
    assert.match(group.url, /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{22}$/)
    assert.ok(!group.url.includes('J9FXDmYfDxw82BKo3Nzy57'))
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
  assert.equal(groups.size, 27)
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
      assert.ok(Math.abs(count - sampleSize / 27) < sampleSize / 27 * 0.15, `${sequence} ${id}: ${count}`)
    }
  }
})
