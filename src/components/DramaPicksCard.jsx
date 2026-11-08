import { Component, useEffect, useState } from 'react'
import { fetchDramaPicks, orderForDisplay, sendDramaEvents, buildEventsBody } from '../services/dramaPicks'
import './DramaPicksCard.css'

// Impressions are sent once per page view per pid+order, even when React
// StrictMode or a remount runs the effect again.
const impressedKeys = new Set()

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

// Non-breaking space keeps "73 épisodes" on one line.
const plural = (count, singular, pluralForm) => `${count}\u00A0${count === 1 ? singular : pluralForm}`

const seriesMeta = (series) => [
  ...series.genres,
  series.episodeCount ? plural(series.episodeCount, 'épisode', 'épisodes') : null,
].filter(Boolean).join(' · ')

const freeLine = (series) => (series.freeEpisodes
  ? `${plural(series.freeEpisodes, 'épisode gratuit', 'épisodes gratuits')} · en français`
  : 'En français')

const hideBrokenImage = (event) => { event.currentTarget.style.visibility = 'hidden' }

const Cover = ({ url, className }) => (
  <span className={className}>
    {url && <img src={url} alt="" loading="lazy" decoding="async" onError={hideBrokenImage} />}
  </span>
)

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

const DramaPicksCard = ({ pid, impressionKey = '', preview = null, onTrack, onLeave }) => {
  // undefined = loading, null = nothing to show, object = { mode, series }.
  // Explore mode is shuffled once here, so re-renders keep the same order.
  const [picks, setPicks] = useState(() => {
    if (!pid) return null
    return preview ? orderForDisplay(preview) : undefined
  })

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
        <span className="os-drama-skel os-drama-skel-kicker" />
        <div className="os-drama-main">
          <span className="os-drama-skel os-drama-skel-cover" />
          <div className="os-drama-info">
            <span className="os-drama-skel os-drama-skel-line" />
            <span className="os-drama-skel os-drama-skel-line os-drama-skel-short" />
            <span className="os-drama-skel os-drama-skel-line" />
            <span className="os-drama-skel os-drama-skel-line" />
          </div>
        </div>
        <span className="os-drama-skel os-drama-skel-cta" />
      </div>
    )
  }
  if (!picks?.series?.length) return null

  const [featured, ...others] = picks.series

  const handleOpen = (series, slot) => {
    // Preserve the confirmation page when the customer comes back.
    safely(() => onLeave?.())
    safely(() => emitEvents(pid, [{ type: 'click', slug: series.slug, slot }], preview))
    safely(() => onTrack?.('order_success_drama_click', { pid, series: series.slug, slot, mode: picks.mode }))
    // The anchor itself navigates; nothing here may block it.
  }

  const meta = seriesMeta(featured)

  return (
    <section className="os-drama" aria-labelledby="os-drama-kicker">
      <div className="os-drama-head">
        <h2 id="os-drama-kicker">En attendant votre livraison</h2>
        <span className="os-drama-brand">BabiDrama</span>
      </div>

      <div className="os-drama-main">
        <Cover url={featured.coverUrl} className="os-drama-cover" />
        <div className="os-drama-info">
          <h3>{featured.title}</h3>
          {meta && <p className="os-drama-meta">{meta}</p>}
          {featured.hook && <p className="os-drama-hook">{featured.hook}</p>}
        </div>
      </div>

      <a
        className="os-drama-cta"
        href={featured.watchUrl}
        target="_blank"
        rel="noopener"
        onClick={() => handleOpen(featured, 0)}
      >
        <span aria-hidden="true">{'▶︎'}</span> Regarder l’épisode 1
      </a>
      <p className="os-drama-free">{freeLine(featured)}</p>

      {others.length > 0 && (
        <div className="os-drama-more">
          <p className="os-drama-more-label">Autres séries</p>
          <ul>
            {others.map((series, index) => (
              <li key={series.slug}>
                <a
                  className="os-drama-thumb"
                  href={series.watchUrl}
                  target="_blank"
                  rel="noopener"
                  onClick={() => handleOpen(series, index + 1)}
                >
                  <Cover url={series.coverUrl} className="os-drama-thumb-cover" />
                  <span className="os-drama-thumb-title">{series.title}</span>
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
