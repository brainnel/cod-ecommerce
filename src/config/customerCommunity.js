// Active invites from the 2026-10-28 workbook. Remove full groups from this pool.
// Temporarily paused on 2026-10-29: VIP 7, 14, 18, 21, 22, 24, 27, 28.
// Restore only after the owner confirms recovery; original invites remain in Git history.
export const WHATSAPP_CUSTOMER_GROUPS = [
  { id: 'vip-6', url: 'https://chat.whatsapp.com/G7CKqkn92AfGbU6kVh2MXD' },
  { id: 'vip-8', url: 'https://chat.whatsapp.com/FGnkyIcWtxG7lrMDsPRnC4' },
  { id: 'vip-9', url: 'https://chat.whatsapp.com/GBqC7svSbSy7JrHzFnQ4h0' },
  { id: 'vip-10', url: 'https://chat.whatsapp.com/G3XB2CBwxK8Is1eb5YhChR' },
  { id: 'vip-11', url: 'https://chat.whatsapp.com/H7Iab2YCFvACLMNdofjlFs' },
  { id: 'vip-12', url: 'https://chat.whatsapp.com/KDdA3JctISRLDrKWD9ttDl' },
  { id: 'vip-13', url: 'https://chat.whatsapp.com/CYfyXzZxCWr0WaKXu2LpA4' },
  { id: 'vip-15', url: 'https://chat.whatsapp.com/Hys5iZTQKBv9fssdixSAGC' },
  { id: 'vip-16', url: 'https://chat.whatsapp.com/HZr6qMh6sJF8H6NnFbTv0F' },
  { id: 'vip-17', url: 'https://chat.whatsapp.com/JFy4BbQmacg09xJP8k4oCB' },
  { id: 'vip-19', url: 'https://chat.whatsapp.com/CkbMOME6ywF5e2UHmm9uNW' },
  { id: 'vip-20', url: 'https://chat.whatsapp.com/H7lUYB9A063HI4KwCKlU8s' },
  { id: 'vip-23', url: 'https://chat.whatsapp.com/ICJd1IZM4AN9ubRwoqHYqW' },
  { id: 'vip-25', url: 'https://chat.whatsapp.com/ImADRrB9o6a9YqL4on0GbU' },
  { id: 'vip-26', url: 'https://chat.whatsapp.com/K0Hp90WX0JL9e1Z3zPkwaq' },
  { id: 'vip-29', url: 'https://chat.whatsapp.com/E2bJ2SyBq9pKNPjozPkWAZ' },
  { id: 'vip-30', url: 'https://chat.whatsapp.com/EP3ge4cbTwkFArsJasqBhc' },
  { id: 'vip-31', url: 'https://chat.whatsapp.com/K4jJ3bsWfFk03u8L0jYrgi' },
  { id: 'vip-32', url: 'https://chat.whatsapp.com/FNa3m4YhOGE5eIDzTgVbOI' },
]

export const WHATSAPP_GROUP_CLICK_EVENT = 'order_success_whatsapp_group_click'

export const getWhatsAppCustomerGroup = ({ phone, orderId } = {}) => {
  let normalizedPhone = String(phone || '').replace(/\D/g, '')
  if (normalizedPhone.length === 15 && normalizedPhone.startsWith('00225')) {
    normalizedPhone = normalizedPhone.slice(5)
  } else if (normalizedPhone.length === 13 && normalizedPhone.startsWith('225')) {
    normalizedPhone = normalizedPhone.slice(3)
  }

  // Stable across refreshes, repeat orders and our two domains. The phone is only
  // used locally; it is never added to an invite URL or the click event.
  const key = normalizedPhone ? `phone:${normalizedPhone}` : `order:${orderId || 'unknown'}`
  let hash = 2166136261
  for (let i = 0; i < key.length; i += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619)
  }
  return WHATSAPP_CUSTOMER_GROUPS[(hash >>> 0) % WHATSAPP_CUSTOMER_GROUPS.length]
}
