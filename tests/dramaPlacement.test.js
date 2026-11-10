import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { describePlacement, describeTap, tapTarget } from '../src/services/dramaPlacement.js'

test('placement: where the card and its link sit in the window', () => {
  assert.deepEqual(describePlacement({
    viewportWidth: 360, viewportHeight: 667.4, scrollY: 12.6,
    cardRect: { top: 410.2, bottom: 1100 }, ctaRect: { top: 930, bottom: 978 }, sinceLoadMs: 1834.7,
  }), { vw: 360, vh: 667, scroll_y: 13, card_top: 410, card_visible: true, cta_top: 930, cta_visible: false, since_load_ms: 1835 })
  // The link on screen; the card scrolled past the top is no longer visible.
  assert.equal(describePlacement({ viewportHeight: 700, cardRect: { top: 80, bottom: 640 }, ctaRect: { top: 560, bottom: 608 } }).cta_visible, true)
  assert.equal(describePlacement({ viewportHeight: 700, cardRect: { top: -900, bottom: -20 }, ctaRect: null }).card_visible, false)
  // Versions c and d show no link while the episode plays.
  const noLink = describePlacement({ viewportWidth: 393, viewportHeight: 760, scrollY: 0, cardRect: { top: 300, bottom: 900 }, ctaRect: null, sinceLoadMs: 900 })
  assert.equal(noLink.cta_top, null)
  assert.equal(noLink.cta_visible, null)
  // Nothing measured: every field is null, never NaN.
  assert.deepEqual(describePlacement(), { vw: null, vh: null, scroll_y: null, card_top: null, card_visible: null, cta_top: null, cta_visible: null, since_load_ms: null })
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
  assert.match(card, /'order_success_drama_play', series, slot, \{ sound, trigger, \.\.\.placement\(\) \}/)
  // Nothing measured goes to BabiDrama: its events keep their own small shape.
  assert.doesNotMatch(card, /emitEvents\([^)]*placement/)
})
