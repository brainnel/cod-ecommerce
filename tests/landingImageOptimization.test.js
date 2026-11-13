import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import {
  LANDING_IMAGE_WEBP_PERCENT, LANDING_IMAGE_ROLLOUT, LANDING_IMAGE_WEBP, LANDING_IMAGE_ORIGINAL,
  toLandingWebpUrl, getLandingImageBucket, getLandingImageOptimization, pickLandingImageSrc
} from '../src/utils/landingImageOptimization.js'
import { getCheckoutOptimizationBucket } from '../src/utils/checkoutOptimizationExperiment.js'

const UPLOADS = 'https://api.brainnel.com/admin/static/uploads/'

// ---------------------------------------------------------------- URL helper

test('uploads .jpg, .jpeg and .png map to the .w828.webp copy next to the original', () => {
  for (const name of ['image2_833967860394_01_white_main_3f48aad76f844d7cb6439f896d52ee4a.jpg',
    '000c45963c2f4ae6bbfe86a50731f664.jpeg', 'codex_1_07_gallery.png', 'UPPER.JPG', 'Mixed.Png', 'a.b.c.jpg']) {
    assert.equal(toLandingWebpUrl(`${UPLOADS}${name}`), `${UPLOADS}${name}.w828.webp`)
  }
})

test('every other URL is returned unchanged', () => {
  const untouched = [
    'https://cbu01.alicdn.com/img/ibank/O1CN01abc_!!2212345-0-cib.jpg',
    'https://img.alicdn.com/imgextra/i1/abc.png',
    'https://selection.brainnel.com/api/static/selection-image-edits/abc.jpg',
    'https://selection.brainnel.com/api/static/bundle-image-edits/abc.jpg',
    'data:image/png;base64,iVBORw0KGgo=',
    'data:image/jpeg;base64,/9j/4AAQ.jpg',
    `${UPLOADS}already.webp`,
    `${UPLOADS}photo.jpg.w828.webp`,
    `${UPLOADS}animation.gif`,
    `${UPLOADS}sub/dir.jpg`,
    `${UPLOADS}photo.jpg?v=2`,
    `${UPLOADS}photo.jpg#top`,
    `${UPLOADS}a%20b.jpg`,
    `${UPLOADS}.hidden.jpg`,
    `${UPLOADS}noextension`,
    UPLOADS,
    'http://api.brainnel.com/admin/static/uploads/photo.jpg',
    'https://api.brainnel.com/admin/static/delivery_orders/photo.jpg',
    'https://api.brainnel.com.evil.example/admin/static/uploads/photo.jpg',
    '/logo.png',
    'photo.jpg',
    ''
  ]
  for (const url of untouched) assert.equal(toLandingWebpUrl(url), url, url)
  for (const value of [null, undefined, 0, 42, false, {}, ['x.jpg']]) assert.equal(toLandingWebpUrl(value), value)
})

test('mapping twice does not stack suffixes', () => {
  const once = toLandingWebpUrl(`${UPLOADS}photo.jpg`)
  assert.equal(toLandingWebpUrl(once), once)
})

// ---------------------------------------------------------------- rollout gate

// Frozen contract: FNV-1a over "<salt>:<deviceId>", modulo 100. Changing the salt
// or the hash would silently move devices between the two image groups.
const expectedBucket = (deviceId) => {
  const text = `landing_img_webp828_20261113:${deviceId}`
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 100
}
const devices = Array.from({ length: 20000 }, (_, i) => `device_${i.toString(16).padStart(8, '0')}-4a2b-4c3d-9e8f-${(i * 7919).toString(16).padStart(12, '0')}`)
const deviceInBucket = (wanted) => devices.find((id) => expectedBucket(id) === wanted)

test('bucket is the salted device hash and covers 0..99', () => {
  assert.equal(LANDING_IMAGE_ROLLOUT, 'landing_img_webp828_20261113')
  const seen = new Set()
  for (const id of devices) {
    const bucket = getLandingImageBucket(id)
    assert.equal(bucket, expectedBucket(id))
    seen.add(bucket)
  }
  assert.equal(seen.size, 100)
  assert.equal(getLandingImageBucket('device_a'), getLandingImageBucket('device_a'))
})

test('the configured percentage is one of the rollout stages', () => {
  assert.ok([0, 10, 50, 100].includes(LANDING_IMAGE_WEBP_PERCENT), `unexpected ${LANDING_IMAGE_WEBP_PERCENT}`)
})

test('devices below the percentage get webp828, the others get today\'s behaviour', () => {
  for (let bucket = 0; bucket < 100; bucket += 1) {
    const deviceId = deviceInBucket(bucket)
    const result = getLandingImageOptimization({ deviceId })
    const expected = bucket < LANDING_IMAGE_WEBP_PERCENT
    assert.equal(result.bucket, bucket)
    assert.equal(result.enabled, expected, `bucket ${bucket}`)
    assert.equal(result.variant, expected ? 'webp828' : 'orig')
    assert.equal(result.resolve(`${UPLOADS}a.jpg`), expected ? `${UPLOADS}a.jpg.w828.webp` : `${UPLOADS}a.jpg`)
    assert.equal(result.resolve('https://cbu01.alicdn.com/a.jpg'), 'https://cbu01.alicdn.com/a.jpg')
  }
  assert.equal(LANDING_IMAGE_WEBP, 'webp828')
  assert.equal(LANDING_IMAGE_ORIGINAL, 'orig')
})

test('raising the percentage keeps every device that is already in', () => {
  const share = (percent) => devices.filter((deviceId) => getLandingImageOptimization({ deviceId, percent }).enabled)
  const at10 = new Set(share(10)), at50 = new Set(share(50)), at100 = share(100)
  assert.equal(share(0).length, 0)
  assert.equal(at100.length, devices.length)
  for (const id of at10) assert.ok(at50.has(id))
  assert.ok(Math.abs(at10.size / devices.length - 0.10) < 0.01, `10% stage holds ${at10.size}`)
  assert.ok(Math.abs(at50.size / devices.length - 0.50) < 0.015, `50% stage holds ${at50.size}`)
})

test('a missing device id gets the original images', () => {
  for (const deviceId of [undefined, null, '', '   ', 0, 42, {}]) {
    for (const percent of [10, 100]) {
      const result = getLandingImageOptimization({ deviceId, percent })
      assert.deepEqual([result.bucket, result.enabled, result.variant], [null, false, 'orig'])
      assert.equal(result.resolve(`${UPLOADS}a.jpg`), `${UPLOADS}a.jpg`)
    }
  }
  assert.equal(getLandingImageOptimization().variant, 'orig')
})

test('the image rollout is independent of the checkout optimization experiment', () => {
  // Checkout groups by bucket range of cod_opt_20261104_v1 (see checkoutOptimizationExperiment.js).
  const ranges = [[0, 10], [10, 20], [20, 30], [30, 40], [40, 60], [60, 100]]
  for (const percent of [10, 50]) {
    for (const [from, to] of ranges) {
      const group = devices.filter((id) => {
        const bucket = getCheckoutOptimizationBucket(id)
        return bucket >= from && bucket < to
      })
      const inside = group.filter((deviceId) => getLandingImageOptimization({ deviceId, percent }).enabled).length
      assert.ok(group.length > 1500, `checkout buckets ${from}-${to} hold ${group.length}`)
      assert.ok(Math.abs(inside / group.length - percent / 100) < 0.03,
        `checkout buckets ${from}-${to}: ${(100 * inside / group.length).toFixed(1)}% at ${percent}%`)
    }
  }
})

// ---------------------------------------------------------------- fallback

test('an image shows the WebP copy until it fails once, then the original for good', () => {
  const src = `${UPLOADS}a.jpg`, optimizedSrc = `${src}.w828.webp`
  assert.equal(pickLandingImageSrc({ src, optimizedSrc, failedSrc: null }), optimizedSrc)
  assert.equal(pickLandingImageSrc({ src, optimizedSrc, failedSrc: optimizedSrc }), src)
  // Nothing to fall back to: control group, or a URL the helper leaves alone.
  assert.equal(pickLandingImageSrc({ src, optimizedSrc: src, failedSrc: null }), src)
  assert.equal(pickLandingImageSrc({ src, optimizedSrc: undefined, failedSrc: null }), src)
  // A different image in the same slot is tried on its own merits.
  const next = `${UPLOADS}b.jpg`
  assert.equal(pickLandingImageSrc({ src: next, optimizedSrc: `${next}.w828.webp`, failedSrc: optimizedSrc }), `${next}.w828.webp`)
})

// ---------------------------------------------------------------- pages

let server, ProductDetail, BundleDetail, LandingImage, AdTrackingContext
before(async () => {
  server = await createServer({
    cacheDir: await mkdtemp(join(tmpdir(), 'brainnel-landing-image-test-')),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'error'
  })
  ProductDetail = (await server.ssrLoadModule('/src/components/ProductDetail.jsx')).default
  BundleDetail = (await server.ssrLoadModule('/src/components/BundleDetail.jsx')).default
  LandingImage = (await server.ssrLoadModule('/src/components/landing/LandingImage.jsx')).default
  AdTrackingContext = (await server.ssrLoadModule('/src/contexts/AdTrackingContext.jsx')).default
})
after(async () => { await server?.close() })

const render = (Component, props, deviceId) => {
  const previousWindow = globalThis.window
  globalThis.window = {
    location: { hostname: 'www.brainnel.com', pathname: '/product/image-test', search: '' },
    localStorage: { getItem: (key) => (key === 'cod_checkout_device_id' ? deviceId : null), setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} }
  }
  try {
    return renderToStaticMarkup(createElement(MemoryRouter, null,
      createElement(AdTrackingContext.Provider, { value: { adId: null, isLoading: true } },
        createElement(Component, props))))
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
}
const imageSources = (html) => [...html.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1])
  .filter((src) => /^https?:/.test(src))
const insideDevice = () => deviceInBucket(0)
const outsideDevice = () => deviceInBucket(99)

const product = {
  product_id: 'image-test', name_fr: 'Produit test', price: 8500, stock: 99, skus: [],
  image_url: [`${UPLOADS}main_1.jpg`, `${UPLOADS}main_2.png`, 'https://cbu01.alicdn.com/img/ibank/main_3.jpg', `${UPLOADS}main_4.jpg`],
  description_fr: [`${UPLOADS}detail_1.jpg`, 'https://selection.brainnel.com/api/static/selection-image-edits/detail_2.jpg', `${UPLOADS}detail_3.webp`]
}
const bundle = {
  id: 'image-test', title_fr: 'Pack test', cfa_price: 8500,
  cover_image_url: `${UPLOADS}cover.jpg`,
  detail_images: ['https://selection.brainnel.com/api/static/bundle_1.jpg', `${UPLOADS}bundle_2.jpg`],
  items: [{ product_id: 'item-1', name_fr: 'Article', quantity: 1, cover_image_url: `${UPLOADS}item_1.jpg` },
    { product_id: 'item-2', name_fr: 'Article 2', quantity: 1, cover_image_url: 'https://cbu01.alicdn.com/img/ibank/item_2.jpg' }]
}

test('LandingImage renders the WebP copy first and passes the loading attributes through', () => {
  const html = renderToStaticMarkup(createElement(LandingImage, {
    src: `${UPLOADS}a.jpg`, optimizedSrc: `${UPLOADS}a.jpg.w828.webp`, alt: 'Image produit 1',
    loading: 'eager', fetchPriority: 'high', decoding: 'async', className: 'x'
  }))
  // (The server renderer may put a preload hint for a high-priority image in front; the browser build has none.)
  assert.ok(html.endsWith(`<img loading="eager" fetchPriority="high" decoding="async" class="x" src="${UPLOADS}a.jpg.w828.webp" alt="Image produit 1"/>`), html)
  assert.doesNotMatch(html, /a\.jpg"/)
  const plain = renderToStaticMarkup(createElement(LandingImage, { src: '/logo.png', optimizedSrc: '/logo.png', alt: '', loading: 'lazy' }))
  assert.equal(plain, '<img loading="lazy" src="/logo.png" alt=""/>')
})

test('product page: a device inside the rollout loads carousel and detail images as .w828.webp', () => {
  const sources = imageSources(render(ProductDetail, { productId: product.product_id, initialProduct: product }, insideDevice()))
  assert.deepEqual(sources, [
    `${UPLOADS}main_1.jpg.w828.webp`, `${UPLOADS}main_2.png.w828.webp`,
    'https://cbu01.alicdn.com/img/ibank/main_3.jpg', `${UPLOADS}main_4.jpg.w828.webp`,
    `${UPLOADS}detail_1.jpg.w828.webp`,
    'https://selection.brainnel.com/api/static/selection-image-edits/detail_2.jpg', `${UPLOADS}detail_3.webp`
  ])
})

test('product page: a device outside the rollout gets exactly the stored URLs', () => {
  const sources = imageSources(render(ProductDetail, { productId: product.product_id, initialProduct: product }, outsideDevice()))
  assert.deepEqual(sources, [...product.image_url, ...product.description_fr])
})

test('pages differ between the two groups only in the image URL (eager / lazy / priority policy unchanged)', () => {
  for (const [Component, props] of [
    [ProductDetail, { productId: product.product_id, initialProduct: product }],
    [BundleDetail, { bundleId: bundle.id, initialBundle: bundle }]
  ]) {
    const inside = render(Component, props, insideDevice())
    const outside = render(Component, props, outsideDevice())
    assert.notEqual(inside, outside)
    assert.equal(inside.replaceAll('.w828.webp"', '"'), outside)
    assert.match(outside, /loading="eager"/)
    assert.match(outside, /loading="lazy"/)
    assert.match(outside, /fetchPriority="high"/)
    assert.doesNotMatch(outside, /\.w828\.webp/)
  }
})

test('bundle page: uploads images use the WebP copy, selection.brainnel.com images stay as stored', () => {
  const sources = imageSources(render(BundleDetail, { bundleId: bundle.id, initialBundle: bundle }, insideDevice()))
  assert.ok(sources.includes(`${UPLOADS}cover.jpg.w828.webp`))
  assert.ok(sources.includes(`${UPLOADS}bundle_2.jpg.w828.webp`))
  assert.ok(sources.includes(`${UPLOADS}item_1.jpg.w828.webp`))
  assert.ok(sources.includes('https://selection.brainnel.com/api/static/bundle_1.jpg'))
  assert.ok(sources.includes('https://cbu01.alicdn.com/img/ibank/item_2.jpg'))
  assert.ok(!sources.includes(`${UPLOADS}cover.jpg`))
})

test('checkout, payment and order-success code do not use the landing image rollout', async () => {
  for (const path of ['pages/PaymentPage.jsx', 'pages/OrderSuccessPage.jsx', 'components/QuantityModal.jsx',
    'services/api.js', 'utils/checkoutPaymentStateCache.js']) {
    const source = await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /landingImageOptimization|LandingImage|w828|img_opt/, path)
  }
  // img_opt is added to product_landing_view only.
  const analytics = await readFile(new URL('../src/services/checkoutFunnelAnalytics.js', import.meta.url), 'utf8')
  const landingView = analytics.slice(analytics.indexOf('export const trackProductLandingView'),
    analytics.indexOf('export const trackProductLandingEngagement'))
  assert.match(landingView, /img_opt: extra\.img_opt/)
  assert.equal(analytics.match(/img_opt/g).length, landingView.match(/img_opt/g).length)
})
