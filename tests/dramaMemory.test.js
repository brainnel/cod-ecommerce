import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DRAMA_MEMORY_DAYS,
  DRAMA_MEMORY_KEY,
  DRAMA_MEMORY_MAX,
  DRAMA_RESUME_DAYS,
  arrangeForDevice,
  parseDramaMemory,
  readDramaMemory,
  rememberDone,
  rememberEpisode,
  rememberShown,
  resumeEpisode,
  updateDramaMemory,
} from '../src/services/dramaMemory.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 16, 12)
const series = (slug, extra = {}) => ({
  slug, title: `Titre ${slug}`, genres: ['Romance'], episodeCount: 73, freeEpisodes: 8, hook: 'Accroche',
  coverUrl: `https://img.babidrama.com/i/${slug}/cover-x.webp`, watchUrl: `https://babidrama.com/w/${slug}/1?c=brainnel`,
  ...extra,
})
const picks = ['a', 'b', 'c', 'd', 'e'].map((slug) => series(slug))
const slugs = (arranged) => arranged.series.map((item) => item.slug)
const entry = (extra = {}) => ({ at: NOW - DAY, order: 'FL-1', shown: 1, ep: 0, done: false, series: null, ...extra })

// localStorage with only what the module uses.
const fakeStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)) },
    data,
  }
}

test('a device that remembers nothing sees the picks as BabiDrama sent them', () => {
  for (const memory of [{}, null, undefined, 'nope']) {
    const arranged = arrangeForDevice(picks, memory, { order: 'FL-2', now: NOW })
    assert.deepEqual(slugs(arranged), ['a', 'b', 'c', 'd', 'e'])
    assert.equal(arranged.startEpisode, 1)
    assert.equal(arranged.reason, 'first')
  }
  assert.deepEqual(arrangeForDevice([], {}, { now: NOW }), { series: [], startEpisode: 1, reason: 'first' })
  assert.deepEqual(arrangeForDevice(null, {}, { now: NOW }).series, [])
})

test('a series the device already had on the big card gives way to the next one', () => {
  const memory = { a: entry(), b: entry({ at: NOW - 3 * DAY }) }
  const arranged = arrangeForDevice(picks, memory, { order: 'FL-2', now: NOW })
  // The others keep BabiDrama's order.
  assert.deepEqual(slugs(arranged), ['c', 'a', 'b', 'd', 'e'])
  assert.equal(arranged.startEpisode, 1)
  assert.equal(arranged.reason, 'fresh')
})

test('when every pick was seen, the one seen longest ago comes back; finished ones last', () => {
  const memory = {
    a: entry({ at: NOW - 1 * DAY }),
    b: entry({ at: NOW - 9 * DAY, done: true }),
    c: entry({ at: NOW - 5 * DAY }),
    d: entry({ at: NOW - 2 * DAY }),
    e: entry({ at: NOW - 3 * DAY }),
  }
  const arranged = arrangeForDevice(picks, memory, { order: 'FL-2', now: NOW })
  assert.deepEqual(slugs(arranged), ['c', 'a', 'b', 'd', 'e'])
  assert.equal(arranged.reason, 'all_seen')
  const allDone = Object.fromEntries(Object.entries(memory).map(([slug, item]) => [slug, { ...item, done: true }]))
  assert.equal(slugs(arrangeForDevice(picks, allDone, { order: 'FL-2', now: NOW }))[0], 'b')
})

test('the series the customer was watching goes on at the next episode', () => {
  const memory = { b: entry({ ep: 3, series: series('b') }), a: entry({ at: NOW - 2 * DAY }) }
  const arranged = arrangeForDevice(picks, memory, { order: 'FL-2', now: NOW })
  assert.deepEqual(slugs(arranged), ['b', 'a', 'c', 'd', 'e'])
  assert.equal(arranged.startEpisode, 4)
  assert.equal(arranged.reason, 'resume')
  // The most recently watched of two.
  const two = { b: entry({ ep: 3, at: NOW - 4 * DAY }), d: entry({ ep: 1, at: NOW - DAY }) }
  const latest = arrangeForDevice(picks, two, { order: 'FL-2', now: NOW })
  assert.equal(latest.series[0].slug, 'd')
  assert.equal(latest.startEpisode, 2)
})

test('it goes on even when this product\'s picks do not carry the series', () => {
  const memory = { z: entry({ ep: 5, series: series('z') }) }
  const arranged = arrangeForDevice(picks, memory, { order: 'FL-2', now: NOW })
  // Five series at most: BabiDrama's last pick leaves.
  assert.deepEqual(slugs(arranged), ['z', 'a', 'b', 'c', 'd'])
  assert.equal(arranged.startEpisode, 6)
  // Without what the card needs to show it, there is nothing to go on with.
  const bare = arrangeForDevice(picks, { z: entry({ ep: 5 }) }, { order: 'FL-2', now: NOW })
  assert.deepEqual(slugs(bare), ['a', 'b', 'c', 'd', 'e'])
  assert.equal(bare.reason, 'first')
})

test('nothing to go on with: free episodes all watched, too long ago, or a version that hands over after episode 1', () => {
  const none = (item, options = {}) => arrangeForDevice(picks, { a: item }, { order: 'FL-2', now: NOW, ...options })
  // The last free episode (8) was finished: the series is seen, the next one plays.
  const finished = none(entry({ ep: 8 }))
  assert.equal(finished.series[0].slug, 'b')
  assert.equal(finished.startEpisode, 1)
  assert.equal(none(entry({ ep: 3, done: true })).series[0].slug, 'b')
  assert.equal(none(entry({ ep: 3, at: NOW - (DRAMA_RESUME_DAYS + 1) * DAY })).series[0].slug, 'b')
  const handsOver = none(entry({ ep: 1 }), { resume: false })
  assert.equal(handsOver.series[0].slug, 'b')
  assert.equal(handsOver.startEpisode, 1)
  // Still recent enough, one free episode left.
  const last = none(entry({ ep: 7, at: NOW - (DRAMA_RESUME_DAYS - 1) * DAY }))
  assert.equal(last.series[0].slug, 'a')
  assert.equal(last.startEpisode, 8)
  assert.equal(resumeEpisode(entry({ ep: 30 }), series('a', { freeEpisodes: null }), NOW), null)
  assert.equal(resumeEpisode(entry({ ep: 2 }), series('a', { freeEpisodes: null }), NOW), 3)
  assert.equal(resumeEpisode(null, series('a'), NOW), null)
})

test('the page of an order shown before keeps its series, and goes on where it stopped', () => {
  // A reload (Back from BabiDrama) while BabiDrama now answers another order.
  const memory = { c: entry({ order: 'FL-2', at: NOW - 60000 }), a: entry() }
  const again = arrangeForDevice(picks, memory, { order: 'FL-2', now: NOW })
  assert.deepEqual(slugs(again), ['c', 'a', 'b', 'd', 'e'])
  assert.equal(again.startEpisode, 1)
  assert.equal(again.reason, 'same_order')
  const watched = arrangeForDevice(picks, { c: entry({ order: 'FL-2', ep: 2 }) }, { order: 'FL-2', now: NOW })
  assert.equal(watched.startEpisode, 3)
  assert.equal(watched.reason, 'same_order')
  // The customer went to BabiDrama for it (the paywall): the page comes back with another one.
  const left = arrangeForDevice(picks, { a: entry({ order: 'FL-2', ep: 8, done: true }) }, { order: 'FL-2', now: NOW })
  assert.equal(left.series[0].slug, 'b')
  assert.equal(left.reason, 'fresh')
  // Without an order number nothing is "the same page".
  assert.equal(arrangeForDevice(picks, { c: entry({ order: '' }) }, { order: '', now: NOW }).series[0].slug, 'a')
  // A minute later BabiDrama answers five other series: the page still keeps the one it showed.
  const moved = arrangeForDevice(picks, { z: entry({ order: 'FL-2', series: series('z') }) }, { order: 'FL-2', now: NOW })
  assert.deepEqual(slugs(moved), ['z', 'a', 'b', 'c', 'd'])
  assert.equal(moved.reason, 'same_order')
  // On another order, a series seen but not watched is not brought back from memory.
  const other = arrangeForDevice(picks, { z: entry({ order: 'FL-1', series: series('z') }) }, { order: 'FL-2', now: NOW })
  assert.deepEqual(slugs(other), ['a', 'b', 'c', 'd', 'e'])
  assert.equal(other.reason, 'first')
})

test('what is remembered: shown per order page, the last episode finished, done', () => {
  let memory = rememberShown({}, series('a'), { order: 'FL-1', now: NOW })
  // With what the card needs to show it again when the picks of the moment do not carry it.
  assert.deepEqual(memory.a, { at: NOW, order: 'FL-1', shown: 1, ep: 0, done: false, series: series('a') })
  // A reload of the same page is not another time.
  memory = rememberShown(memory, series('a'), { order: 'FL-1', now: NOW + 5000 })
  assert.equal(memory.a.shown, 1)
  assert.equal(memory.a.at, NOW + 5000)
  memory = rememberShown(memory, series('a'), { order: 'FL-9', now: NOW + DAY })
  assert.equal(memory.a.shown, 2)
  assert.equal(memory.a.order, 'FL-9')

  memory = rememberEpisode(memory, series('a'), 2, { now: NOW + DAY + 1000 })
  assert.equal(memory.a.ep, 2)
  assert.equal(memory.a.done, false)
  assert.equal(memory.a.series.slug, 'a')
  // Never backwards (« Revoir » of an earlier episode).
  assert.equal(rememberEpisode(memory, series('a'), 1, { now: NOW }).a.ep, 2)
  // The last free episode: nothing left to offer here.
  assert.equal(rememberEpisode(memory, series('a'), 8, { now: NOW }).a.done, true)
  assert.equal(rememberEpisode(memory, series('a', { freeEpisodes: null }), 8, { now: NOW }).a.done, false)
  assert.equal(rememberDone(memory, series('a'), { now: NOW }).a.done, true)
  // A series opened from its thumbnail is done without ever having been the big card.
  assert.deepEqual(rememberDone({}, series('t'), { now: NOW }).t, { at: NOW, order: '', shown: 0, ep: 0, done: true, series: null })
  // Malformed calls change nothing.
  assert.deepEqual(rememberShown(memory, null, { now: NOW }), memory)
  assert.deepEqual(rememberEpisode(memory, series('a'), 0, { now: NOW }), memory)
  assert.deepEqual(rememberEpisode(memory, series('a'), 1.5, { now: NOW }), memory)
  assert.deepEqual(rememberDone(undefined, null), {})
})

test('storage: only well-formed, recent entries survive, the most recent ones first', () => {
  const stored = JSON.stringify({
    a: { at: NOW - DAY, order: 'FL-1', shown: 2, ep: 3, done: false, series: series('a') },
    old: { at: NOW - (DRAMA_MEMORY_DAYS + 1) * DAY, shown: 1 },
    future: { at: NOW + 3 * DAY, shown: 1 },
    'Bad Slug': { at: NOW, shown: 1 },
    junk: 'nope',
    odd: { at: NOW - 2 * DAY, shown: -4, ep: 99, done: 'yes', order: 12, series: { slug: 'odd', title: 'T', watchUrl: 'javascript:alert(1)' } },
    swapped: { at: NOW - 2 * DAY, ep: 1, series: series('a') },
  })
  const memory = parseDramaMemory(stored, NOW)
  assert.deepEqual(Object.keys(memory), ['a', 'odd', 'swapped'])
  assert.equal(memory.a.series.slug, 'a')
  // Numbers are bounded, a link that is not http(s) drops the snapshot, as does another series' snapshot.
  assert.deepEqual(memory.odd, { at: NOW - 2 * DAY, order: '', shown: 0, ep: 30, done: false, series: null })
  assert.equal(memory.swapped.series, null)
  for (const text of ['', null, undefined, 'not json', '[]', '"x"', '42']) assert.deepEqual(parseDramaMemory(text, NOW), {})
  // At most DRAMA_MEMORY_MAX series.
  const many = Object.fromEntries(Array.from({ length: DRAMA_MEMORY_MAX + 5 }, (_, i) => [`s-${i}`, { at: NOW - i * 1000, shown: 1 }]))
  const kept = Object.keys(parseDramaMemory(JSON.stringify(many), NOW))
  assert.equal(kept.length, DRAMA_MEMORY_MAX)
  assert.equal(kept[0], 's-0')
})

test('reading and updating go through storage, and never throw without it', () => {
  const storage = fakeStorage()
  assert.deepEqual(readDramaMemory({ storage, now: NOW }), {})
  updateDramaMemory((memory) => rememberShown(memory, series('a'), { order: 'FL-1', now: NOW }), { storage, now: NOW })
  // Another tab wrote meanwhile: both are kept.
  const other = JSON.parse(storage.data.get(DRAMA_MEMORY_KEY))
  other.b = { at: NOW - 1000, order: 'FL-0', shown: 1, ep: 2, done: false, series: series('b') }
  storage.setItem(DRAMA_MEMORY_KEY, JSON.stringify(other))
  const next = updateDramaMemory((memory) => rememberEpisode(memory, series('a'), 1, { now: NOW + 1 }), { storage, now: NOW + 1 })
  assert.deepEqual(Object.keys(next).sort(), ['a', 'b'])
  assert.equal(readDramaMemory({ storage, now: NOW + 1 }).a.ep, 1)
  assert.equal(readDramaMemory({ storage, now: NOW + 1 }).b.ep, 2)

  const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') } }
  assert.deepEqual(readDramaMemory({ storage: broken, now: NOW }), {})
  assert.deepEqual(updateDramaMemory((memory) => rememberShown(memory, series('a'), { now: NOW }), { storage: broken, now: NOW }), {})
  assert.deepEqual(readDramaMemory({ storage: null, now: NOW }), {})
  assert.doesNotThrow(() => updateDramaMemory(() => { throw new Error('bug') }, { storage, now: NOW }))
  // A full storage keeps what was there.
  const full = fakeStorage({ [DRAMA_MEMORY_KEY]: JSON.stringify({ a: { at: NOW, shown: 1 } }) })
  full.setItem = () => { throw new Error('quota') }
  updateDramaMemory((memory) => rememberShown(memory, series('b'), { now: NOW }), { storage: full, now: NOW })
  assert.deepEqual(Object.keys(readDramaMemory({ storage: full, now: NOW })), ['a'])
})

test('a whole visit: episodes finished on one order, the series goes on at the next order', () => {
  const storage = fakeStorage()
  const write = (change, now) => updateDramaMemory(change, { storage, now })
  // Order 1: BabiDrama's first pick plays; the customer finishes episodes 1 and 2, then leaves.
  const first = arrangeForDevice(picks, readDramaMemory({ storage, now: NOW }), { order: 'FL-1', now: NOW })
  assert.equal(first.series[0].slug, 'a')
  write((memory) => rememberShown(memory, first.series[0], { order: 'FL-1', now: NOW }), NOW)
  write((memory) => rememberEpisode(memory, first.series[0], 1, { now: NOW + 60000 }), NOW + 60000)
  write((memory) => rememberEpisode(memory, first.series[0], 2, { now: NOW + 120000 }), NOW + 120000)
  // Order 2, three days later, another product whose picks do not carry the series.
  const later = NOW + 3 * DAY
  const others = ['m', 'n', 'o', 'p', 'q'].map((slug) => series(slug))
  const second = arrangeForDevice(others, readDramaMemory({ storage, now: later }), { order: 'FL-2', now: later })
  assert.deepEqual(slugs(second), ['a', 'm', 'n', 'o', 'p'])
  assert.equal(second.startEpisode, 3)
  // The free episodes end at 8: the card hands over, and the next order starts another series.
  write((memory) => rememberShown(memory, second.series[0], { order: 'FL-2', now: later }), later)
  write((memory) => rememberEpisode(memory, second.series[0], 8, { now: later + 600000 }), later + 600000)
  write((memory) => rememberDone(memory, second.series[0], { now: later + 600000 }), later + 600000)
  const third = arrangeForDevice(picks, readDramaMemory({ storage, now: later + DAY }), { order: 'FL-3', now: later + DAY })
  assert.deepEqual(slugs(third), ['b', 'a', 'c', 'd', 'e'])
  assert.equal(third.startEpisode, 1)
  assert.equal(third.reason, 'fresh')
})
