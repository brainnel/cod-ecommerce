// Black Friday 2026 (owner, 2026-11-22): the stored price already is the Black Friday price,
// 30 % below the usual one. Until the offer ends, the product page shows the usual price struck
// through, the amount saved in FCFA (the owner wants the amount, not the percentage) and the
// time left. After `endsAt` the page shows the plain price again by itself; the stored price is
// not changed by this file.
export const BLACK_FRIDAY = Object.freeze({
  id: 'bf2026',
  discountPercent: 30,
  // 30 November 2026, 23:59:59 in Abidjan (UTC+0).
  endsAt: Date.UTC(2026, 10, 30, 23, 59, 59)
})

const USUAL_PRICE_STEP = 100
const SECOND_MS = 1000
// The offer runs for 9 days. A longer countdown means the device clock is wrong.
const MAX_COUNTDOWN_MS = 10 * 24 * 60 * 60 * SECOND_MS

// Usual price = current price ÷ 0.7, to the nearest 100 FCFA (10 000 → 14 300).
// Returns null once the offer is over or when the price is not a positive amount.
export const getBlackFridayOffer = (price, now = Date.now()) => {
  if (!['number', 'string'].includes(typeof price) || String(price).trim() === '') return null
  const amount = Number(price)
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (!Number.isFinite(now) || now >= BLACK_FRIDAY.endsAt) return null
  const usualPrice = Math.round(amount / (1 - BLACK_FRIDAY.discountPercent / 100) / USUAL_PRICE_STEP) * USUAL_PRICE_STEP
  if (!(usualPrice > amount)) return null
  return {
    id: BLACK_FRIDAY.id,
    price: amount,
    usualPrice,
    saving: usualPrice - amount,
    endsAt: BLACK_FRIDAY.endsAt
  }
}

// Days, hours, minutes and seconds left, or null when nothing should be shown.
export const getBlackFridayTimeLeft = (endsAt, now = Date.now()) => {
  const remaining = endsAt - now
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > MAX_COUNTDOWN_MS) return null
  const totalSeconds = Math.floor(remaining / SECOND_MS)
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60
  }
}
