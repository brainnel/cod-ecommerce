import { Component, useEffect, useMemo, useRef, useState } from 'react'
import { fetchDramaPicks, orderForDisplay, sendDramaEvents, buildEventsBody, dramaLink, dramaVersion, takeWarmPicks } from '../services/dramaPicks'
import { arrangeForDevice, readDramaMemory, rememberDone, rememberEpisode, rememberShown, updateDramaMemory } from '../services/dramaMemory'
import DramaPlayer, { Cover } from './DramaPlayer'
import { probeMedia } from '../services/dramaDiagnostics'
import { describePlacement, describeTap, seenInSession, tapTarget } from '../services/dramaPlacement'
import './DramaPicksCard.css'

// Impressions are sent once per page view per pid+order, even when React
// StrictMode or a remount runs the effect again. Clicks likewise once per
// series (an interaction with the playing card, a thumbnail or a link).
const impressedKeys = new Set()
const clickedKeys = new Set()
const playedKeys = new Set()
const completedKeys = new Set()
const quarterKeys = new Set()
const unavailableKeys = new Set()

// The order already exists when this renders: any failure here must leave the
// rest of the success page untouched, so the card simply disappears.
export class DramaPicksBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) {
    console.warn('drama picks card failed:', error)
    try { this.props.onError?.(error) } catch { /* non-blocking */ }
  }
  render() { return this.state.failed ? null : this.props.children }
}

const safely = (fn) => {
  try { fn() } catch (error) { console.warn('drama picks action failed:', error) }
}

const emitEvents = (pid, events, preview, variant) => {
  if (preview) {
    // Dev preview never reaches BabiDrama; log what would be sent instead.
    console.info('[drama preview] events', buildEventsBody(pid, events, variant))
    return
  }
  sendDramaEvents(pid, events, { variant })
}

// Dev fixture only: answers the episode route from `preview.episodes`
// (a missing slug is a 404), after a short delay like the network.
const previewEpisodeFetch = (episodes = {}) => (url) => new Promise((resolve) => {
  const params = new URL(url, 'http://preview.invalid').searchParams
  const slug = params.get('slug')
  const ep = params.get('ep')
  // Later episodes of the fixture are keyed `<slug>#<n>`.
  const payload = episodes[ep && ep !== '1' ? `${slug}#${ep}` : slug]
  setTimeout(() => resolve(payload
    ? { ok: true, status: 200, json: async () => payload }
    : { ok: false, status: 404, json: async () => ({}) }), 350)
})

// Dev only: the local preview proxies the videos over http://127.0.0.1.
const DEV_MEDIA = Boolean(import.meta.env?.DEV)

const DramaPicksCard = ({ pid, impressionKey = '', preview = null, onTrack, onLeave }) => {
  // undefined = loading, null = nothing to show, object = { mode, series }.
  // Explore mode is shuffled once here, so re-renders keep the same order.
  const [picks, setPicks] = useState(() => {
    if (!pid) return null
    return preview ? orderForDisplay(preview) : undefined
  })
  // What this device saw on earlier order pages (dramaMemory.js), read once: the card keeps the
  // series it chose from it for the whole page view, whatever is remembered meanwhile. The dev
  // preview brings its own and remembers nothing.
  const [memory, setMemory] = useState(() => (preview ? preview.memory || {} : readDramaMemory()))
  const remember = (change) => {
    if (!preview) safely(() => updateDramaMemory(change))
  }
  // An episode of the big card's series started on this page view.
  const startedRef = useRef(false)
  // The player always shows the big card (slot 0); the other series' thumbnails
  // open BabiDrama directly (owner request 2026-11-08).
  const playerRef = useRef(null)
  // Where the card sits in the window and the last tap inside it, for our own
  // analytics (dramaPlacement.js). Measuring must never break the card.
  const rootRef = useRef(null)
  const lastTap = useRef(null)
  const shownAt = useRef(null)
  // Where the picks came from and how long this page waited for them (analytics).
  const loadRef = useRef({ source: null, ms: null })
  const placement = () => {
    try {
      const root = rootRef.current
      if (!root || typeof window === 'undefined') return {}
      const cta = root.querySelector('.os-drama-cta')
      const stage = root.querySelector('.os-drama-stage')
      const now = performance.now()
      if (shownAt.current === null) shownAt.current = now
      return describePlacement({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollY: window.scrollY,
        cardRect: root.getBoundingClientRect(),
        ctaRect: cta ? cta.getBoundingClientRect() : null,
        stageHeight: stage ? stage.getBoundingClientRect().height : null,
        sinceLoadMs: now,
        sinceCardMs: now - shownAt.current,
      })
    } catch {
      return {}
    }
  }
  const noteTap = (event) => {
    try {
      lastTap.current = { trusted: event.isTrusted, on: tapTarget(event.target), at: performance.now() }
    } catch {
      lastTap.current = null
    }
  }
  const tapInfo = () => {
    try {
      return describeTap(lastTap.current, performance.now())
    } catch {
      return {}
    }
  }
  // Which version of the card this order gets, in the shares BabiDrama sent with the picks
  // (dramaPicks.js): `variant` is the id everything is reported under, `version.base` the
  // handoff the player follows, the rest its switches.
  const version = useMemo(
    () => dramaVersion(impressionKey, preview?.variant, { versions: picks?.versions, variants: picks?.variants }),
    [impressionKey, preview, picks]
  )
  const variant = version.id
  const previewFetch = useMemo(() => (preview ? previewEpisodeFetch(preview.episodes) : null), [preview])
  // The picks as this device should see them: the series it was watching goes on where it
  // stopped, one it already had on the big card gives way to the next (dramaMemory.js). Going on
  // with a later episode is what version d does; the others send the customer to BabiDrama after
  // episode 1.
  const arranged = useMemo(
    () => (picks?.series?.length
      ? arrangeForDevice(picks.series, memory, { order: impressionKey, resume: version.base === 'd' })
      : null),
    [picks, memory, impressionKey, version.base]
  )
  const featured = useMemo(
    () => (arranged?.series?.length
      ? { series: arranged.series[0], slot: 0, trigger: 'autoplay', startEpisode: arranged.startEpisode }
      : null),
    [arranged]
  )
  const current = featured
  const resumeFrom = arranged && arranged.startEpisode > 1 ? arranged.startEpisode : null

  // Why an order page showed no card, once per order (2026-11-11…15: 11.6 % of orders, with
  // nothing recorded): BabiDrama has no series for the product, or the picks did not come.
  const reportUnavailable = (reason, source, waitedMs) => {
    const key = `${pid}|${impressionKey}`
    if (preview || unavailableKeys.has(key)) return
    unavailableKeys.add(key)
    safely(() => onTrack?.('order_success_drama_unavailable', { pid, reason, source, waited_ms: waitedMs }))
  }

  useEffect(() => {
    if (preview) return undefined
    if (!pid) {
      // An order whose product BabiDrama cannot know (neither a product id nor a bundle).
      if (impressionKey) reportUnavailable('no_pid', null, 0)
      return undefined
    }
    const controller = new AbortController()
    let active = true
    const startedAt = performance.now()
    // The answer the checkout asked for before the order (dramaWarmup.js), when there is one.
    const warm = takeWarmPicks(pid)
    fetchDramaPicks(pid, {
      signal: controller.signal,
      warm,
      report: ({ outcome, source }) => {
        if (!active) return
        loadRef.current = { source, ms: Math.round(performance.now() - startedAt) }
        if (outcome !== 'ok') reportUnavailable(outcome, source, loadRef.current.ms)
      },
    })
      .then((result) => { if (active) setPicks(result || null) })
      .catch(() => { if (active) setPicks(null) })
    return () => { active = false; controller.abort() }
    // The report reads the order's key when it is called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, preview])

  // The series BabiDrama was last told is on this page's big card.
  const bigCardRef = useRef(null)
  useEffect(() => {
    if (!arranged?.series?.length) return
    // onTrack is recreated on every page render; these guards, not the deps, are what limit the
    // impression to once per page view (and once more when another series takes the big card).
    const key = `${pid}|${impressionKey}`
    const shown = arranged.series[0]
    const first = !impressedKeys.has(key)
    if (!first && bigCardRef.current === shown.slug) return
    impressedKeys.add(key)
    bigCardRef.current = shown.slug
    const slugs = arranged.series.map((series) => series.slug)
    const bigCard = { type: 'impression', slug: shown.slug, slot: 0, ...(resumeFrom ? { resume: true } : {}) }
    // BabiDrama counts a page per order: a reload of this page (Back from BabiDrama in the same
    // window) is not another one. Our own event is sent every time, marked `repeat`.
    // A big card that goes on with a later episode is marked `resume`: it offers no episode 1.
    // A series that takes the big card of a page already counted (the reload shows another one,
    // or the episode to go on with could not be played) is a display of that series, marked
    // `again`: not another page.
    const repeat = first ? seenInSession(`display|${key}`) : true
    const seriesSeen = seenInSession(`display|${key}|${shown.slug}`)
    if (!repeat) {
      safely(() => emitEvents(pid, slugs.map((slug, slot) => (slot === 0 ? bigCard : { type: 'impression', slug, slot })), preview, variant))
    } else if (!seriesSeen) {
      safely(() => emitEvents(pid, [{ ...bigCard, again: true }], preview, variant))
    }
    if (first) {
      safely(() => onTrack?.('order_success_drama_impression', {
        pid, series: slugs.join(','), series_count: slugs.length, mode: picks.mode, variant, repeat,
        arranged: arranged.reason, resume_episode: resumeFrom, remembered: Object.keys(memory).length,
        picks_source: loadRef.current.source, picks_ms: loadRef.current.ms,
        ...placement(),
      }))
    }
    remember((stored) => rememberShown(stored, shown, { order: impressionKey }))
    // `memory` and `remember` belong to the page view; the guards above limit this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arranged, picks, pid, impressionKey, preview, onTrack, variant, resumeFrom])

  if (picks === undefined) {
    return (
      <div className="os-drama os-drama-skeleton" aria-hidden="true">
        <div className="os-drama-head">
          <span className="os-drama-skel os-drama-skel-logo" />
          <span className="os-drama-skel os-drama-skel-kicker" />
        </div>
        <span className="os-drama-skel os-drama-skel-stage" />
        <div className="os-drama-body">
          <span className="os-drama-skel os-drama-skel-cta" />
        </div>
      </div>
    )
  }
  if (!picks?.series?.length || !arranged || !current) return null

  const track = (event, series, slot, extra = {}) => safely(() => onTrack?.(event, {
    pid, series: series.slug, slot, mode: picks.mode, variant, ...extra,
  }))

  // BabiDrama `click`: the customer engaged with that series (thumbnail tap,
  // a tap on the playing card or one of its links), once per page view.
  const markClick = (series, slot, action) => {
    const key = `${pid}|${impressionKey}|${series.slug}`
    if (clickedKeys.has(key)) return
    clickedKeys.add(key)
    safely(() => emitEvents(pid, [{ type: 'click', slug: series.slug, slot }], preview, variant))
    track('order_success_drama_click', series, slot, { action })
  }

  const handleThumbnail = (series, slot) => {
    safely(() => playerRef.current?.pause())
    handleOpenSite(series, slot, { source: 'thumbnail', secondsWatched: 0, positionS: 0 })
  }

  // BabiDrama no longer serves the episode the card would go on with (the series left its free
  // offer, or the shop): the series is done for this device, and the card starts over with the
  // next one, whose display the effect above reports.
  const dropResume = (series) => {
    remember((stored) => rememberDone(stored, series))
    setMemory((known) => rememberDone(known, series))
    track('order_success_drama_resume_failed', series, 0, { resume_episode: resumeFrom })
  }

  // Play errors carry the browser's own MediaError and, for `video` errors, a
  // 2-byte CORS probe of the same URL (status or failure), to tell a refused
  // network/CORS load from a media-stack refusal. One event, sent within ~4 s.
  const reportPlayError = (series, slot, reason, details) => {
    if (reason === 'not_found' && slot === 0 && resumeFrom && !startedRef.current) safely(() => dropResume(series))
    const { url, ...fields } = details || {}
    const base = {
      reason,
      ...fields,
      user_agent: typeof navigator === 'undefined' ? null : String(navigator.userAgent || '').slice(0, 200),
    }
    if (reason !== 'video' || !url || preview || typeof fetch !== 'function') {
      track('order_success_drama_play_error', series, slot, base)
      return
    }
    probeMedia(url).then((probe) => track('order_success_drama_play_error', series, slot, { ...base, ...probe }))
  }

  const handlePlayStart = (series, slot, { sound, trigger }) => {
    startedRef.current = true
    const key = `${pid}|${impressionKey}|${series.slug}`
    if (playedKeys.has(key)) return
    playedKeys.add(key)
    // Per order, not per series: after a reload the big card may be another series, and a start
    // without its display would make starts exceed displays.
    const repeat = seenInSession(`play|${pid}|${impressionKey}`)
    if (!repeat) safely(() => emitEvents(pid, [{ type: 'play', slug: series.slug, slot }], preview, variant))
    track('order_success_drama_play', series, slot, { sound, trigger, repeat, ...placement() })
  }

  // Episode 1 reached a quarter of its length here, once per order: the early signal the versions
  // of the card are compared on (few customers reach the end of an episode).
  const handleProgress = (series, slot, { episode, percent, positionS }) => {
    if (episode === 1 && percent === 25) {
      const key = `${pid}|${impressionKey}`
      if (!quarterKeys.has(key)) {
        quarterKeys.add(key)
        if (!seenInSession(`quarter|${key}`)) {
          safely(() => emitEvents(pid, [{ type: 'quarter', slug: series.slug, slot }], preview, variant))
        }
      }
    }
    track('order_success_drama_progress', series, slot, { episode, percent, position_s: positionS })
  }

  // An episode watched to its end here, once each per page view: BabiDrama orders the big card by
  // the finished episodes 1 and counts the later ones (variant d) for the test.
  const handleComplete = (series, slot, { episode = 1, durationS }) => {
    const key = `${pid}|${impressionKey}|${series.slug}|${episode}`
    if (!completedKeys.has(key)) {
      completedKeys.add(key)
      if (!seenInSession(`complete|${key}`)) {
        safely(() => emitEvents(pid, [{ type: 'complete', slug: series.slug, slot, ep: episode }], preview, variant))
      }
    }
    track('order_success_drama_complete', series, slot, { episode, duration_s: durationS })
    remember((stored) => rememberEpisode(stored, series, episode))
  }

  const handleOpenSite = (series, slot, { source, secondsWatched, positionS }) => {
    // Preserve the confirmation page when the customer comes back.
    safely(() => onLeave?.())
    markClick(series, slot, source)
    safely(() => emitEvents(pid, [{ type: 'open', slug: series.slug, slot, src: source }], preview, variant))
    track('order_success_drama_open', series, slot, {
      source, seconds_watched: secondsWatched, position_s: positionS, ...placement(), ...tapInfo(),
    })
    // The customer goes on with this series on BabiDrama: nothing left to offer of it here.
    remember((stored) => rememberDone(stored, series))
    // The anchor itself navigates; nothing here may block it.
  }

  const others = arranged.series
    .map((series, slot) => ({ series, slot }))
    .filter(({ series }) => series.slug !== current.series.slug)

  // Version switch `hook`: the head says what is playing (the series' hook line, in place of the
  // brand and the kicker, so the player stays where it is) and the picture carries a badge with
  // the free episodes. Without a hook line the card keeps its usual head.
  const headline = version.hook && current.series.hook && !resumeFrom ? current.series.hook : ''
  const kicker = resumeFrom ? 'La suite de votre série' : 'En attendant votre livraison'

  return (
    <section ref={rootRef} className="os-drama" aria-labelledby="os-drama-kicker" onClickCapture={noteTap}>
      <div className={`os-drama-head${headline ? ' has-hook' : ''}`}>
        <img className="os-drama-logo" src="/babidrama/babidrama-logo-64.png" width="28" height="28" alt={headline ? 'BabiDrama' : ''} />
        <div>
          {!headline && <span className="os-drama-brand">BabiDrama</span>}
          <h2 id="os-drama-kicker">{headline || kicker}</h2>
        </div>
      </div>

      <DramaPlayer
        key={current.series.slug}
        ref={playerRef}
        current={current}
        variant={version.base}
        versionId={variant}
        handoffAfter={version.handoffAfter}
        freeBadge={Boolean(headline)}
        pid={pid}
        fetchImpl={previewFetch}
        allowLoopbackHttp={DEV_MEDIA}
        onInteract={(series, slot, action) => markClick(series, slot, action)}
        onPlayStart={handlePlayStart}
        onEpisodeStart={(series, slot, { episode, sound }) => {
          // The first episode of a page view that goes on with a series is marked `resumed`.
          const resumed = !startedRef.current && episode === resumeFrom
          startedRef.current = true
          track('order_success_drama_episode', series, slot, { episode, sound, resumed })
        }}
        onProgress={handleProgress}
        onComplete={handleComplete}
        onExit={(series, slot, { episode, trigger, ended, secondsWatched, positionS }) => track('order_success_drama_exit', series, slot, {
          episode, trigger, ended, seconds_watched: secondsWatched, position_s: positionS,
        })}
        onFail={(series, slot, reason, details) => reportPlayError(series, slot, reason, details)}
        onDiagnostic={(series, slot, name, fields) => track(`order_success_drama_${name}`, series, slot, {
          ...fields,
          user_agent: typeof navigator === 'undefined' ? null : String(navigator.userAgent || '').slice(0, 200),
        })}
        onOpenSite={handleOpenSite}
      />

      {others.length > 0 && (
        <div className="os-drama-more">
          <p className="os-drama-more-label">Autres séries</p>
          <ul>
            {others.map(({ series, slot }) => (
              <li key={series.slug}>
                <a
                  className="os-drama-thumb"
                  href={dramaLink(series.watchUrl, { pid, source: 'thumbnail', variant })}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Regarder ${series.title} sur BabiDrama`}
                  onClick={() => handleThumbnail(series, slot)}
                >
                  <Cover url={series.coverUrl} className="os-drama-thumb-cover" />
                  <span className="os-drama-thumb-title" aria-hidden="true">{series.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default DramaPicksCard
