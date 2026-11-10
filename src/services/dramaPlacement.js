// Where the BabiDrama card sits in the customer's window, for our own
// analytics: is the link under the player on screen without scrolling, and was
// a tap on it a real one? The share of customers who tap « Continuer » ranges
// from 2 % to 45 % between in-app browsers and nothing recorded said why.
// Pure: the card passes what it measured.

const whole = (value) => (Number.isFinite(value) ? Math.round(value) : null)

// rects: { top, bottom } in viewport pixels (getBoundingClientRect), or null.
export const describePlacement = ({ viewportWidth, viewportHeight, scrollY, cardRect, ctaRect, stageHeight, sinceLoadMs, sinceCardMs } = {}) => {
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
    // Height of the player's stage (0 when hidden): tells a window whose CSS
    // `vh` is off from the others.
    stage_h: whole(stageHeight),
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

// Height the player's stage should have: 62 % of the window, between 280 and
// 560 px (the stylesheet's `62vh` with its limits). CSS `vh` is not the
// window's height everywhere: in the bare Android web view that two thirds of
// customers use it was smaller, so the stage sat at its 280 px minimum (a
// 157 px wide video) with the link to BabiDrama right under it on the first
// screen, where 45 % tapped it; in Facebook's own browser the stage was right,
// the link below the fold, and 2 % did. Returns the height to force in pixels,
// or null when the stylesheet's height is close enough (within 40 px) or
// nothing can be measured.
export const stageHeightFix = (windowHeight, actualHeight) => {
  if (!Number.isFinite(windowHeight) || !Number.isFinite(actualHeight) || windowHeight <= 0 || actualHeight <= 0) return null
  const wanted = Math.min(560, Math.max(280, Math.round(windowHeight * 0.62)))
  return wanted - actualHeight > 40 ? wanted : null
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
