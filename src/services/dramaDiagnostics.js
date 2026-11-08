// Diagnostics for the order-success BabiDrama player's play errors.
// Analytics only: nothing here changes playback, and nothing may throw.

// What the browser says when the <video> refuses the episode (iOS fails here while
// Android plays; the message names the cause). The signed URL itself is never
// tracked, only its host; `url` is used once for a diagnostic probe.
export const mediaErrorDetails = (video, url) => {
  const error = video?.error
  let host = null
  try { host = url ? new URL(url).host : null } catch { host = null }
  return {
    error_code: error?.code ?? null,
    error_message: error?.message ? String(error.message).slice(0, 200) : null,
    network_state: video?.networkState ?? null,
    ready_state: video?.readyState ?? null,
    media_host: host,
    url,
  }
}

export const probeMedia = async (url, { fetchImpl = globalThis.fetch, timeoutMs = 4000 } = {}) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = setTimeout(() => controller?.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Range: 'bytes=0-1' },
      signal: controller?.signal,
    })
    return {
      probe_status: response.status,
      probe_type: response.type,
      probe_acao: response.headers?.get?.('access-control-allow-origin') ?? null,
      probe_content_type: response.headers?.get?.('content-type') ?? null,
    }
  } catch (error) {
    return { probe_error: `${error?.name || 'Error'}: ${String(error?.message || '').slice(0, 160)}` }
  } finally {
    clearTimeout(timer)
  }
}

// Seconds of the episode buffered from its start (0 when nothing arrived yet).
export const bufferedSeconds = (video) => {
  try {
    const ranges = video?.buffered
    if (!ranges || ranges.length === 0) return 0
    return Math.round(ranges.end(0) * 10) / 10
  } catch {
    return null
  }
}

// What the browser reports about the connection (Android Chrome and WebViews; absent on iOS).
export const networkDetails = (nav = typeof navigator === 'undefined' ? null : navigator) => {
  const connection = nav?.connection || nav?.mozConnection || nav?.webkitConnection
  if (!connection) return {}
  return {
    net_type: connection.effectiveType ?? null,
    net_downlink_mbps: typeof connection.downlink === 'number' ? connection.downlink : null,
    net_rtt_ms: typeof connection.rtt === 'number' ? connection.rtt : null,
    net_save_data: typeof connection.saveData === 'boolean' ? connection.saveData : null,
  }
}
