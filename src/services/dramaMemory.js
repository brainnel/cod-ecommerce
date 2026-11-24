// What this device already saw of BabiDrama on its order pages, kept in
// localStorage, so that a returning customer goes on with the series they were
// watching and is not shown again a series they left.
// Measured 2026-11-08…15: 23.5 % of order pages came from a device that had
// seen the card in the 8 days before, a third of those with the same series on
// the big card again; episode 1 was then finished on 4.0 % of them (30 of 755)
// against 5.2 % with another series, although the series shown twice were the
// ones watched most elsewhere. A customer who had finished episodes was shown
// episode 1 once more.
// Pure functions over a plain object, plus the two storage accessors: nothing
// here throws, and without storage the card behaves as it did before.

import { DRAMA_MAX_SERIES, normalizeSeries } from './dramaPicks.js'
import { DRAMA_INLINE_MAX_EPISODE } from './dramaEpisode.js'

export const DRAMA_MEMORY_KEY = 'bd-drama-memory-v1'
// A series is remembered this long after it was last on the big card…
export const DRAMA_MEMORY_DAYS = 30
// …and offered again where the customer stopped for this long.
export const DRAMA_RESUME_DAYS = 14
export const DRAMA_MEMORY_MAX = 30
const DAY_MS = 24 * 60 * 60 * 1000

const wholeNumber = (value, max) => (Number.isInteger(value) && value >= 0 ? Math.min(value, max) : 0)

// One remembered series, or null when it is malformed or too old:
// { at, order, shown, ep, done, series }
//   at:     when it was last on the big card, or last watched (ms);
//   order:  the order page it was last shown on;
//   shown:  on how many order pages it was the big card;
//   ep:     the last episode finished in the card (0 = none);
//   done:   nothing left to offer here: the free episodes were watched, or the
//           customer went to BabiDrama for it;
//   series: what the card needs to show it again when the picks of the moment
//           do not carry it (the same order page loaded a minute later, or
//           another product's order).
const normalizeEntry = (value, now) => {
  if (!value || typeof value !== 'object') return null
  const at = Number(value.at)
  if (!Number.isFinite(at) || at > now + DAY_MS || now - at > DRAMA_MEMORY_DAYS * DAY_MS) return null
  return {
    at,
    order: typeof value.order === 'string' ? value.order.slice(0, 64) : '',
    shown: wholeNumber(value.shown, 999),
    ep: wholeNumber(value.ep, DRAMA_INLINE_MAX_EPISODE),
    done: value.done === true,
    series: normalizeSeries(value.series),
  }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// { [slug]: entry } from what was stored, most recent entries only. Anything
// unreadable is an empty memory.
export const parseDramaMemory = (text, now = Date.now()) => {
  try {
    const raw = typeof text === 'string' && text ? JSON.parse(text) : null
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const entries = []
    for (const [slug, value] of Object.entries(raw)) {
      if (typeof slug !== 'string' || slug.length > 120 || !SLUG.test(slug)) continue
      const entry = normalizeEntry(value, now)
      if (!entry) continue
      // A snapshot of another series is not this one's.
      if (entry.series && entry.series.slug !== slug) entry.series = null
      entries.push([slug, entry])
    }
    entries.sort((a, b) => b[1].at - a[1].at)
    return Object.fromEntries(entries.slice(0, DRAMA_MEMORY_MAX))
  } catch {
    return {}
  }
}

const storageOf = (storage) => {
  try {
    return storage === undefined ? globalThis.localStorage : storage
  } catch {
    return null
  }
}

export const readDramaMemory = ({ storage, now = Date.now() } = {}) => {
  try {
    const store = storageOf(storage)
    return store ? parseDramaMemory(store.getItem(DRAMA_MEMORY_KEY), now) : {}
  } catch {
    return {}
  }
}

// Reads what is stored now, applies `change` (memory → memory) and stores the
// result: two tabs each keep what the other wrote. Returns the new memory.
export const updateDramaMemory = (change, { storage, now = Date.now() } = {}) => {
  try {
    const store = storageOf(storage)
    const next = parseDramaMemory(JSON.stringify(change(readDramaMemory({ storage: store, now }))), now)
    if (store) store.setItem(DRAMA_MEMORY_KEY, JSON.stringify(next))
    return next
  } catch {
    return {}
  }
}

const entryOf = (memory, slug) => memory?.[slug] || { at: 0, order: '', shown: 0, ep: 0, done: false, series: null }

// The series was the big card of this order page. A reload of the same page is
// not another time.
export const rememberShown = (memory, series, { order = '', now = Date.now() } = {}) => {
  if (!series?.slug) return memory || {}
  const entry = entryOf(memory, series.slug)
  const sameOrder = Boolean(order) && entry.order === String(order)
  return {
    ...memory,
    [series.slug]: {
      ...entry,
      at: now,
      order: String(order || ''),
      shown: entry.shown + (sameOrder ? 0 : 1),
      series,
    },
  }
}

// An episode was watched to its end in the card.
export const rememberEpisode = (memory, series, episode, { now = Date.now() } = {}) => {
  if (!series?.slug || !Number.isInteger(episode) || episode < 1) return memory || {}
  const entry = entryOf(memory, series.slug)
  const ep = Math.min(Math.max(entry.ep, episode), DRAMA_INLINE_MAX_EPISODE)
  return {
    ...memory,
    [series.slug]: {
      ...entry,
      at: now,
      ep,
      done: entry.done || (Number.isInteger(series.freeEpisodes) && ep >= series.freeEpisodes),
      series,
    },
  }
}

// Nothing left to offer here: the customer went to BabiDrama for the series, or
// the episode it would go on with cannot be played.
export const rememberDone = (memory, series, { now = Date.now() } = {}) => {
  if (!series?.slug) return memory || {}
  const entry = entryOf(memory, series.slug)
  return { ...memory, [series.slug]: { ...entry, at: entry.at || now, done: true } }
}

// The episode the card goes on with for a remembered series, or null: the one
// after the last finished, while free episodes are left and the customer was
// here recently.
export const resumeEpisode = (entry, series, now = Date.now()) => {
  if (!entry || entry.done || entry.ep < 1) return null
  if (now - entry.at > DRAMA_RESUME_DAYS * DAY_MS) return null
  const next = entry.ep + 1
  if (next > DRAMA_INLINE_MAX_EPISODE) return null
  if (Number.isInteger(series?.freeEpisodes) && next > series.freeEpisodes) return null
  return next
}

// The picks as this device should see them: { series, startEpisode, reason }.
// `series[0]` is the big card, played from `startEpisode`; the others keep
// BabiDrama's order. In order:
//   same_order: the page of an order shown before (a reload, Back from
//               BabiDrama) keeps its series, and goes on where it stopped;
//   resume:     the series the customer was watching most recently, at the
//               episode after the last one finished, even when this product's
//               picks do not carry it (`resume` false = the card version sends
//               the customer to BabiDrama after episode 1: nothing to go on
//               with here);
//   first:      BabiDrama's first pick, which the device has not seen;
//   fresh:      its first pick the device has not had on the big card;
//   all_seen:   every pick was seen: the one seen longest ago.
export const arrangeForDevice = (picks, memory, { order = '', now = Date.now(), resume = true } = {}) => {
  const list = Array.isArray(picks) ? picks.filter((series) => series?.slug) : []
  if (!list.length) return { series: [], startEpisode: 1, reason: 'first' }
  const known = memory && typeof memory === 'object' ? memory : {}
  const lead = (series, startEpisode, reason) => ({
    series: [series, ...list.filter((other) => other.slug !== series.slug)].slice(0, DRAMA_MAX_SERIES),
    startEpisode,
    reason,
  })
  const remembered = Object.entries(known)
    .map(([slug, entry]) => ({ entry, series: list.find((item) => item.slug === slug) || entry.series }))
    .filter((item) => item.series)
    .sort((a, b) => b.entry.at - a.entry.at)
  const next = (item) => (resume ? resumeEpisode(item.entry, item.series, now) : null)

  if (order) {
    const same = remembered.find((item) => item.entry.order === String(order) && !item.entry.done)
    if (same) return lead(same.series, next(same) || 1, 'same_order')
  }
  const watching = remembered.find((item) => next(item) !== null)
  if (watching) return lead(watching.series, next(watching), 'resume')
  const unseen = list.find((series) => !known[series.slug])
  if (unseen) return lead(unseen, 1, unseen === list[0] ? 'first' : 'fresh')
  const oldest = [...list].sort((a, b) => (
    Number(known[a.slug].done) - Number(known[b.slug].done) || known[a.slug].at - known[b.slug].at
  ))[0]
  return lead(oldest, 1, 'all_seen')
}
