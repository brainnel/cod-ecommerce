import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import { collectMetaMatching, createMetaEventId, matchingDiagnostics, validFbc } from '../src/utils/metaMatching.js'
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto })

const NOW = 1791612000000
const CLICK = 'AbCdEf_0123456789-ZyX'
const fakeBrowser = (url = 'https://www.brainnel.com/', initialCookies = '') => {
  const cookies = new Map(initialCookies.split('; ').filter(Boolean).map(value => value.split('=')))
  const storage = new Map()
  const env = { location: new URL(url), localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } }
  env.document = {
    get cookie() { return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ') },
    set cookie(value) { const [name, data] = value.split(';')[0].split('='); cookies.set(name, data) }
  }
  return env
}

test('captures exact URL click once and keeps timestamp across SPA navigation and reload', () => {
  const env = fakeBrowser(`https://brainnel-vite.com/product/1?fbclid=${CLICK}`)
  const first = collectMetaMatching(env, NOW)
  assert.equal(first.fbc, `fb.1.${NOW}.${CLICK}`)
  assert.equal(env.document.cookie, '') // Never shadow Pixel's parent-domain cookie.
  assert.equal(collectMetaMatching(env, NOW + 1000).fbc, first.fbc)
  env.location = new URL('https://brainnel-vite.com/payment')
  assert.equal(collectMetaMatching(env, NOW + 3000).fbc, first.fbc)
  assert.equal(collectMetaMatching({ ...env }, NOW + 5000).fbc, first.fbc)
})

test('reuses Pixel cookie and its timestamp for same click', () => {
  const fbc = `fb.1.${NOW - 9000}.${CLICK}`
  const env = fakeBrowser(`https://www.brainnel.com/?fbclid=${CLICK}`, `_fbc=${fbc}; _fbp=fb.1.${NOW - 5000}.123456789`)
  assert.equal(collectMetaMatching(env, NOW).fbc, fbc)
  assert.equal(collectMetaMatching(env, NOW).fbp, `fb.1.${NOW - 5000}.123456789`)
})

test('a genuinely new click replaces old click without modifying case', () => {
  const env = fakeBrowser(`https://www.brainnel.com/?fbclid=${CLICK}`, `_fbc=fb.1.${NOW - 9000}.OldClick`)
  assert.equal(collectMetaMatching(env, NOW).fbc, `fb.1.${NOW}.${CLICK}`)
})

test('does not fabricate clicks for natural traffic or accept whitespace/encoded garbage', () => {
  for (const query of ['', '?fbclid=hello%20world', '?fbclid=%2520', '?fbclid=fb.1.123.fake']) {
    assert.equal(collectMetaMatching(fakeBrowser(`https://www.brainnel.com/${query}`), NOW).fbc, null)
  }
  assert.equal(validFbc(`fb.1.${NOW}.${CLICK.toLowerCase()}`), true) // Syntax cannot prove authenticity.
})

test('disabled cookies and storage do not block tracking or navigation', () => {
  const env = fakeBrowser(`https://www.brainnel.com/?fbclid=${CLICK}`)
  Object.defineProperty(env.document, 'cookie', { get() { throw new Error('blocked') }, set() { throw new Error('blocked') } })
  Object.defineProperty(env, 'localStorage', { get() { throw new Error('blocked') } })
  const first = collectMetaMatching(env, NOW)
  env.location = new URL('https://www.brainnel.com/payment')
  assert.equal(collectMetaMatching(env, NOW + 1000).fbc, first.fbc)
})

test('old or malformed cookies are not sent and domains stay isolated', () => {
  const env = fakeBrowser('https://www.brainnel.com/', `_fbc=fb.1.${NOW - 91 * 86400000}.old`)
  assert.equal(collectMetaMatching(env, NOW).fbc, null)
  collectMetaMatching(fakeBrowser(`https://www.brainnel.com/?fbclid=${CLICK}`), NOW)
  assert.equal(collectMetaMatching(fakeBrowser('https://brainnel-vite.com/'), NOW).fbc, null)
})

test('diagnostics hash exact case-sensitive bytes without exposing the click', async () => {
  const data = collectMetaMatching(fakeBrowser(`https://www.brainnel.com/?fbclid=${CLICK}`), NOW)
  const diagnostics = await matchingDiagnostics(data)
  assert.equal(diagnostics.fbc_sha256, createHash('sha256').update(data.fbc).digest('hex'))
  assert.equal(diagnostics.click_sha256, createHash('sha256').update(CLICK).digest('hex'))
  assert.ok(!JSON.stringify(diagnostics).includes(CLICK))
})

test('same-second same-product events cannot collide; each ID is shared by both callers', () => {
  const ids = Array.from({ length: 10000 }, () => createMetaEventId('view_content'))
  assert.equal(new Set(ids).size, ids.length)
})

test('retains original capture digest when another integration replaces the cookie', async () => {
  const env = fakeBrowser(`https://www.brainnel.com/?fbclid=${CLICK}`)
  const first = collectMetaMatching(env, NOW)
  env.location = new URL('https://www.brainnel.com/payment')
  env.document.cookie = `_fbc=fb.1.${NOW + 1000}.DifferentClick`
  const next = collectMetaMatching(env, NOW + 2000)
  assert.notEqual(next.fbc, first.fbc)
  const audit = await matchingDiagnostics(next)
  assert.equal(audit.fbc_sha256, createHash('sha256').update(first.fbc).digest('hex'))
})
