import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { describePlacement, describeTap, seenInSession, tapTarget } from '../src/services/dramaPlacement.js'

test('placement: where the card and its link sit in the window', () => {
  assert.deepEqual(describePlacement({
    viewportWidth: 360, viewportHeight: 667.4, scrollY: 12.6,
    cardRect: { top: 410.2, bottom: 1100 }, ctaRect: { top: 930, bottom: 978 }, sinceLoadMs: 91834.7, sinceCardMs: 7420.2,
  }), { vw: 360, vh: 667, scroll_y: 13, card_top: 410, card_visible: true, cta_top: 930, cta_visible: false, since_load_ms: 91835, since_card_ms: 7420 })
  // The link on screen; the card scrolled past the top is no longer visible.
  assert.equal(describePlacement({ viewportHeight: 700, cardRect: { top: 80, bottom: 640 }, ctaRect: { top: 560, bottom: 608 } }).cta_visible, true)
  assert.equal(describePlacement({ viewportHeight: 700, cardRect: { top: -900, bottom: -20 }, ctaRect: null }).card_visible, false)
  // Versions c and d show no link while the episode plays.
  const noLink = describePlacement({ viewportWidth: 393, viewportHeight: 760, scrollY: 0, cardRect: { top: 300, bottom: 900 }, ctaRect: null, sinceLoadMs: 900 })
  assert.equal(noLink.cta_top, null)
  assert.equal(noLink.cta_visible, null)
  // Nothing measured: every field is null, never NaN.
  assert.deepEqual(describePlacement(), { vw: null, vh: null, scroll_y: null, card_top: null, card_visible: null, cta_top: null, cta_visible: null, since_load_ms: null, since_card_ms: null })
  assert.deepEqual(describePlacement({ viewportWidth: NaN, viewportHeight: undefined, cardRect: { top: NaN, bottom: 5 } }).card_visible, null)
})

test('tap: a real tap on the link, a stray one, or none', () => {
  assert.deepEqual(describeTap({ trusted: true, on: 'cta', at: 1000 }, 1012.4), { tap_trusted: true, tap_on: 'cta', tap_age_ms: 12 })
  assert.deepEqual(describeTap({ trusted: false, on: 'weird', at: 5000 }, 4000), { tap_trusted: false, tap_on: 'other', tap_age_ms: 0 })
  assert.deepEqual(describeTap(null, 10), { tap_trusted: null, tap_on: null, tap_age_ms: null })
  const inside = (selector) => ({ closest: (asked) => (asked === selector ? {} : null) })
  assert.equal(tapTarget(inside('.os-drama-cta')), 'cta')
  assert.equal(tapTarget(inside('.os-drama-next')), 'next')
  assert.equal(tapTarget(inside('.os-drama-thumb')), 'thumbnail')
  assert.equal(tapTarget(inside('.os-drama-stage')), 'video')
  assert.equal(tapTarget(inside('.os-drama-head')), 'other')
  assert.equal(tapTarget(null), 'other')
})

test('the card measures for our analytics only, and a measuring failure cannot stop a link', () => {
  const card = readFileSync(new URL('../src/components/DramaPicksCard.jsx', import.meta.url), 'utf8')
  assert.match(card, /<section ref=\{rootRef\} className="os-drama"[^>]*onClickCapture=\{noteTap\}>/)
  assert.match(card, /const placement = \(\) => \{\s+try \{[\s\S]*?\} catch \{\s+return \{\}\s+\}\s+\}/)
  assert.match(card, /'order_success_drama_open', series, slot, \{\s+source, seconds_watched: secondsWatched, position_s: positionS, \.\.\.placement\(\), \.\.\.tapInfo\(\),/)
  assert.match(card, /'order_success_drama_play', series, slot, \{ sound, trigger, repeat, \.\.\.placement\(\) \}/)
  // Nothing measured goes to BabiDrama: its events keep their own small shape.
  assert.doesNotMatch(card, /emitEvents\([^)]*placement/)
})

test('once per browser session: a reload after Back from BabiDrama is not another display', () => {
  const data = new Map()
  const storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) }
  assert.equal(seenInSession('display|830827813382|FL-1', storage), false)
  assert.equal(seenInSession('display|830827813382|FL-1', storage), true)
  // Another order, or another thing counted for the same order, is its own.
  assert.equal(seenInSession('display|830827813382|FL-2', storage), false)
  assert.equal(seenInSession('play|830827813382|FL-1|le-mari', storage), false)
  assert.deepEqual([...data.keys()], ['bd-drama:display|830827813382|FL-1', 'bd-drama:display|830827813382|FL-2', 'bd-drama:play|830827813382|FL-1|le-mari'])
  // No storage, or one that throws (private mode): nothing is remembered and nothing breaks.
  assert.equal(seenInSession('x', null), false)
  assert.equal(seenInSession('x', null), false)
  const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  assert.equal(seenInSession('x', broken), false)
  const full = { getItem: () => null, setItem: () => { throw new Error('quota') } }
  assert.equal(seenInSession('x', full), false)
})

test('the card reports a display, an inline start and a finished episode to BabiDrama once per session', () => {
  const card = readFileSync(new URL('../src/components/DramaPicksCard.jsx', import.meta.url), 'utf8')
  assert.match(card, /const repeat = seenInSession\(`display\|\$\{key\}`\)\s+if \(!repeat\) \{\s+safely\(\(\) => emitEvents\(pid, slugs\.map/)
  assert.match(card, /const repeat = seenInSession\(`play\|\$\{pid\}\|\$\{impressionKey\}`\)\s+if \(!repeat\) safely\(\(\) => emitEvents\(pid, \[\{ type: 'play'/)
  assert.match(card, /if \(!seenInSession\(`complete\|\$\{key\}`\)\) \{\s+safely\(\(\) => emitEvents\(pid, \[\{ type: 'complete'/)
  // Our own analytics keep every page view, marked.
  assert.match(card, /'order_success_drama_impression', \{\s+pid, series: slugs\.join\(','\), series_count: slugs\.length, mode: picks\.mode, variant, repeat, \.\.\.placement\(\),/)
  // An open is an action of its own: never deduplicated.
  assert.doesNotMatch(card, /seenInSession\(`open/)
})

test('the card times its events from when it appeared, not only from the site load', () => {
  const card = readFileSync(new URL('../src/components/DramaPicksCard.jsx', import.meta.url), 'utf8')
  // The shop is a single page: performance.now() alone counts the whole visit, ordering included.
  assert.match(card, /if \(shownAt\.current === null\) shownAt\.current = now/)
  assert.match(card, /sinceLoadMs: now,\s+sinceCardMs: now - shownAt\.current,/)
})
