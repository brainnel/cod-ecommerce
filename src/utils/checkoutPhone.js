const CI_MOBILE_PREFIXES = ['01', '05', '07']

const PHONE_ERROR_MESSAGES = {
  length: 'Entrez un numéro ivoirien à 10 chiffres.',
  prefix: 'Le numéro doit commencer par 01, 05 ou 07.',
  suspicious: 'Entrez un numéro valide pour que le livreur puisse vous appeler.'
}

export const normalizeCheckoutPhone = (value) => {
  let digits = String(value || '').replace(/\D/g, '')

  if (digits.startsWith('00225')) {
    digits = digits.slice(5)
  } else if (digits.startsWith('225')) {
    digits = digits.slice(3)
  }

  return digits.slice(0, 10)
}

const hasValidCiMobilePrefix = (phone) => (
  CI_MOBILE_PREFIXES.some(prefix => phone.startsWith(prefix))
)

const isSequentialPhone = (phone) => (
  phone === '0123456789' || phone === '1234567890' || phone === '9876543210'
)

const isSuspiciousPhone = (phone) => {
  if (/^(\d)\1+$/.test(phone) || isSequentialPhone(phone)) return true

  const digitCounts = phone.split('').reduce((counts, digit) => {
    counts[digit] = (counts[digit] || 0) + 1
    return counts
  }, {})

  return Math.max(...Object.values(digitCounts)) >= 8
}

export const validateCheckoutPhone = (value, options = {}) => {
  const {
    required = true,
    requiredMessage = 'Le numéro de téléphone est requis'
  } = options
  const normalized = normalizeCheckoutPhone(value)

  if (!normalized) {
    return {
      isValid: !required,
      normalized,
      error: required ? requiredMessage : ''
    }
  }

  if (normalized.length !== 10) {
    return { isValid: false, normalized, error: PHONE_ERROR_MESSAGES.length }
  }

  if (!hasValidCiMobilePrefix(normalized)) {
    return { isValid: false, normalized, error: PHONE_ERROR_MESSAGES.prefix }
  }

  if (isSuspiciousPhone(normalized)) {
    return { isValid: false, normalized, error: PHONE_ERROR_MESSAGES.suspicious }
  }

  return { isValid: true, normalized, error: '' }
}

export const isValidCheckoutPhone = (value) => validateCheckoutPhone(value).isValid
