import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getWhatsAppCustomerGroup, WHATSAPP_CUSTOMER_GROUPS } from '../src/config/customerCommunity.js'

test('active URLs match the 2026-11-03 workbook including the two approved recovered groups', () => {
  const expectedInvites = [
    [6, 'GQ9QZYGU5flEs89cMGgZbR'], [8, 'KFRHTaa2xXRCfIb6zUJ7DO'],
    [9, 'DhVmBef4cHKBjMTASXgJih'], [10, 'GECixpFrwyhFZPQhpL8fN6'],
    [11, 'KdhaTxeQqNc3isDTJv0otu'], [12, 'KHgeQor7H5sEwcXhdTjw6J'],
    [13, 'EVZ4b4KWATKID7lJWdXLIa'], [14, 'FE3anudbW1R0EfXrT8kbCU'],
    [15, 'FZ05Ezu0GQbEVlgMTCYQrU'],
    [16, 'Lbll8XiUvYP0AOjlowGzpt'], [17, 'EwO6DR3u1eFCJCOVonhwpG'],
    [19, 'Jv4xazim5Sd8F66kajTGGl'], [20, 'EwMuUvP69r8IMOBGLRoc3f'],
    [23, 'HXem9u10sTf8l8LQ9LzW1k'], [25, 'IvQOCCZEkP4GbNLTd3R1ld'],
    [26, 'DjjeJQDAstB6a8UkT3Mdai'], [28, 'BZ384nEiPATHA6cPlY03oG'],
    [29, 'G18xd22mAyo0ylyadLNJCW'],
    [30, 'DeQFc844fGwHCVUzHmc8Rb'], [31, 'DxvIO3CNo2uFEyOcHGMUdY'],
    [32, 'G976iLIGILM4Zv9CQxQRm8'],
  ]
  assert.deepEqual(WHATSAPP_CUSTOMER_GROUPS, expectedInvites.map(([number, invite]) => ({
    id: `vip-${number}`, url: `https://chat.whatsapp.com/${invite}`
  })))
})

test('active pool contains only the 21 approved groups, excluding six paused groups and the full group', () => {
  const activeNumbers = [6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 23, 25, 26, 28, 29, 30, 31, 32]
  const pausedInvites = [
    'H92czONXP598QKJloJKlgz', 'JQIOhktypOeHKqdQUrsbET',
    'ElQRQkQ5UvlJDx7QoPmwey', 'Eh8XooDqURO5LqllKaERpF',
    'FSpBz04lWAq1vyzVrjx3Ah', 'CDBQbh2sKWM69OvebW7atO'
  ]
  assert.equal(WHATSAPP_CUSTOMER_GROUPS.length, 21)
  assert.equal(new Set(WHATSAPP_CUSTOMER_GROUPS.map((group) => group.url)).size, 21)
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
  assert.equal(groups.size, 21)
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
