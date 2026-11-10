// Where the BabiDrama card sits in the customer's window, for our own
// analytics: is the link under the player on screen without scrolling, and was
// a tap on it a real one? The share of customers who tap « Continuer » ranges
// from 2 % to 45 % between in-app browsers and nothing recorded said why.
// Pure: the card passes what it measured.

const whole = (value) => (Number.isFinite(value) ? Math.round(value) : null)

// rects: { top, bottom } in viewport pixels (getBoundingClientRect), or null.
export const describePlacement = ({ viewportWidth, viewportHeight, scrollY, cardRect, ctaRect, sinceLoadMs, sinceCardMs } = {}) => {
  const vh = whole(viewportHeight)
  const visible = (rect) => (rect && vh !== null && Number.isFinite(rect.top) && Number.isFinite(rect.bottom)
    ? rect.bottom > 0 && rect.top < vh
    : null)
  return {
    vw: whole(viewportWidth),
    vh,
    scroll_y: whole(scrollY),
    card_top: cardRect ? whole(cardRect.top) : null,
    card_visible: visible(cardRect),
    // null = this version shows no link at that moment.
    cta_top: ctaRect ? whole(ctaRect.top) : null,
    cta_visible: visible(ctaRect),
    // Since the site's document loaded: the shop is one page, so this covers
    // the whole visit, ordering included.
    since_load_ms: whole(sinceLoadMs),
    // Since the card appeared on the confirmation page.
    since_card_ms: whole(sinceCardMs),
  }
}

// The last tap inside the card: a script cannot fake `trusted`, and `on` tells
// a tap on a link from one that only bubbled through the card.
export const describeTap = (tap, nowMs) => {
  if (!tap) return { tap_trusted: null, tap_on: null, tap_age_ms: null }
  return {
    tap_trusted: tap.trusted === true,
    tap_on: ['cta', 'next', 'thumbnail', 'video', 'other'].includes(tap.on) ? tap.on : 'other',
    tap_age_ms: Number.isFinite(nowMs) && Number.isFinite(tap.at) ? Math.max(0, Math.round(nowMs - tap.at)) : null,
  }
}

// True when `key` was already marked in this browser session, and marks it.
// A customer who opens BabiDrama in the same window and comes Back reloads the
// order page (9 % of orders showed the card twice or more): what is counted per
// order must not count that reload again. Without session storage (private
// mode, blocked) nothing is remembered and every load counts, as before.
export const seenInSession = (key, storage) => {
  try {
    const store = storage === undefined ? globalThis.sessionStorage : storage
    if (!store) return false
    const name = `bd-drama:${key}`
    if (store.getItem(name)) return true
    store.setItem(name, '1')
    return false
  } catch {
    return false
  }
}

// Which part of the card an element belongs to.
export const tapTarget = (element) => {
  const closest = (selector) => Boolean(element && typeof element.closest === 'function' && element.closest(selector))
  if (closest('.os-drama-cta')) return 'cta'
  if (closest('.os-drama-next')) return 'next'
  if (closest('.os-drama-thumb')) return 'thumbnail'
  if (closest('.os-drama-stage')) return 'video'
  return 'other'
}
