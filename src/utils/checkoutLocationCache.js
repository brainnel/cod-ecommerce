const STORAGE_KEY = 'cod_checkout_location_v1'

const getDefaultStorage = () => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage || null
  } catch (error) {
    console.warn('checkout location cache unavailable:', error)
    return null
  }
}

const normalizeLabel = (value) => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
)

const normalizeText = (value) => String(value || '').trim()

const normalizeId = (value) => {
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

const normalizeCoordinate = (value) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeMarkerLabel = (value) => normalizeText(value).slice(0, 120)

const isValidMarker = (marker) => {
  if (!marker || typeof marker !== 'object') return false
  const lat = normalizeCoordinate(marker.lat)
  const lng = normalizeCoordinate(marker.lng)
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

const safeReadJson = (storage) => {
  if (!storage) return null

  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    console.warn('checkout location cache read failed:', error)
    return null
  }
}

const safeWriteJson = (storage, value) => {
  if (!storage) return false

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value))
    return true
  } catch (error) {
    console.warn('checkout location cache write failed:', error)
    return false
  }
}

export const buildCheckoutDistrictCacheKey = (district) => {
  if (!district || typeof district !== 'object') return ''

  const districtId = normalizeId(district.districtId ?? district.id)
  const cityId = normalizeId(district.cityId ?? district.city_id)
  const displayName = normalizeLabel(
    district.displayName || district.display_name || district.name
  )
  const districtName = normalizeLabel(district.districtName || district.name)

  if (districtId || cityId || displayName || districtName) {
    return [cityId, districtId, displayName || districtName].join('|')
  }

  return ''
}

export const buildCheckoutDistrictCacheEntry = (district) => {
  if (!district || typeof district !== 'object') return null

  const displayName = normalizeText(
    district.displayName || district.display_name || district.name
  )
  const districtName = normalizeText(district.districtName || district.name)
  const cityName = normalizeText(district.cityName || district.city_name)
  const districtId = normalizeId(district.districtId ?? district.id)
  const cityId = normalizeId(district.cityId ?? district.city_id)
  const cacheKey = buildCheckoutDistrictCacheKey({
    districtId,
    districtName,
    displayName,
    cityId
  })

  if (!cacheKey || !displayName) return null

  return {
    cacheKey,
    districtId,
    districtName,
    displayName,
    cityId,
    cityName
  }
}

const normalizeDistrictEntry = (entry) => {
  const normalized = buildCheckoutDistrictCacheEntry(entry)
  return normalized ? {
    ...normalized,
    updatedAt: normalizeText(entry?.updatedAt)
  } : null
}

const normalizeManualMarkerEntry = (entry) => {
  if (!entry || entry.source !== 'manual' || !isValidMarker(entry)) return null

  const district = normalizeDistrictEntry(entry.district)
  if (!district) return null

  return {
    source: 'manual',
    lat: normalizeCoordinate(entry.lat),
    lng: normalizeCoordinate(entry.lng),
    label: normalizeMarkerLabel(entry.label),
    placeId: normalizeText(entry.placeId),
    district,
    updatedAt: normalizeText(entry.updatedAt)
  }
}

export const loadCheckoutLocationMemory = (storage = getDefaultStorage()) => {
  const cached = safeReadJson(storage)
  if (!cached) return null

  const lastDistrict = normalizeDistrictEntry(cached.lastDistrict)
  const manualMarker = normalizeManualMarkerEntry(cached.manualMarker)

  if (!lastDistrict && !manualMarker) return null

  return {
    lastDistrict,
    manualMarker
  }
}

export const saveCheckoutLocationMemory = (locationMemory, storage = getDefaultStorage()) => {
  if (!locationMemory || typeof locationMemory !== 'object') return null

  const current = loadCheckoutLocationMemory(storage) || {}
  const now = new Date().toISOString()
  const next = { ...current }

  if ('lastDistrict' in locationMemory) {
    const lastDistrict = buildCheckoutDistrictCacheEntry(locationMemory.lastDistrict)
    if (lastDistrict) {
      next.lastDistrict = {
        ...lastDistrict,
        updatedAt: now
      }
    }
  }

  if ('manualMarker' in locationMemory) {
    const marker = locationMemory.manualMarker
    const district = buildCheckoutDistrictCacheEntry(marker?.district)
    if (district && isValidMarker(marker) && marker.source === 'manual') {
      next.manualMarker = {
        source: 'manual',
        lat: normalizeCoordinate(marker.lat),
        lng: normalizeCoordinate(marker.lng),
        label: normalizeMarkerLabel(marker.label),
        placeId: normalizeText(marker.placeId),
        district,
        updatedAt: now
      }
    }
  }

  if (!next.lastDistrict && !next.manualMarker) return null

  const payload = {
    version: 1,
    ...next,
    updatedAt: now
  }

  return safeWriteJson(storage, payload) ? payload : null
}

export const isSameCheckoutDistrict = (district, cachedDistrict) => {
  const districtKey = buildCheckoutDistrictCacheKey(district)
  const cachedKey = buildCheckoutDistrictCacheKey(cachedDistrict)
  return Boolean(districtKey && cachedKey && districtKey === cachedKey)
}

export const getCachedManualMarkerForDistrict = (district, locationMemory) => {
  const manualMarker = locationMemory?.manualMarker
  if (!manualMarker || !isSameCheckoutDistrict(district, manualMarker.district)) return null

  return {
    lat: manualMarker.lat,
    lng: manualMarker.lng,
    label: manualMarker.label || '',
    placeId: manualMarker.placeId || ''
  }
}

export const CHECKOUT_LOCATION_STORAGE_KEY = STORAGE_KEY
