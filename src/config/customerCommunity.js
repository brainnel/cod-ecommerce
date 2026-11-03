export const WHATSAPP_GROUP_CLICK_EVENT = 'order_success_whatsapp_group_click'

// The private maintenance sheet is read by the backend. Never restore retired
// invites from a bundled fallback when the live pool is empty or unavailable.
export const parseCustomerCommunityGroups = (payload) => {
  if (!payload || !Array.isArray(payload.groups)) throw new Error('Invalid community configuration')
  const ids = new Set()
  const urls = new Set()
  const groups = payload.groups.map((group) => {
    if (!group || typeof group.id !== 'string' || !/^vip-[1-9]\d*$/.test(group.id)
      || !Number.isSafeInteger(Number(group.id.slice(4)))
      || typeof group.url !== 'string' || !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{22}$/.test(group.url)
      || ids.has(group.id) || urls.has(group.url)) {
      throw new Error('Invalid community configuration')
    }
    ids.add(group.id)
    urls.add(group.url)
    return { id: group.id, url: group.url }
  })
  // Sheet row reordering does not change the customer's assignment.
  return groups.sort((a, b) => Number(a.id.slice(4)) - Number(b.id.slice(4)))
}

export const getWhatsAppCustomerGroup = ({ phone, orderId, groups = [] } = {}) => {
  if (!groups.length) return null
  let normalizedPhone = String(phone || '').replace(/\D/g, '')
  if (normalizedPhone.length === 15 && normalizedPhone.startsWith('00225')) {
    normalizedPhone = normalizedPhone.slice(5)
  } else if (normalizedPhone.length === 13 && normalizedPhone.startsWith('225')) {
    normalizedPhone = normalizedPhone.slice(3)
  }

  // Phone is used locally only, never in configuration requests, invite URLs or
  // click events. Adding/removing a group can change the modulo assignment.
  const key = normalizedPhone ? `phone:${normalizedPhone}` : `order:${orderId || 'unknown'}`
  let hash = 2166136261
  for (let i = 0; i < key.length; i += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619)
  }
  return groups[(hash >>> 0) % groups.length]
}
