import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  DRAMA_START_TIMEOUT_MS,
  continueUrl,
  fetchDramaEpisode,
  freeEpisodesLine,
  playedSeconds,
} from '../services/dramaEpisode'
import { bufferedSeconds, mediaErrorDetails, networkDetails } from '../services/dramaDiagnostics'
import { DRAMA_AUTO_NEXT_SECONDS, dramaLink } from '../services/dramaPicks'
import './DramaPlayer.css'

// Inline BabiDrama player of the order-success card: one persistent <video>
// that autoplays episode 1 of the current series (with sound when the browser
// allows it, muted with a « Touchez pour activer le son » prompt otherwise).
// Any failure turns into the cover with its link; nothing here may break the
// confirmation page around it.
//
// `variant` (dramaPicks.js, test of 2026-11-10): 'a' keeps « Continuer sur
// BabiDrama » under the playing episode; 'b', 'c' and 'd' show no link to
// BabiDrama while an episode plays (the end card offers the next one); 'c'
// and 'd' open it by themselves after a countdown the customer can cancel;
// 'd' first plays the following free episodes here, one after the other.

// Uninterrupted playback fades the title so burned-in subtitles stay readable.
const IMMERSIVE_AFTER_MS = 4000
// Shares of the episode reported once each (order-success analytics).
const PROGRESS_MARKS = [25, 50, 75]
// Signed playback URLs stay valid 6–7 h: a series played again soon (or a
// remount while its request is in flight, e.g. StrictMode) reuses the same
// request instead of issuing new URLs. Failures are never kept.
const EPISODE_CACHE_MS = 30 * 60 * 1000
const episodeRequests = new Map()

const episodeKey = (slug, ep) => (ep > 1 ? `${slug}#${ep}` : slug)

const requestEpisode = (slug, ep, { fetchImpl, allowLoopbackHttp }) => {
  const key = episodeKey(slug, ep)
  const cached = episodeRequests.get(key)
  if (cached && Date.now() - cached.at < EPISODE_CACHE_MS) return cached.promise
  const promise = fetchDramaEpisode(slug, { ep, allowLoopbackHttp, ...(fetchImpl ? { fetchImpl } : {}) })
    .then((result) => {
      if (result.status !== 'ok' && episodeRequests.get(key)?.promise === promise) episodeRequests.delete(key)
      return result
    })
  episodeRequests.set(key, { at: Date.now(), promise })
  return promise
}

const safely = (fn) => {
  try { return fn() } catch (error) { console.warn('drama player action failed:', error); return undefined }
}

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

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
  variant = 'a',
  pid = null,
  fetchImpl,
  allowLoopbackHttp = false,
  onInteract,
  onPlayStart,
  onEpisodeStart,
  onProgress,
  onComplete,
  onExit,
  onFail,
  onOpenSite,
  onDiagnostic,
}) => {
  const { series, slot } = current
  const lateLink = variant !== 'a'
  const autoNext = variant === 'c' || variant === 'd'
  const inlineSeries = variant === 'd'
  const link = (url, source) => dramaLink(url, { pid, source, variant })
  // The episode playing in the card: 1, then the following free ones in variant d.
  const [episodeNo, setEpisodeNo] = useState(1)
  const episodeNoRef = useRef(1)
  episodeNoRef.current = episodeNo
  // Where the next episode is on BabiDrama, kept for the link shown if it cannot be loaded here.
  const nextUrlRef = useRef(null)
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
  const marksRef = useRef(new Set())
  const exitReportedRef = useRef(false)
  // Variant c: seconds left before episode 2 opens by itself (null = no countdown).
  const [autoIn, setAutoIn] = useState(null)
  const [status, setStatus] = useState('loading') // loading | starting | ready | ended | failed
  const [episode, setEpisode] = useState(null)
  const [paused, setPaused] = useState(true)
  const [buffering, setBuffering] = useState(false)
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  mutedRef.current = muted
  const [soundBlocked, setSoundBlocked] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const [href, setHref] = useState(series.watchUrl)
  const [immersive, setImmersive] = useState(false)
  // The cover stays up until the first frame plays. It is an <img>, not the video's `poster`:
  // with crossOrigin="anonymous" WebKit loads the poster in CORS mode, img.babidrama.com sends
  // no CORS headers, and the failed poster fires `error` on the <video> (every iPhone).
  const [hasFrame, setHasFrame] = useState(false)
  const statusRef = useRef(status)
  statusRef.current = status
  // Views that end with neither a play nor an error (2026-11-08: 2 of 12 iPhones, 4 of 63
  // Android): was autoplay refused outright (« Touchez pour lancer », no timeout then), or did
  // the viewer leave first? One `tap_needed` and one `leave` per episode load, analytics only.
  const diagRef = useRef(null)
  // Where the episode stood: also sent with an 8 s timeout (1.6 % of views, Android only on
  // 2026-11-08), to tell a slow episode answer (`loading`) from a slow video (`starting`).
  const diagDetails = () => {
    const video = videoRef.current
    const diag = diagRef.current
    const ms = (from) => (from == null ? null : Math.round(nowMs() - from))
    return {
      status: statusRef.current,
      ms_since_load: ms(diag?.loadedAt),
      ms_since_src: ms(diag?.srcAt),
      ready_state: video?.readyState ?? null,
      network_state: video?.networkState ?? null,
      buffered_s: bufferedSeconds(video),
      in_view: inViewRef.current,
      page_visible: typeof document === 'undefined' ? null : document.visibilityState === 'visible',
      ...networkDetails(),
    }
  }
  const diagnose = (name, extra = {}) => notify('onDiagnostic', name, { ...diagDetails(), ...extra })
  const diagnoseRef = useRef(diagnose)
  diagnoseRef.current = diagnose
  const diagDetailsRef = useRef(diagDetails)
  diagDetailsRef.current = diagDetails

  const callbacks = useRef({})
  callbacks.current = { onInteract, onPlayStart, onEpisodeStart, onProgress, onComplete, onExit, onFail, onOpenSite, onDiagnostic, fetchImpl, allowLoopbackHttp }
  const notify = (name, ...args) => safely(() => callbacks.current[name]?.(series, slot, ...args))
  const notifyRef = useRef(notify)
  notifyRef.current = notify

  const isCurrent = (event) => Boolean(srcRef.current) && event.currentTarget.getAttribute('src') === srcRef.current

  const fail = (reason, details = null) => {
    // Once per episode load: the episode request and the stage each time out at 8 s, and both
    // used to report (two `timeout` errors for one view).
    if (diagRef.current?.failed) return
    if (diagRef.current) diagRef.current.failed = true
    const video = videoRef.current
    if (video && srcRef.current) {
      lastPositionRef.current = video.currentTime || lastPositionRef.current
      lastWatchedRef.current = playedSeconds(video.played)
    }
    srcRef.current = null
    loadIdRef.current += 1
    if (reason === 'video' || reason === 'timeout') episodeRequests.delete(episodeKey(series.slug, episodeNoRef.current))
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
    notify('onFail', reason, details)
  }
  const failRef = useRef(fail)
  failRef.current = fail

  // Unmuted first; muted with a prompt when the browser refuses sound; a
  // « Touchez pour lancer » tap when it refuses autoplay altogether.
  const playWithSoundFallback = async (loadId) => {
    const video = videoRef.current
    if (!video) return
    // A following episode keeps the sound as the customer left it.
    const keepMuted = episodeNoRef.current > 1 && mutedRef.current
    video.muted = keepMuted
    setMuted(keepMuted)
    let outcome = await attemptPlay(video)
    if (loadIdRef.current !== loadId) return
    if (outcome !== 'blocked') return
    video.muted = true
    setMuted(true)
    outcome = await attemptPlay(video)
    if (loadIdRef.current !== loadId) return
    if (outcome === 'played') setSoundBlocked(true)
    else if (outcome === 'blocked') {
      setNeedsTap(true)
      if (diagRef.current && !diagRef.current.tapNeeded) {
        diagRef.current.tapNeeded = true
        safely(() => diagnose('tap_needed'))
      }
    }
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
    marksRef.current = new Set()
    exitReportedRef.current = false
    setAutoIn(null)
    if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)'
    setStatus('loading')
    setHasFrame(false)
    diagRef.current = { loadedAt: nowMs(), srcAt: null, tapNeeded: false, left: false, failed: false }
    setEpisode(null)
    setPaused(true)
    setBuffering(false)
    setSoundBlocked(false)
    setNeedsTap(false)
    setHref(episodeNo > 1 ? nextUrlRef.current || series.watchUrl : series.watchUrl)

    const { fetchImpl, allowLoopbackHttp: allowHttp } = callbacks.current
    requestEpisode(series.slug, episodeNo, { fetchImpl, allowLoopbackHttp: allowHttp }).then((result) => {
      if (loadIdRef.current !== loadId || result.status === 'aborted') return
      if (result.status !== 'ok') {
        let details = null
        try { details = diagDetailsRef.current() } catch { details = null }
        failRef.current(result.status === 'not_found' ? 'not_found' : result.reason || 'error', details)
        return
      }
      const next = result.episode
      nextUrlRef.current = next.nextUrl
      setEpisode(next)
      setHref(next.watchUrl)
      srcRef.current = next.videoUrl
      if (diagRef.current) diagRef.current.srcAt = nowMs()
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
    // A new `current` object (from the card) or the next episode is a new request; the rest is
    // read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, episodeNo])

  // No `canplay` within 8 s (or no episode response): show the cover instead.
  useEffect(() => {
    if (needsTap || (status !== 'loading' && status !== 'starting')) return undefined
    const timer = setTimeout(() => {
      let details = null
      try { details = diagDetailsRef.current() } catch { details = null }
      failRef.current('timeout', details)
    }, DRAMA_START_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [status, needsTap, current, episodeNo])

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
    // Leaving before the episode started (and without an error): report where it stood.
    const onLeave = (trigger) => {
      const diag = diagRef.current
      if (!diag || diag.left || startedRef.current) return
      if (statusRef.current === 'failed' || statusRef.current === 'ended') return
      diag.left = true
      safely(() => diagnoseRef.current('leave', { trigger, tap_needed: diag.tapNeeded }))
    }
    // Leaving after it started: how far the customer watched here (once per episode load).
    const onExit = (trigger) => {
      if (!startedRef.current || exitReportedRef.current || statusRef.current === 'failed') return
      exitReportedRef.current = true
      const playing = Boolean(video && srcRef.current)
      safely(() => notifyRef.current('onExit', {
        episode: episodeNoRef.current,
        trigger,
        ended: statusRef.current === 'ended',
        secondsWatched: playing ? playedSeconds(video.played) : lastWatchedRef.current,
        positionS: Math.floor((playing ? video.currentTime : lastPositionRef.current) || 0),
      }))
    }
    const onVisibility = () => {
      if (document.hidden) onExit('hidden')
      if (document.hidden && video && !video.paused) safely(() => video.pause())
      if (document.hidden) onLeave('hidden')
    }
    const onPageHide = () => {
      onExit('pagehide')
      onLeave('pagehide')
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
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
      window.removeEventListener('pagehide', onPageHide)
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
    setHasFrame(true)
    setStatus((value) => (value === 'starting' ? 'ready' : value))
    if (!startedRef.current) {
      startedRef.current = true
      if (episodeNo === 1) notify('onPlayStart', { sound: !video.muted, trigger: current.trigger })
      else notify('onEpisodeStart', { episode: episodeNo, sound: !video.muted })
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
    if (duration > 0) {
      const percent = (video.currentTime / duration) * 100
      for (const mark of PROGRESS_MARKS) {
        if (percent >= mark && !marksRef.current.has(mark)) {
          marksRef.current.add(mark)
          notify('onProgress', { episode: episodeNo, percent: mark, positionS: Math.floor(video.currentTime) })
        }
      }
    }
    const next = continueUrl(episode?.watchUrl || series.watchUrl, video.currentTime)
    setHref((value) => (value === next ? value : next))
  }

  const onEnded = (event) => {
    if (!isCurrent(event)) return
    notify('onComplete', {
      episode: episodeNo,
      durationS: Math.round(event.currentTarget.duration || episode?.durationS || 0),
    })
    // Variant d: the next free episode follows here, without a stop.
    if (inlineSeries && episode?.nextInline) {
      setEpisodeNo(episodeNo + 1)
      return
    }
    setStatus('ended')
    setBuffering(false)
    if (progressRef.current) progressRef.current.style.transform = 'scaleX(1)'
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
    setAutoIn(null)
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
  const hasNext = Boolean(episode?.nextUrl)

  // Variant c: the end of episode 1 starts the countdown to episode 2, only while the card is
  // on screen in a visible page. « Revoir » and « Rester ici » stop it.
  useEffect(() => {
    if (status !== 'ended' || !autoNext || !hasNext) {
      setAutoIn(null)
      return
    }
    if ((typeof document !== 'undefined' && document.hidden) || !inViewRef.current) return
    setAutoIn(DRAMA_AUTO_NEXT_SECONDS)
  }, [status, autoNext, hasNext])

  useEffect(() => {
    if (autoIn === null) return undefined
    if (autoIn > 0) {
      const timer = setTimeout(() => setAutoIn((value) => (value === null ? null : value - 1)), 1000)
      return () => clearTimeout(timer)
    }
    setAutoIn(null)
    if ((typeof document !== 'undefined' && document.hidden) || !inViewRef.current) return undefined
    const target = link(nextHref, 'auto_next')
    onLeave('auto_next')
    // Same tab (a script may not open a new one): the saved confirmation comes back with Back.
    safely(() => window.location.assign(target))
    return undefined
    // The countdown alone drives this; the link and the leave handler are read when it ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoIn])
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
        {poster && !hasFrame && <img className="os-drama-poster" src={poster} alt="" aria-hidden="true" decoding="async" />}
        <video
          ref={videoRef}
          className="os-drama-video"
          playsInline
          crossOrigin="anonymous"
          preload="metadata"
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
          onError={(event) => {
            // Only a MediaError fails the episode; WebKit also fires `error` here for other loads
            // (a refused poster) while the video keeps loading. Stalls are left to the timeout.
            if (isCurrent(event) && event.currentTarget.error) fail('video', mediaErrorDetails(event.currentTarget, srcRef.current))
          }}
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
            <span className="os-drama-badge">Épisode {episodeNo} · gratuit</span>
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
            <p>Fin de l’épisode {episodeNo}</p>
            {autoIn !== null && (
              <p className="os-drama-auto" role="status">L’épisode {episodeNo + 1} commence dans {Math.max(autoIn, 0)} s…</p>
            )}
            <a className="os-drama-next" href={link(nextHref, 'next')} target="_blank" rel="noopener" onClick={() => { setAutoIn(null); onLeave('next') }}>
              {hasNext ? `Épisode ${episodeNo + 1} sur BabiDrama` : 'Continuer sur BabiDrama'} <PlayIcon size={16} />
            </a>
            <button type="button" className="os-drama-replay" onClick={onReplay}><ReplayIcon size={18} />Revoir</button>
            {autoIn !== null && (
              <button type="button" className="os-drama-stay" onClick={() => { setAutoIn(null); notify('onInteract', 'stay') }}>Rester ici</button>
            )}
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
        {(!lateLink || ended || failed) && (
          <a
            className="os-drama-cta"
            href={ended ? link(nextHref, 'next') : link(href, failed ? 'fallback' : 'continue')}
            target="_blank"
            rel="noopener"
            onClick={() => { setAutoIn(null); onLeave(ended ? 'next' : failed ? 'fallback' : 'continue') }}
          >
            <PlayIcon size={18} /> {ctaLabel}
          </a>
        )}
        {free && <p className="os-drama-free">{free}</p>}
      </div>
    </>
  )
}

export default DramaPlayer
