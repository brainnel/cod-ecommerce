// Keep this experiment independent of the historical quantity-flow assignment.
// One bucket per device prevents form and product treatments from overlapping.
export const CHECKOUT_OPTIMIZATION_EXPERIMENT = 'cod_opt_20261104_v1'
// Keep the original hash salt and buckets. Only former baseline buckets 40–59
// join form treatment in this stage; all existing experiment arms stay put.
export const CHECKOUT_OPTIMIZATION_STAGE = 'form30_20261109'
export const CHECKOUT_OPTIMIZATION_ENABLED = import.meta.env?.VITE_CHECKOUT_OPTIMIZATION_ENABLED !== 'false'
const PREVIEW_KEY = `${CHECKOUT_OPTIMIZATION_EXPERIMENT}:preview`
const GROUPS = ['form_guidance_treatment', 'form_guidance_control', 'product_clarity_treatment', 'product_clarity_control', 'baseline']

// Verified against current catalog content_fr on 2026-11-04. No price, discount,
// testimonial, or unverified performance promise is introduced here.
export const PRODUCT_CLARITY_COPY = Object.freeze({
  '900005131392': Object.freeze({
    headline: 'Agrandissez l’image de votre téléphone.',
    detail: 'Loupe optique 10 pouces · Téléphone non inclus.'
  }),
  '814052017850': Object.freeze({
    headline: 'Préparez vos légumes à la main.',
    detail: '5 lames en acier inoxydable · Protège-main inclus.'
  }),
  '1001848042840': Object.freeze({
    headline: 'Dessinez les détails de votre nail art.',
    detail: '24 couleurs · Feutres à double pointe.'
  })
})

export const getCheckoutOptimizationBucket = (deviceId) => {
  if (typeof deviceId !== 'string' || !deviceId.trim()) return null
  const text = `${CHECKOUT_OPTIMIZATION_EXPERIMENT}:${deviceId}`
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 100
}

const previewGroup = (hostname, search, storage) => {
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)) return null
  try {
    const requested = new URLSearchParams(search).get('checkout_optimization_group')
    if (GROUPS.includes(requested)) {
      try { storage?.setItem(PREVIEW_KEY, requested) } catch { /* Preview storage is optional. */ }
      return requested
    }
    const cached = storage?.getItem(PREVIEW_KEY)
    return GROUPS.includes(cached) ? cached : null
  } catch { return null }
}

export const getCheckoutOptimizationAssignment = ({
  deviceId,
  productId,
  hostname = typeof window === 'undefined' ? '' : window.location?.hostname || '',
  search = typeof window === 'undefined' ? '' : window.location?.search || '',
  storage,
  enabled = CHECKOUT_OPTIMIZATION_ENABLED
} = {}) => {
  let previewStorage = storage
  if (previewStorage === undefined && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)) {
    try { previewStorage = window.sessionStorage } catch { /* Unavailable storage must not block checkout. */ }
  }
  const bucket = getCheckoutOptimizationBucket(deviceId)
  const override = enabled ? previewGroup(hostname, search, previewStorage) : null
  const group = !enabled ? 'baseline' : override || (bucket === null ? 'baseline'
    : bucket < 10 ? 'form_guidance_treatment'
    : bucket < 20 ? 'form_guidance_control'
    : bucket < 30 ? 'product_clarity_treatment'
    : bucket < 40 ? 'product_clarity_control'
    : bucket < 60 ? 'form_guidance_treatment' : 'baseline')
  const productEligible = Object.hasOwn(PRODUCT_CLARITY_COPY, String(productId ?? ''))
  const formGuidanceEnabled = enabled && group === 'form_guidance_treatment'
  const productClarityEnabled = enabled && productEligible && group === 'product_clarity_treatment'
  return {
    experiment: CHECKOUT_OPTIMIZATION_EXPERIMENT,
    stage: CHECKOUT_OPTIMIZATION_STAGE,
    group, bucket, productEligible, formGuidanceEnabled, productClarityEnabled,
    analyticsProps: {
      checkout_optimization_experiment: CHECKOUT_OPTIMIZATION_EXPERIMENT,
      checkout_optimization_stage: CHECKOUT_OPTIMIZATION_STAGE,
      checkout_optimization_group: group,
      checkout_optimization_bucket: bucket,
      checkout_optimization_enabled: Boolean(enabled),
      checkout_optimization_preview: Boolean(override),
      form_guidance_assigned: formGuidanceEnabled,
      product_clarity_eligible: productEligible,
      product_clarity_assigned: productClarityEnabled
    }
  }
}

export const getProductClarityCopy = (productId) => Object.hasOwn(PRODUCT_CLARITY_COPY, String(productId ?? ''))
  ? PRODUCT_CLARITY_COPY[String(productId)] : null
