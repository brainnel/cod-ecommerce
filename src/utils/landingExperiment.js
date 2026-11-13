// Landing-page A/B experiments (Landing Lab, selection platform).
//
// The product detail API returns `lp_experiment` while an experiment runs for the product:
//   { id: 12, variants: [{ key: 'A', weight: 50 },
//                        { key: 'B', weight: 50, image_url: [...], description_fr: [...] }] }
// Variant A is the product's own images. Variant B replaces the carousel (`image_url`) and the
// detail images (`description_fr`) on the landing page only; its first image is the product's
// own first image, so checkout, the order and every other page keep using the stored product.
//
// A device always gets the same variant of one experiment: the bucket is a hash of the
// experiment id and the device id, with its own salt, independent of the other rollouts.
// Anything unexpected in the payload means "no experiment" and the page shows the product as is.

const SALT = 'lp'
const MAX_IMAGES = 12

export const getLandingExperimentBucket = (experimentId, deviceId) => {
  if (!Number.isInteger(experimentId) || experimentId <= 0) return null
  if (typeof deviceId !== 'string' || !deviceId.trim()) return null
  const text = `${SALT}:${experimentId}:${deviceId}`
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 100
}

const isUrlList = (value, { allowEmpty = false } = {}) => (
  Array.isArray(value)
  && value.length <= MAX_IMAGES
  && (allowEmpty || value.length > 0)
  && value.every((item) => typeof item === 'string' && item.startsWith('https://'))
)

const isWeight = (value) => Number.isInteger(value) && value >= 0 && value <= 100

// Returns { id, key: 'A' | 'B', bucket, imageUrl, descriptionFr } or null.
// For 'A' the two lists are null: the caller keeps the product's own lists.
export const pickLandingVariant = ({ experiment, deviceId } = {}) => {
  try {
    if (!experiment || typeof experiment !== 'object') return null
    const { id, variants } = experiment
    if (!Array.isArray(variants) || variants.length !== 2) return null
    const [a, b] = variants
    if (a?.key !== 'A' || b?.key !== 'B') return null
    if (!isWeight(a.weight) || !isWeight(b.weight) || a.weight + b.weight !== 100) return null
    if (!isUrlList(b.image_url) || !isUrlList(b.description_fr, { allowEmpty: true })) return null

    const bucket = getLandingExperimentBucket(id, deviceId)
    if (bucket === null) return null
    if (bucket < a.weight) return { id, key: 'A', bucket, imageUrl: null, descriptionFr: null }
    return { id, key: 'B', bucket, imageUrl: b.image_url, descriptionFr: b.description_fr }
  } catch {
    return null
  }
}

// The two properties reported on product_landing_view, or {} when no experiment applies.
export const landingVariantEventProperties = (variant) => (
  variant && Number.isInteger(variant.id) && (variant.key === 'A' || variant.key === 'B')
    ? { lp_exp: variant.id, lp_var: variant.key }
    : {}
)
