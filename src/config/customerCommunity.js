// Active invites refreshed from the 2026-11-03 workbook. Remove full groups from this pool.
// VIP 14 and 28 restored with owner approval on 2026-11-03.
// Still paused: VIP 7, 18, 21, 22, 24, 27.
// Restore only after the owner confirms recovery; original invites remain in Git history.
export const WHATSAPP_CUSTOMER_GROUPS = [
  { id: 'vip-6', url: 'https://chat.whatsapp.com/GQ9QZYGU5flEs89cMGgZbR' },
  { id: 'vip-8', url: 'https://chat.whatsapp.com/KFRHTaa2xXRCfIb6zUJ7DO' },
  { id: 'vip-9', url: 'https://chat.whatsapp.com/DhVmBef4cHKBjMTASXgJih' },
  { id: 'vip-10', url: 'https://chat.whatsapp.com/GECixpFrwyhFZPQhpL8fN6' },
  { id: 'vip-11', url: 'https://chat.whatsapp.com/KdhaTxeQqNc3isDTJv0otu' },
  { id: 'vip-12', url: 'https://chat.whatsapp.com/KHgeQor7H5sEwcXhdTjw6J' },
  { id: 'vip-13', url: 'https://chat.whatsapp.com/EVZ4b4KWATKID7lJWdXLIa' },
  { id: 'vip-14', url: 'https://chat.whatsapp.com/FE3anudbW1R0EfXrT8kbCU' },
  { id: 'vip-15', url: 'https://chat.whatsapp.com/FZ05Ezu0GQbEVlgMTCYQrU' },
  { id: 'vip-16', url: 'https://chat.whatsapp.com/Lbll8XiUvYP0AOjlowGzpt' },
  { id: 'vip-17', url: 'https://chat.whatsapp.com/EwO6DR3u1eFCJCOVonhwpG' },
  { id: 'vip-19', url: 'https://chat.whatsapp.com/Jv4xazim5Sd8F66kajTGGl' },
  { id: 'vip-20', url: 'https://chat.whatsapp.com/EwMuUvP69r8IMOBGLRoc3f' },
  { id: 'vip-23', url: 'https://chat.whatsapp.com/HXem9u10sTf8l8LQ9LzW1k' },
  { id: 'vip-25', url: 'https://chat.whatsapp.com/IvQOCCZEkP4GbNLTd3R1ld' },
  { id: 'vip-26', url: 'https://chat.whatsapp.com/DjjeJQDAstB6a8UkT3Mdai' },
  { id: 'vip-28', url: 'https://chat.whatsapp.com/BZ384nEiPATHA6cPlY03oG' },
  { id: 'vip-29', url: 'https://chat.whatsapp.com/G18xd22mAyo0ylyadLNJCW' },
  { id: 'vip-30', url: 'https://chat.whatsapp.com/DeQFc844fGwHCVUzHmc8Rb' },
  { id: 'vip-31', url: 'https://chat.whatsapp.com/DxvIO3CNo2uFEyOcHGMUdY' },
  { id: 'vip-32', url: 'https://chat.whatsapp.com/G976iLIGILM4Zv9CQxQRm8' },
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
