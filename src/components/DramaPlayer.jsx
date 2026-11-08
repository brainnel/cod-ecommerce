import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  DRAMA_START_TIMEOUT_MS,
  continueUrl,
  fetchDramaEpisode,
  freeEpisodesLine,
  playedSeconds,
} from '../services/dramaEpisode'
import './DramaPlayer.css'

// Inline BabiDrama player of the order-success card: one persistent <video>
// that autoplays episode 1 of the current series (with sound when the browser
// allows it, muted with a « Touchez pour activer le son » prompt otherwise).
// Any failure turns into the cover with its link; nothing here may break the
// confirmation page around it.

// Uninterrupted playback fades the title so burned-in subtitles stay readable.
const IMMERSIVE_AFTER_MS = 4000
// Signed playback URLs stay valid 6–7 h: a series played again soon (or a
// remount while its request is in flight, e.g. StrictMode) reuses the same
// request instead of issuing new URLs. Failures are never kept.
const EPISODE_CACHE_MS = 30 * 60 * 1000
const episodeRequests = new Map()

const requestEpisode = (slug, { fetchImpl, allowLoopbackHttp }) => {
  const cached = episodeRequests.get(slug)
  if (cached && Date.now() - cached.at < EPISODE_CACHE_MS) return cached.promise
  const promise = fetchDramaEpisode(slug, { allowLoopbackHttp, ...(fetchImpl ? { fetchImpl } : {}) })
    .then((result) => {
      if (result.status !== 'ok' && episodeRequests.get(slug)?.promise === promise) episodeRequests.delete(slug)
      return result
    })
  episodeRequests.set(slug, { at: Date.now(), promise })
  return promise
}

const safely = (fn) => {
  try { return fn() } catch (error) { console.warn('drama player action failed:', error); return undefined }
}

// play() as 'played' | 'blocked' | 'aborted' | 'failed'; never rejects.
const attemptPlay = (video) => {
  try {
    const attempt = video.play()
    if (!attempt || typeof attempt.then !== 'function') return Promise.resolve('played')
    return attempt.then(() => 'played', (error) => {
      if (error?.name === 'NotAllowedError') return 'blocked'
      if (error?.name === 'AbortError') return 'aborted'
      return 'failed'
    })
  } catch {
    return Promise.resolve('failed')
  }
}

const Icon = ({ children, size = 24, filled = false }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
)
export const PlayIcon = ({ size }) => (
  <Icon size={size} filled><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.7L9.5 4.6A1 1 0 0 0 8 5.5z" /></Icon>
)
const SoundOffIcon = ({ size }) => (
  <Icon size={size}><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></Icon>
)
const SoundOnIcon = ({ size }) => (
  <Icon size={size}><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor" /><path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></Icon>
)
const ReplayIcon = ({ size }) => (
  <Icon size={size}><path d="M4 12a8 8 0 1 0 2.3-5.7" /><path d="M4 4.5V9h4.5" /></Icon>
)
const Spinner = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
)

const hideBrokenImage = (event) => { event.currentTarget.style.visibility = 'hidden' }

export const Cover = ({ url, className }) => (
  <span className={className}>
    {url && <img src={url} alt="" loading="lazy" decoding="async" onError={hideBrokenImage} />}
  </span>
)

// Non-breaking space keeps "73 épisodes" on one line.
const plural = (count, singular, pluralForm) => `${count}\u00A0${count === 1 ? singular : pluralForm}`

const seriesMeta = (series) => [
  ...series.genres,
  series.episodeCount ? plural(series.episodeCount, 'épisode', 'épisodes') : null,
].filter(Boolean).join(' · ')

// Attributes React has no prop for; inline playback on old iOS, no AirPlay picker.
const VIDEO_EXTRA_ATTRIBUTES = { 'webkit-playsinline': '', 'x-webkit-airplay': 'deny' }

const DramaPlayer = ({
  ref,
  current,
  fetchImpl,
  allowLoopbackHttp = false,
  onInteract,
  onPlayStart,
  onComplete,
  onFail,
  onOpenSite,
}) => {
  const { series, slot } = current
  const stageRef = useRef(null)
  const videoRef = useRef(null)
  const progressRef = useRef(null)
  // Source of the current episode; media events from anything else (the
  // silent unlock clip, a previous series) are ignored.
  const srcRef = useRef(null)
  const loadIdRef = useRef(0)
  const startedRef = useRef(false)
  const autoPausedRef = useRef(false)
  const inViewRef = useRef(true)
  const lastPositionRef = useRef(0)
  const lastWatchedRef = useRef(0)
  const [status, setStatus] = useState('loading') // loading | starting | ready | ended | failed
  const [episode, setEpisode] = useState(null)
  const [paused, setPaused] = useState(true)
  const [buffering, setBuffering] = useState(false)
  const [muted, setMuted] = useState(false)
  const [soundBlocked, setSoundBlocked] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const [href, setHref] = useState(series.watchUrl)
  const [immersive, setImmersive] = useState(false)
  const statusRef = useRef(status)
  statusRef.current = status

  const callbacks = useRef({})
  callbacks.current = { onInteract, onPlayStart, onComplete, onFail, onOpenSite, fetchImpl, allowLoopbackHttp }
  const notify = (name, ...args) => safely(() => callbacks.current[name]?.(series, slot, ...args))

  const isCurrent = (event) => Boolean(srcRef.current) && event.currentTarget.getAttribute('src') === srcRef.current

  const fail = (reason) => {
    const video = videoRef.current
    if (video && srcRef.current) {
      lastPositionRef.current = video.currentTime || lastPositionRef.current
      lastWatchedRef.current = playedSeconds(video.played)
    }
    srcRef.current = null
    loadIdRef.current += 1
    if (reason === 'video' || reason === 'timeout') episodeRequests.delete(series.slug)
    safely(() => {
      if (!video) return
      video.pause()
      video.removeAttribute('src')
      video.load()
    })
    setStatus('failed')
    setBuffering(false)
    setNeedsTap(false)
    setSoundBlocked(false)
    notify('onFail', reason)
  }
  const failRef = useRef(fail)
  failRef.current = fail

  // Unmuted first; muted with a prompt when the browser refuses sound; a
  // « Touchez pour lancer » tap when it refuses autoplay altogether.
  const playWithSoundFallback = async (loadId) => {
    const video = videoRef.current
    if (!video) return
    video.muted = false
    setMuted(false)
    let outcome = await attemptPlay(video)
    if (loadIdRef.current !== loadId) return
    if (outcome !== 'blocked') return
    video.muted = true
    setMuted(true)
    outcome = await attemptPlay(video)
    if (loadIdRef.current !== loadId) return
    if (outcome === 'played') setSoundBlocked(true)
    else if (outcome === 'blocked') setNeedsTap(true)
  }

  // The other series' thumbnails open BabiDrama in a new tab: pause here so the
  // order page goes quiet behind it.
  useImperativeHandle(ref, () => ({
    pause: () => {
      const video = videoRef.current
      if (video && !video.paused) video.pause()
    },
  }), [])

  // Load and play the current series.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    loadIdRef.current += 1
    const loadId = loadIdRef.current
    srcRef.current = null
    startedRef.current = false
    autoPausedRef.current = false
    lastPositionRef.current = 0
    lastWatchedRef.current = 0
    if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)'
    setStatus('loading')
    setEpisode(null)
    setPaused(true)
    setBuffering(false)
    setSoundBlocked(false)
    setNeedsTap(false)
    setHref(series.watchUrl)

    const { fetchImpl, allowLoopbackHttp: allowHttp } = callbacks.current
    requestEpisode(series.slug, { fetchImpl, allowLoopbackHttp: allowHttp }).then((result) => {
      if (loadIdRef.current !== loadId || result.status === 'aborted') return
      if (result.status !== 'ok') {
        failRef.current(result.status === 'not_found' ? 'not_found' : result.reason || 'error')
        return
      }
      const next = result.episode
      setEpisode(next)
      setHref(next.watchUrl)
      srcRef.current = next.videoUrl
      safely(() => { video.src = next.videoUrl })
      setStatus('starting')
      playWithSoundFallback(loadId)
    }).catch((error) => {
      if (loadIdRef.current === loadId) safely(() => failRef.current('error'))
      console.warn('drama episode load failed:', error)
    })
    return () => {
      if (loadIdRef.current === loadId) loadIdRef.current += 1
    }
    // A new `current` object (from the card) is a new request; the rest is read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  // No `canplay` within 8 s (or no episode response): show the cover instead.
  useEffect(() => {
    if (needsTap || (status !== 'loading' && status !== 'starting')) return undefined
    const timer = setTimeout(() => failRef.current('timeout'), DRAMA_START_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [status, needsTap, current])

  const playingSmoothly = status === 'ready' && !paused && !buffering && !soundBlocked && !needsTap
  useEffect(() => {
    if (!playingSmoothly) {
      setImmersive(false)
      return undefined
    }
    const timer = setTimeout(() => setImmersive(true), IMMERSIVE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [playingSmoothly])

  // Out of view: pause, and resume when it comes back. Hidden page: pause.
  useEffect(() => {
    const stage = stageRef.current
    const video = videoRef.current
    const onVisibility = () => {
      if (document.hidden && video && !video.paused) safely(() => video.pause())
    }
    document.addEventListener('visibilitychange', onVisibility)
    let observer
    if (stage && typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(([entry]) => {
        inViewRef.current = Boolean(entry?.isIntersecting)
        if (!video || !srcRef.current) return
        // Only a started episode: pausing a pending first play would stall it.
        if (!inViewRef.current && !video.paused && statusRef.current === 'ready') {
          autoPausedRef.current = true
          safely(() => video.pause())
        } else if (inViewRef.current && autoPausedRef.current && !document.hidden) {
          autoPausedRef.current = false
          attemptPlay(video)
        }
      })
      observer.observe(stage)
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      observer?.disconnect()
      srcRef.current = null
      safely(() => {
        if (!video) return
        video.pause()
        video.removeAttribute('src')
        video.load()
      })
    }
  }, [])

  const onPlaying = (event) => {
    if (!isCurrent(event)) return
    const video = event.currentTarget
    setBuffering(false)
    setPaused(false)
    setNeedsTap(false)
    setStatus((value) => (value === 'starting' ? 'ready' : value))
    if (!startedRef.current) {
      startedRef.current = true
      notify('onPlayStart', { sound: !video.muted, trigger: current.trigger })
    }
    if (!inViewRef.current) {
      autoPausedRef.current = true
      safely(() => video.pause())
    }
  }

  const onTimeUpdate = (event) => {
    if (!isCurrent(event)) return
    const video = event.currentTarget
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : episode?.durationS
    if (progressRef.current && duration > 0) {
      progressRef.current.style.transform = `scaleX(${Math.min(1, video.currentTime / duration)})`
    }
    lastPositionRef.current = video.currentTime
    const next = continueUrl(episode?.watchUrl || series.watchUrl, video.currentTime)
    setHref((value) => (value === next ? value : next))
  }

  const onEnded = (event) => {
    if (!isCurrent(event)) return
    setStatus('ended')
    setBuffering(false)
    if (progressRef.current) progressRef.current.style.transform = 'scaleX(1)'
    notify('onComplete', { durationS: Math.round(event.currentTarget.duration || episode?.durationS || 0) })
  }

  const onSurfaceTap = () => {
    const video = videoRef.current
    if (!video || !srcRef.current) return
    if (needsTap) {
      video.muted = false
      setMuted(false)
      setNeedsTap(false)
      const loadId = loadIdRef.current
      attemptPlay(video).then((outcome) => { if (outcome === 'blocked' && loadIdRef.current === loadId) setNeedsTap(true) })
      notify('onInteract', 'play')
      return
    }
    if (soundBlocked) {
      // First tap on the muted autoplay: sound on, playback continues.
      video.muted = false
      setMuted(false)
      setSoundBlocked(false)
      if (video.paused) attemptPlay(video)
      notify('onInteract', 'unmute')
      return
    }
    if (status !== 'ready') return
    autoPausedRef.current = false
    if (video.paused) attemptPlay(video)
    else video.pause()
    notify('onInteract', 'toggle')
  }

  const onToggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
    setSoundBlocked(false)
    notify('onInteract', video.muted ? 'mute' : 'unmute')
  }

  const onReplay = () => {
    const video = videoRef.current
    if (!video || !srcRef.current) return
    safely(() => { video.currentTime = 0 })
    if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)'
    if (soundBlocked) {
      // A tap after a muted autoplay: replay with sound.
      video.muted = false
      setMuted(false)
      setSoundBlocked(false)
    }
    setStatus('ready')
    const loadId = loadIdRef.current
    attemptPlay(video).then((outcome) => { if (outcome === 'blocked' && loadIdRef.current === loadId) setNeedsTap(true) })
    notify('onInteract', 'replay')
  }

  // Links leaving for BabiDrama (new tab): stop here so two tabs never play.
  const onLeave = (source) => {
    const video = videoRef.current
    const playing = Boolean(video && srcRef.current)
    const position = playing ? video.currentTime : lastPositionRef.current
    const watched = playing ? playedSeconds(video.played) : lastWatchedRef.current
    if (playing && !video.paused) {
      autoPausedRef.current = false
      safely(() => video.pause())
    }
    notify('onOpenSite', { source, secondsWatched: watched, positionS: Math.floor(position || 0) })
  }

  const failed = status === 'failed'
  const ended = status === 'ended'
  const watchUrl = episode?.watchUrl || series.watchUrl
  const nextHref = episode?.nextUrl || watchUrl
  const poster = episode?.posterUrl || series.coverUrl || undefined
  const title = episode?.title || series.title
  const genres = series.genres.join(' · ')
  const free = freeEpisodesLine(series.freeEpisodes)
  const showSpinner = !failed && !needsTap && !ended
    && (status === 'loading' || status === 'starting' || (buffering && !paused))
  const showPaused = status === 'ready' && paused && !needsTap && !soundBlocked
  const surfaceLabel = needsTap ? 'Lancer la vidéo'
    : soundBlocked ? 'Activer le son'
      : paused ? 'Lecture' : 'Mettre en pause'
  const ctaLabel = failed && href === watchUrl ? 'Regarder l’épisode 1' : 'Continuer sur BabiDrama'

  return (
    <>
      <div ref={stageRef} className="os-drama-stage" hidden={failed} data-status={status}>
        <video
          ref={videoRef}
          className="os-drama-video"
          playsInline
          crossOrigin="anonymous"
          preload="metadata"
          poster={poster}
          aria-hidden="true"
          {...VIDEO_EXTRA_ATTRIBUTES}
          onPlay={(event) => { if (isCurrent(event)) setPaused(false) }}
          onPause={(event) => { if (isCurrent(event)) setPaused(true) }}
          onPlaying={onPlaying}
          onWaiting={(event) => { if (isCurrent(event)) setBuffering(true) }}
          onCanPlay={(event) => {
            if (!isCurrent(event)) return
            setBuffering(false)
            setStatus((value) => (value === 'starting' ? 'ready' : value))
          }}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onError={(event) => { if (isCurrent(event)) fail('video') }}
        />
        <button type="button" className="os-drama-surface" aria-label={surfaceLabel} onClick={onSurfaceTap} />

        {showSpinner && <span className="os-drama-center os-drama-spinner"><Spinner /></span>}
        {showPaused && (
          <span className="os-drama-center"><span className="os-drama-paused"><PlayIcon size={36} /></span></span>
        )}
        {soundBlocked && !needsTap && (
          <span className="os-drama-center"><span className="os-drama-prompt"><SoundOffIcon size={22} />Touchez pour activer le son</span></span>
        )}
        {needsTap && (
          <span className="os-drama-center"><span className="os-drama-prompt"><PlayIcon size={20} />Touchez pour lancer</span></span>
        )}

        <div className={`os-drama-info${immersive ? ' is-immersive' : ''}`}>
          <h3>{title}</h3>
          <p>
            <span className="os-drama-badge">Épisode 1 · gratuit</span>
            {genres && <span className="os-drama-genres">{genres}</span>}
          </p>
        </div>

        <button
          type="button"
          className="os-drama-mute"
          aria-label={muted ? 'Activer le son' : 'Couper le son'}
          onClick={onToggleMute}
        >
          {muted ? <SoundOffIcon size={22} /> : <SoundOnIcon size={22} />}
        </button>

        <div className="os-drama-progress" aria-hidden="true"><span ref={progressRef} /></div>

        {ended && (
          <div className="os-drama-end">
            <p>Fin de l’épisode 1</p>
            <a className="os-drama-next" href={nextHref} target="_blank" rel="noopener" onClick={() => onLeave('next')}>
              {episode?.nextUrl ? 'Épisode 2 sur BabiDrama' : 'Continuer sur BabiDrama'} <PlayIcon size={16} />
            </a>
            <button type="button" className="os-drama-replay" onClick={onReplay}><ReplayIcon size={18} />Revoir</button>
          </div>
        )}
      </div>

      <div className="os-drama-body">
        {failed && (
          <div className="os-drama-main">
            <Cover url={series.coverUrl} className="os-drama-cover" />
            <div className="os-drama-static">
              <h3>{series.title}</h3>
              {seriesMeta(series) && <p className="os-drama-meta">{seriesMeta(series)}</p>}
              {series.hook && <p className="os-drama-hook">{series.hook}</p>}
            </div>
          </div>
        )}
        <a
          className="os-drama-cta"
          href={ended ? nextHref : href}
          target="_blank"
          rel="noopener"
          onClick={() => onLeave(ended ? 'next' : failed ? 'fallback' : 'continue')}
        >
          <PlayIcon size={18} /> {ctaLabel}
        </a>
        {free && <p className="os-drama-free">{free}</p>}
      </div>
    </>
  )
}

export default DramaPlayer
