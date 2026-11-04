// Read-only region loading. Never make order creation depend on telemetry.
export const DISTRICT_LIST_CACHE_KEY = 'cod_checkout_district_list_v1'
export const DISTRICT_LIST_TTL_MS = 6 * 60 * 60 * 1000

export const validateDistrictCities = (data) => {
  if (!Array.isArray(data) || !data.length || data.length > 100) throw new Error('invalid_district_list')
  const ids = new Set()
  const cities = data.map(city => {
    if (!Number.isSafeInteger(Number(city?.id)) || Number(city.id) <= 0 || typeof city.name !== 'string' || !city.name.trim()
      || !Array.isArray(city.districts) || city.districts.length > 200) throw new Error('invalid_district_list')
    const districts = city.districts.map(row => {
      const id = Number(row?.id), lat = Number(row?.latitude), lng = Number(row?.longitude)
      if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id) || typeof row.name !== 'string' || !row.name.trim()
        || row.latitude == null || row.longitude == null || row.latitude === '' || row.longitude === ''
        || !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) throw new Error('invalid_district_list')
      ids.add(id)
      return { id, name: row.name.trim(), display_name: typeof row.display_name === 'string' ? row.display_name : row.name.trim(), latitude: lat, longitude: lng }
    })
    return { id: Number(city.id), name: city.name.trim(), districts }
  })
  if (!ids.size) throw new Error('invalid_district_list')
  return cities
}

export const flattenDistrictCities = cities => cities.flatMap(city => city.districts.map(district => ({
  ...district, city_id: city.id, city_name: city.name, all_city_districts: city.districts
})))

export const readDistrictCache = (storage, now = Date.now()) => {
  try {
    const entry = JSON.parse(storage?.getItem(DISTRICT_LIST_CACHE_KEY) || 'null')
    if (!entry || !Number.isFinite(entry.savedAt) || now < entry.savedAt || now - entry.savedAt > DISTRICT_LIST_TTL_MS) return null
    return validateDistrictCities(entry.cities)
  } catch { return null }
}

const pause = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new Error('cancelled')); return }
  const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve() }, ms)
  function cancel() { clearTimeout(timer); reject(new Error('cancelled')) }
  signal?.addEventListener('abort', cancel, { once: true })
})

export const loadCheckoutDistricts = async ({ url, fetcher = globalThis.fetch, storage, signal,
  onState, onEvent = () => {}, timeoutMs = 6000, retryDelayMs = 500, now = () => Date.now() }) => {
  const cached = readDistrictCache(storage, now())
  const emit = state => { if (!signal?.aborted) onState(state) }
  const event = (name, props) => { try { if (!signal?.aborted) onEvent(name, props) } catch { /* best effort */ } }
  emit({ cities: [], loading: true, source: 'none', error: false })
  const started = now()
  for (let attempt = 1; attempt <= 2 && !signal?.aborted; attempt++) {
    const controller = new AbortController()
    const cancel = () => controller.abort()
    signal?.addEventListener('abort', cancel, { once: true })
    let timer
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('district_timeout')) }, timeoutMs)
      })
      const request = async () => {
        const response = await fetcher(url, { signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json' } })
        if (!response.ok) throw new Error('district_http_error')
        return validateDistrictCities(await response.json())
      }
      const cities = await Promise.race([request(), timeout])
      if (signal?.aborted) return
      try { storage?.setItem(DISTRICT_LIST_CACHE_KEY, JSON.stringify({ savedAt: now(), cities })) } catch { /* optional cache */ }
      emit({ cities, loading: false, source: 'network', error: false })
      event('district_list_loaded', { attempt, duration_ms: Math.max(0, now() - started) })
      return
    } catch (error) {
      if (signal?.aborted) return
      event('district_list_load_failed', { attempt, reason: ['invalid_district_list', 'district_timeout', 'district_http_error'].includes(error.message) ? error.message : 'network_error', has_valid_cache: Boolean(cached) })
      if (attempt === 1 && cached) {
        emit({ cities: cached, loading: true, source: 'cache', error: true })
        event('district_list_cache_used', {})
      }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
    }
    if (attempt < 2) { try { await pause(retryDelayMs, signal) } catch { return } }
  }
  emit({ cities: cached || [], loading: false, source: cached ? 'cache' : 'none', error: true })
}
