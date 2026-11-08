import { Component, useEffect, useMemo, useRef, useState } from 'react'
import { fetchDramaPicks, orderForDisplay, sendDramaEvents, buildEventsBody } from '../services/dramaPicks'
import DramaPlayer, { Cover } from './DramaPlayer'
import './DramaPicksCard.css'

// Impressions are sent once per page view per pid+order, even when React
// StrictMode or a remount runs the effect again. Clicks likewise once per
// series (an interaction with the playing card, a thumbnail or a link).
const impressedKeys = new Set()
const clickedKeys = new Set()
const playedKeys = new Set()

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

const emitEvents = (pid, events, preview) => {
  if (preview) {
    // Dev preview never reaches BabiDrama; log what would be sent instead.
    console.info('[drama preview] events', buildEventsBody(pid, events))
    return
  }
  sendDramaEvents(pid, events)
}

// Dev fixture only: answers the episode route from `preview.episodes`
// (a missing slug is a 404), after a short delay like the network.
const previewEpisodeFetch = (episodes = {}) => (url) => new Promise((resolve) => {
  const slug = new URL(url, 'http://preview.invalid').searchParams.get('slug')
  const payload = episodes[slug]
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
  // The player always shows the big card (slot 0); the other series' thumbnails
  // open BabiDrama directly (owner request 2026-11-08).
  const playerRef = useRef(null)
  const previewFetch = useMemo(() => (preview ? previewEpisodeFetch(preview.episodes) : null), [preview])
  const featured = useMemo(
    () => (picks?.series?.length ? { series: picks.series[0], slot: 0, trigger: 'autoplay' } : null),
    [picks]
  )
  const current = featured

  useEffect(() => {
    if (!pid || preview) return undefined
    const controller = new AbortController()
    let active = true
    fetchDramaPicks(pid, { signal: controller.signal })
      .then((result) => { if (active) setPicks(result || null) })
      .catch(() => { if (active) setPicks(null) })
    return () => { active = false; controller.abort() }
  }, [pid, preview])

  useEffect(() => {
    if (!picks?.series?.length) return
    // onTrack is recreated on every page render; this guard, not the deps,
    // is what limits the impression to once.
    const key = `${pid}|${impressionKey}`
    if (impressedKeys.has(key)) return
    impressedKeys.add(key)
    const slugs = picks.series.map((series) => series.slug)
    safely(() => emitEvents(pid, slugs.map((slug, slot) => ({ type: 'impression', slug, slot })), preview))
    safely(() => onTrack?.('order_success_drama_impression', {
      pid, series: slugs.join(','), series_count: slugs.length, mode: picks.mode,
    }))
  }, [picks, pid, impressionKey, preview, onTrack])

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
  if (!picks?.series?.length || !current) return null

  const track = (event, series, slot, extra = {}) => safely(() => onTrack?.(event, {
    pid, series: series.slug, slot, mode: picks.mode, ...extra,
  }))

  // BabiDrama `click`: the customer engaged with that series (thumbnail tap,
  // a tap on the playing card or one of its links), once per page view.
  const markClick = (series, slot, action) => {
    const key = `${pid}|${impressionKey}|${series.slug}`
    if (clickedKeys.has(key)) return
    clickedKeys.add(key)
    safely(() => emitEvents(pid, [{ type: 'click', slug: series.slug, slot }], preview))
    track('order_success_drama_click', series, slot, { action })
  }

  const handleThumbnail = (series, slot) => {
    safely(() => playerRef.current?.pause())
    handleOpenSite(series, slot, { source: 'thumbnail', secondsWatched: 0, positionS: 0 })
  }

  const handlePlayStart = (series, slot, { sound, trigger }) => {
    const key = `${pid}|${impressionKey}|${series.slug}`
    if (playedKeys.has(key)) return
    playedKeys.add(key)
    track('order_success_drama_play', series, slot, { sound, trigger })
  }

  const handleOpenSite = (series, slot, { source, secondsWatched, positionS }) => {
    // Preserve the confirmation page when the customer comes back.
    safely(() => onLeave?.())
    markClick(series, slot, source)
    safely(() => emitEvents(pid, [{ type: 'open', slug: series.slug, slot }], preview))
    track('order_success_drama_open', series, slot, { source, seconds_watched: secondsWatched, position_s: positionS })
    // The anchor itself navigates; nothing here may block it.
  }

  const others = picks.series
    .map((series, slot) => ({ series, slot }))
    .filter(({ series }) => series.slug !== current.series.slug)

  return (
    <section className="os-drama" aria-labelledby="os-drama-kicker">
      <div className="os-drama-head">
        <img className="os-drama-logo" src="/babidrama/babidrama-logo-64.png" width="28" height="28" alt="" />
        <div>
          <span className="os-drama-brand">BabiDrama</span>
          <h2 id="os-drama-kicker">En attendant votre livraison</h2>
        </div>
      </div>

      <DramaPlayer
        ref={playerRef}
        current={current}
        fetchImpl={previewFetch}
        allowLoopbackHttp={DEV_MEDIA}
        onInteract={(series, slot, action) => markClick(series, slot, action)}
        onPlayStart={handlePlayStart}
        onComplete={(series, slot, { durationS }) => track('order_success_drama_complete', series, slot, { duration_s: durationS })}
        onFail={(series, slot, reason) => track('order_success_drama_play_error', series, slot, { reason })}
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
                  href={series.watchUrl}
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
