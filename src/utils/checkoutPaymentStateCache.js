const CHECKOUT_PAYMENT_STATE_KEY = 'cod_checkout_payment_state_v1'
const CHECKOUT_PAYMENT_STATE_TTL_MS = 2 * 60 * 60 * 1000

const getSessionStorage = () => {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const isUsablePaymentState = (state) => (
  Boolean(state?.product || state?.bundle)
)

export const saveCheckoutPaymentState = (state, storage = getSessionStorage()) => {
  if (!storage || !isUsablePaymentState(state)) return

  try {
    storage.setItem(CHECKOUT_PAYMENT_STATE_KEY, JSON.stringify({
      savedAt: Date.now(),
      state
    }))
  } catch {
    // Best-effort recovery cache only. Checkout must never depend on this.
  }
}

export const loadCheckoutPaymentState = (storage = getSessionStorage()) => {
  if (!storage) return null

  try {
    const rawValue = storage.getItem(CHECKOUT_PAYMENT_STATE_KEY)
    if (!rawValue) return null

    const parsed = JSON.parse(rawValue)
    const savedAt = Number(parsed?.savedAt || 0)
    if (!savedAt || Date.now() - savedAt > CHECKOUT_PAYMENT_STATE_TTL_MS) {
      storage.removeItem(CHECKOUT_PAYMENT_STATE_KEY)
      return null
    }

    return isUsablePaymentState(parsed?.state) ? parsed.state : null
  } catch {
    try {
      storage.removeItem(CHECKOUT_PAYMENT_STATE_KEY)
    } catch {
      // Ignore storage cleanup failures.
    }
    return null
  }
}

export const clearCheckoutPaymentState = (storage = getSessionStorage()) => {
  if (!storage) return
  try {
    storage.removeItem(CHECKOUT_PAYMENT_STATE_KEY)
  } catch {
    // Ignore storage cleanup failures.
  }
}
