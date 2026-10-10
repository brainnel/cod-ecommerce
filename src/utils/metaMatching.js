// First-party matching only. Never fetch an IP or block checkout on this module.
export const META_MATCHING_VERSION = '20261010.1'
const STORAGE_KEY = 'brainnel_meta_click_v1'
const MAX_AGE_MS = 90 * 86400 * 1000
const CLICK_RE = /^[A-Za-z0-9_-]+$/
const memoryFbcs = new WeakMap()
let sequence = 0

export const validFbc = (value) => typeof value === 'string' && value.length <= 4096 &&
  /^fb\.\d+\.\d{13}\.[A-Za-z0-9_-]+$/.test(value)

export const validFbp = (value) => typeof value === 'string' &&
  /^fb\.\d+\.\d{13}\.\d+$/.test(value) && value.length <= 256

const cookieValues = (documentLike, name) => {
  try {
    return documentLike.cookie.split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`))
      .map(part => { try { return decodeURIComponent(part.slice(name.length + 1)) } catch { return '' } })
  } catch { return [] }
}

export const collectMetaMatching = (env = globalThis, now = Date.now()) => {
  const documentLike = env.document
  let source = 'none'
  let click = null
  let stored = null
  let captured = null
  try { click = new URL(env.location.href).searchParams.get('fbclid') } catch { /* no browser */ }
  // URLSearchParams decodes once. Do not lowercase, trim, hash or truncate fbclid.
  if (!click || !CLICK_RE.test(click) || click.length > 4000) click = null
  try {
    const record = JSON.parse(env.localStorage.getItem(STORAGE_KEY) || 'null')
    stored = record?.fbc
    captured = record?.captured
  } catch { /* storage disabled or old format */ }
  const usable = value => validFbc(value) && now - Number(value.split('.')[2]) <= MAX_AGE_MS && Number(value.split('.')[2]) <= now + 300000
  const memory = memoryFbcs.get(env)
  captured = captured || memory?.captured
  const candidates = [...cookieValues(documentLike, '_fbc'), stored, memory?.fbc].filter(usable)
  let fbc = null
  if (click) {
    fbc = candidates.find(value => value.split('.').slice(3).join('.') === click) || `fb.1.${now}.${click}`
    source = 'url'
  } else if (candidates.length) {
    fbc = candidates[0]
    source = cookieValues(documentLike, '_fbc').includes(fbc) ? 'cookie' : 'storage'
  }
  if (fbc) {
    // Retain a landing/cookie capture baseline if another script later changes it.
    if (click || !usable(captured)) captured = fbc
    const record = { fbc, captured }
    memoryFbcs.set(env, record)
    try { env.localStorage.setItem(STORAGE_KEY, JSON.stringify(record)) } catch { /* non-blocking */ }
    // Pixel owns _fbc. A host-only write here could shadow its parent-domain
    // cookie after the next ad click. Our first-party cache is a separate key.
  }
  const fbp = cookieValues(documentLike, '_fbp').find(validFbp)
  return { fbc, fbp, captureFbc: fbc ? captured : null, matchingSource: source, matchingVersion: META_MATCHING_VERSION }
}

export const matchingDiagnostics = async (clientInfo) => {
  const digest = async value => {
    if (!value || !globalThis.crypto?.subtle) return null
    try {
      const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
      return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
    } catch { return null }
  }
  return {
    version: META_MATCHING_VERSION,
    source: clientInfo.matchingSource || 'legacy',
    fbc_sha256: await digest(clientInfo.captureFbc || clientInfo.fbc),
    click_sha256: await digest((clientInfo.captureFbc || clientInfo.fbc)?.split('.').slice(3).join('.'))
  }
}

export const createMetaEventId = (eventName) => {
  sequence += 1
  try {
    if (globalThis.crypto?.randomUUID) return `${eventName}_${globalThis.crypto.randomUUID()}`
    if (globalThis.crypto?.getRandomValues) {
      const bytes = globalThis.crypto.getRandomValues(new Uint32Array(4))
      return `${eventName}_${Array.from(bytes, n => n.toString(16).padStart(8, '0')).join('')}`
    }
  } catch { /* compatibility fallback, never block the CTA */ }
  return `${eventName}_${Date.now()}_${sequence}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`
}
