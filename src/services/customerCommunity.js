import { parseCustomerCommunityGroups } from '../config/customerCommunity.js'

// This optional enhancement must never block the order confirmation page.
// Keep only the current page's last validated pool; [] intentionally clears it.
export const startCustomerCommunitySync = ({
  url,
  onGroups,
  fetchImpl = globalThis.fetch,
  eventTarget = globalThis.window,
  visibilityTarget = globalThis.document,
  timers = globalThis,
  intervalMs = 60_000,
  timeoutMs = 5_000,
}) => {
  let disposed = false
  let request = null

  const refresh = async () => {
    if (disposed || request || visibilityTarget?.visibilityState === 'hidden') return
    const controller = new AbortController()
    request = controller
    const timeout = timers.setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url, {
        method: 'GET', credentials: 'omit', cache: 'no-store',
        headers: { Accept: 'application/json' }, signal: controller.signal,
      })
      if (!response.ok) throw new Error('Community configuration unavailable')
      const groups = parseCustomerCommunityGroups(await response.json())
      if (!disposed && !controller.signal.aborted) onGroups(groups)
    } catch {
      // A transient network/config error retains the last valid in-page pool.
      // On first load there is no pool, so only the optional CTA stays hidden.
    } finally {
      timers.clearTimeout(timeout)
      if (request === controller) request = null
    }
  }

  const onVisible = () => { if (visibilityTarget?.visibilityState !== 'hidden') void refresh() }
  eventTarget?.addEventListener('focus', onVisible)
  visibilityTarget?.addEventListener('visibilitychange', onVisible)
  const interval = timers.setInterval(onVisible, intervalMs)
  void refresh()

  return {
    refresh,
    stop: () => {
      disposed = true
      request?.abort()
      timers.clearInterval(interval)
      eventTarget?.removeEventListener('focus', onVisible)
      visibilityTarget?.removeEventListener('visibilitychange', onVisible)
    },
  }
}
