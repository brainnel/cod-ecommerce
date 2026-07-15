const MIN_ADDRESS_LENGTH = 5

const INVALID_ADDRESS_MESSAGE = 'Indiquez une adresse de livraison claire : quartier et repère connu.'
const SHORT_ADDRESS_MESSAGE = 'Ajoutez au moins 5 caractères : quartier ou repère connu.'

const NOISE_PHRASES = new Set([
  'allo',
  'aucun',
  'bonjour',
  'bonne journee',
  'bonsoir',
  'bjr',
  'bsr',
  'coucou',
  'hello',
  'je ne sais pas',
  'jsp',
  'lol',
  'mdr',
  'merci',
  'merci beaucoup',
  'neant',
  'non',
  'ok',
  'okay',
  'oui',
  'ras',
  'rien',
  'salut',
  'test'
])

const NOISE_WORDS = new Set([
  'aucun', 'bonjour', 'bonsoir', 'bjr', 'bsr', 'hello', 'merci', 'neant',
  'non', 'ok', 'okay', 'oui', 'ras', 'rien', 'salut', 'test'
])

const KEYBOARD_GIBBERISH = new Set([
  'abcde',
  'abcdef',
  'abcdefgh',
  'asdfgh',
  'azert',
  'azerty',
  'azertyuiop',
  'blabla',
  'hahaha',
  'lalala',
  'qwert',
  'qwerty',
  'qwertyuiop'
])

export const normalizeCheckoutAddressText = (value) => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
)

const addressWords = (value) => normalizeCheckoutAddressText(value).split(' ').filter(Boolean)

const isRepeatedPattern = (compact) => {
  if (compact.length < 3) return false
  if (/^(.)\1{2,}$/.test(compact)) return true
  if (/^(.{1,3})\1{2,}$/.test(compact)) return true
  return KEYBOARD_GIBBERISH.has(compact)
}

export const validateCheckoutAddress = (value, context = {}) => {
  const raw = String(value || '').trim()
  const normalized = normalizeCheckoutAddressText(raw)
  const words = addressWords(raw)
  const compact = words.join('')
  const fullName = normalizeCheckoutAddressText(context.fullName)
  const phoneDigits = String(context.phone || '').replace(/\D/g, '')
  const addressDigits = raw.replace(/\D/g, '')

  if (!raw) {
    return { isValid: false, reason: 'required', error: SHORT_ADDRESS_MESSAGE }
  }

  if (!normalized) {
    return { isValid: false, reason: 'symbols_only', error: INVALID_ADDRESS_MESSAGE }
  }

  if (compact.length < MIN_ADDRESS_LENGTH) {
    return { isValid: false, reason: 'too_short', error: SHORT_ADDRESS_MESSAGE }
  }

  if (/[\w.+-]+@[\w.-]+(?:\.[a-z]{2,})?/i.test(raw) || raw.includes('@')) {
    return { isValid: false, reason: 'email_or_handle', error: INVALID_ADDRESS_MESSAGE }
  }

  if (/(?:https?:\/\/|www\.|wa\.me\/|facebook\.com|instagram\.com|tiktok\.com)/i.test(raw) || /^[@#][a-z0-9_.-]+$/i.test(raw)) {
    return { isValid: false, reason: 'url_or_social', error: INVALID_ADDRESS_MESSAGE }
  }

  if (phoneDigits.length >= 6 && addressDigits === phoneDigits && !/[a-z]/i.test(raw)) {
    return { isValid: false, reason: 'same_as_phone', error: INVALID_ADDRESS_MESSAGE }
  }

  if (/^[\d\s+().,/#-]+$/.test(raw)) {
    return { isValid: false, reason: 'numbers_only', error: INVALID_ADDRESS_MESSAGE }
  }

  if (fullName && normalized === fullName) {
    return { isValid: false, reason: 'same_as_name', error: INVALID_ADDRESS_MESSAGE }
  }

  if (isRepeatedPattern(compact)) {
    return { isValid: false, reason: 'repeated_or_gibberish', error: INVALID_ADDRESS_MESSAGE }
  }

  if (NOISE_PHRASES.has(normalized) || (words.length > 0 && words.every(word => NOISE_WORDS.has(word)))) {
    return { isValid: false, reason: 'greeting_or_noise', error: INVALID_ADDRESS_MESSAGE }
  }

  return { isValid: true, reason: '', error: '' }
}

export const isValidCheckoutAddress = (value, context = {}) => (
  validateCheckoutAddress(value, context).isValid
)
