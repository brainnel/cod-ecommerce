// Quantity-discount experiment (件数优化, selection platform). Contract:
// output/quantity-discount-modal/CONTRACT.md.
//
// The product detail API returns `qty_offer` while an offer runs for the product:
//   { id: 7, weight_b: 50, tiers: [{ qty: 2, pct: 10 }, { qty: 3, pct: 15 }] }
// Arm A keeps today's checkout. Arm B sees the quantity popup after Commander, and the
// checkout page and the order use the offer prices (the server prices the order again).
//
// A device always gets the same arm of one offer: the bucket is a hash of the offer id and
// the device id with its own salt. Anything unexpected in the payload means "no offer".

const SALT = 'qo'
const MAX_PCT = 60
const STORAGE_KEY = 'cod_qty_offer_arms_v1'
const MAX_STORED_PRODUCTS = 40

const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

// Returns { id, weight_b, tiers: [{ qty: 2, pct }, { qty: 3, pct }] } or null.
export const normalizeQtyOffer = (raw) => {
  try {
    if (!isPlainObject(raw)) return null
    const { id, weight_b: weightB, tiers } = raw
    if (!isInt(id, 1, Number.MAX_SAFE_INTEGER) || !isInt(weightB, 0, 100)) return null
    if (!Array.isArray(tiers) || tiers.length !== 2) return null
    const [two, three] = tiers
    if (!isPlainObject(two) || !isPlainObject(three)) return null
    if (two.qty !== 2 || three.qty !== 3) return null
    if (!isInt(two.pct, 0, MAX_PCT) || !isInt(three.pct, 0, MAX_PCT)) return null
    return { id, weight_b: weightB, tiers: [{ qty: 2, pct: two.pct }, { qty: 3, pct: three.pct }] }
  } catch {
    return null
  }
}

export const getQtyOfferBucket = (id, deviceId) => {
  if (!Number.isInteger(id) || id <= 0) return null
  if (typeof deviceId !== 'string' || !deviceId.trim()) return null
  const text = `${SALT}:${id}:${deviceId}`
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 100
}

// Returns { id, arm: 'A' | 'B', bucket } or null.
export const pickQtyOfferArm = ({ offer, deviceId } = {}) => {
  try {
    const normalized = normalizeQtyOffer(offer)
    if (!normalized) return null
    const bucket = getQtyOfferBucket(normalized.id, deviceId)
    if (bucket === null) return null
    return { id: normalized.id, arm: bucket < 100 - normalized.weight_b ? 'A' : 'B', bucket }
  } catch {
    return null
  }
}

export const qtyOfferPct = (quantity, offer) => {
  const normalized = normalizeQtyOffer(offer)
  if (!normalized || !Number.isInteger(quantity) || quantity <= 1) return 0
  return quantity === 2 ? normalized.tiers[0].pct : normalized.tiers[1].pct
}

// unit(q) = floor((base * (100 - pct(q)) + 5000) / 10000) * 100: nearest 100 FCFA, half up.
// Without a usable offer the base price is returned unchanged.
export const qtyOfferUnitPrice = (base, quantity, offer) => {
  if (!normalizeQtyOffer(offer) || !Number.isSafeInteger(base) || base <= 0) return base
  const pct = qtyOfferPct(quantity, offer)
  return Math.floor((base * (100 - pct) + 5000) / 10000) * 100
}

const isArmInfo = (value) => (
  isPlainObject(value)
  && isInt(value.id, 1, Number.MAX_SAFE_INTEGER)
  && (value.arm === 'A' || value.arm === 'B')
  && isInt(value.bucket, 0, 99)
)

// Money on the single-product checkout path. With no offer, arm A or anything unusable this
// is exactly today's computation (product.price, product.price * quantity); offerId is set
// only for arm B, and is what the order sends as qty_offer_id.
export const getCheckoutPricing = (product, quantity, armInfo) => {
  const today = {
    unitPrice: product?.price,
    total: product?.price * quantity,
    fullTotal: product?.price * quantity,
    saved: 0,
    pct: 0,
    offerId: null
  }
  try {
    if (!isArmInfo(armInfo) || armInfo.arm !== 'B') return today
    const offer = normalizeQtyOffer(product?.qty_offer)
    if (!offer || offer.id !== armInfo.id) return today
    const base = Number(product.price)
    if (!Number.isSafeInteger(base) || base <= 0 || !Number.isInteger(quantity) || quantity < 1) return today
    const unitPrice = qtyOfferUnitPrice(base, quantity, offer)
    const total = unitPrice * quantity
    const fullTotal = base * quantity
    return {
      unitPrice,
      total,
      fullTotal,
      saved: fullTotal - total,
      pct: qtyOfferPct(quantity, offer),
      offerId: offer.id
    }
  } catch {
    return today
  }
}

// The two properties of section 6 of the contract, or {} when no offer applies.
export const qtyOfferEventProperties = (armInfo) => (
  isArmInfo(armInfo) ? { qo_exp: armInfo.id, qo_var: armInfo.arm } : {}
)

// ------------------------------------------- the arm a product page fixed for this visit
// trackCheckoutEvent only knows the product id, so the product page keeps its assignment
// per product id: in this module and in sessionStorage (a reload of /payment keeps it).
// `null` is kept too: the visit was reported without an offer and stays without one.

const remembered = new Map()

const getSessionStorage = () => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage || null
  } catch {
    return null
  }
}

const productKey = (productId) => (
  productId === null || productId === undefined || String(productId).trim() === '' ? null : String(productId)
)

const readStored = (storage) => {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}')
    return isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const copyArm = (value) => (isArmInfo(value) ? { id: value.id, arm: value.arm, bucket: value.bucket } : null)

export const rememberQtyOfferArm = (productId, armInfo, storage = getSessionStorage()) => {
  const key = productKey(productId)
  if (!key) return
  const value = copyArm(armInfo)
  remembered.set(key, value)
  if (!storage) return
  try {
    const stored = readStored(storage)
    delete stored[key]
    stored[key] = value
    const keys = Object.keys(stored)
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_STORED_PRODUCTS))) delete stored[old]
    storage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Best effort: the module copy still serves this page load.
  }
}

// undefined: nothing kept for the product; null: kept without an offer; else { id, arm, bucket }.
export const recallQtyOfferArm = (productId, storage = getSessionStorage()) => {
  const key = productKey(productId)
  if (!key) return undefined
  if (remembered.has(key)) return remembered.get(key)
  const stored = readStored(storage)
  if (!Object.hasOwn(stored, key)) return undefined
  const value = copyArm(stored[key])
  remembered.set(key, value)
  return value
}

// The checkout page's arm: the one the product page kept for this product, else the one the
// offer carried in the product gives this device (the same pick the product page makes).
export const resolveQtyOfferArm = ({ productId, offer, deviceId, storage = getSessionStorage() } = {}) => {
  const kept = recallQtyOfferArm(productId, storage)
  if (kept === null) return null
  const picked = pickQtyOfferArm({ offer, deviceId })
  if (picked) rememberQtyOfferArm(productId, picked, storage)
  return picked
}

// Tests only: forget the module copy (sessionStorage is the caller's).
export const resetRememberedQtyOfferArms = () => remembered.clear()
