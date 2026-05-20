const STORAGE_KEY = 'cod_checkout_customer_info_v1'
const MAX_ADDRESS_LENGTH = 200

const getDefaultStorage = () => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage || null
  } catch (error) {
    console.warn('checkout customer cache unavailable:', error)
    return null
  }
}

const normalizeText = (value) => String(value || '').trim()

export const normalizeCheckoutPhone = (value) => (
  String(value || '').replace(/\D/g, '').slice(0, 10)
)

const normalizeAddress = (value) => (
  String(value || '').trim().slice(0, MAX_ADDRESS_LENGTH)
)

const isValidName = (value) => normalizeText(value).length > 0
const isValidPhone = (value) => normalizeCheckoutPhone(value).length === 10
const isValidAddress = (value) => normalizeAddress(value).length >= 5

const safeReadJson = (storage) => {
  if (!storage) return null

  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    console.warn('checkout customer cache read failed:', error)
    return null
  }
}

const safeWriteJson = (storage, value) => {
  if (!storage) return false

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value))
    return true
  } catch (error) {
    console.warn('checkout customer cache write failed:', error)
    return false
  }
}

export const loadCheckoutCustomerInfo = (storage = getDefaultStorage()) => {
  const cached = safeReadJson(storage)
  if (!cached) return null

  const fullName = isValidName(cached.fullName) ? normalizeText(cached.fullName) : ''
  const phone = isValidPhone(cached.phone) ? normalizeCheckoutPhone(cached.phone) : ''
  const manualWhatsapp = isValidPhone(cached.whatsapp) ? normalizeCheckoutPhone(cached.whatsapp) : ''
  const addressDescription = isValidAddress(cached.addressDescription)
    ? normalizeAddress(cached.addressDescription)
    : ''
  const whatsappSameAsPhone = cached.whatsappSameAsPhone !== false || !manualWhatsapp
  const whatsapp = whatsappSameAsPhone ? phone : manualWhatsapp

  if (!fullName && !phone && !whatsapp && !addressDescription) {
    return null
  }

  return {
    fullName,
    phone,
    whatsapp,
    addressDescription,
    whatsappSameAsPhone
  }
}

export const saveCheckoutCustomerInfo = (customerInfo, storage = getDefaultStorage()) => {
  if (!customerInfo || typeof customerInfo !== 'object') return null

  const current = loadCheckoutCustomerInfo(storage) || {}
  const next = { ...current }

  if ('fullName' in customerInfo && isValidName(customerInfo.fullName)) {
    next.fullName = normalizeText(customerInfo.fullName)
  }

  if ('phone' in customerInfo && isValidPhone(customerInfo.phone)) {
    next.phone = normalizeCheckoutPhone(customerInfo.phone)
  }

  if ('addressDescription' in customerInfo && isValidAddress(customerInfo.addressDescription)) {
    next.addressDescription = normalizeAddress(customerInfo.addressDescription)
  }

  const phoneForWhatsapp = isValidPhone(customerInfo.phone)
    ? normalizeCheckoutPhone(customerInfo.phone)
    : next.phone

  if (customerInfo.whatsappSameAsPhone === true) {
    if (isValidPhone(phoneForWhatsapp)) {
      next.whatsappSameAsPhone = true
      next.whatsapp = normalizeCheckoutPhone(phoneForWhatsapp)
    }
  } else if (customerInfo.whatsappSameAsPhone === false) {
    if (isValidPhone(customerInfo.whatsapp)) {
      next.whatsappSameAsPhone = false
      next.whatsapp = normalizeCheckoutPhone(customerInfo.whatsapp)
    }
  } else if ('whatsapp' in customerInfo && isValidPhone(customerInfo.whatsapp)) {
    next.whatsapp = normalizeCheckoutPhone(customerInfo.whatsapp)
  }

  if (!next.fullName && !next.phone && !next.whatsapp && !next.addressDescription) {
    return null
  }

  const payload = {
    version: 1,
    ...next,
    updatedAt: new Date().toISOString()
  }

  return safeWriteJson(storage, payload) ? payload : null
}

export const CHECKOUT_CUSTOMER_INFO_STORAGE_KEY = STORAGE_KEY
