import assert from 'node:assert/strict'
import { before, after, test, mock } from 'node:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

let server, ProductDetail, BundleDetail, AdTrackingContext
before(async () => {
  server = await createServer({
    cacheDir: await mkdtemp(join(tmpdir(), 'brainnel-price-display-test-')),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'error'
  })
  ProductDetail = (await server.ssrLoadModule('/src/components/ProductDetail.jsx')).default
  BundleDetail = (await server.ssrLoadModule('/src/components/BundleDetail.jsx')).default
  AdTrackingContext = (await server.ssrLoadModule('/src/contexts/AdTrackingContext.jsx')).default
})
after(async () => { await server?.close() })

// The only price comparison the storefront shows is the Black Friday offer on the product page
// (utils/blackFriday.js): usual price = current price ÷ 0.7 and the amount saved, until
// 30 November 2026. Everything else, and the product page after that date, shows the actual
// price alone.
const AFTER_OFFER = Date.UTC(2026, 11, 1)
const DURING_OFFER = Date.UTC(2026, 10, 25, 12)
const forbidden = /<(?:s|del)\b|original-price|discount-badge|clarity-comparison-price|Référence indicative|Achetés séparément|Offre du jour/
const render = (Component, props, search, now = AFTER_OFFER) => {
  mock.timers.enable({ apis: ['Date'], now })
  const previousWindow = globalThis.window
  globalThis.window = {
    location: { hostname: 'localhost', pathname: '/product/price-test', search },
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} }
  }
  try {
    return renderToStaticMarkup(createElement(MemoryRouter, null,
      createElement(AdTrackingContext.Provider, { value: { adId: null, isLoading: false } },
        createElement(Component, props))))
  } finally {
    mock.timers.reset()
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
}

const offerProduct = () => ({ product_id: 'price-test', name_fr: 'Produit test', price: 8500,
  original_price: 99000, off: 0.9, image_url: [], stock: 99, skus: [] })

test('Black Friday offer: the product page shows the usual price struck through, the amount saved and the time left', () => {
  const product = offerProduct()
  const html = render(ProductDetail, { productId: product.product_id, initialProduct: product }, '', DURING_OFFER)
  // 8 500 ÷ 0.7 = 12 142.9, shown as 12 100: once in the price panel and once in the purchase bar.
  assert.equal(html.match(/<s>(?:(?!<\/s>).)*12\s?100(?:(?!<\/s>).)*<\/s>/g)?.length, 2)
  assert.match(html, /Prix Black Friday/)
  // The saving is an amount in FCFA; no percentage is shown.
  assert.match(html, /class="clarity-bf-tag"><span>Black Friday<\/span><b>−3\s?600\sFCFA<\/b>/)
  assert.match(html, /class="clarity-bf-saving"><s>.*?<\/s><b>−3\s?600\sFCFA<\/b>/)
  assert.match(html, /class="clarity-bf-was"><s>.*?<\/s><b>−3\s?600<\/b>/)
  assert.doesNotMatch(html, /%/)
  assert.match(html, /Fin de l’offre dans/)
  assert.match(html, /<b>05<\/b>j<\/span><span><b>11<\/b>h<\/span><span><b>59<\/b>min<\/span><span><b>59<\/b>s/)
  assert.match(html, /has-bf-offer/)
  assert.match(html, /8\s?500/)
  // The API's own comparison fields are never shown.
  assert.doesNotMatch(html, /99\s?000|original-price|discount-badge|Offre du jour/)
})

test('Black Friday offer: the original layout and bundles keep the actual price alone', () => {
  const product = offerProduct()
  assert.doesNotMatch(render(ProductDetail, { productId: product.product_id, initialProduct: product },
    '?landing_design=original', DURING_OFFER), forbidden)
  const bundle = { id: 'bundle-price-test', title_fr: 'Pack test', cfa_price: 8500,
    items: [{ product_id: 'item-test', name_fr: 'Article', unit_price: 7100, quantity: 2 }] }
  const html = render(BundleDetail, { bundleId: bundle.id, initialBundle: bundle }, '', DURING_OFFER)
  assert.doesNotMatch(html, forbidden)
  assert.doesNotMatch(html, /Black Friday|has-bf-offer/)
})

for (const search of ['', '?landing_design=original']) {
  test(`after the offer a single product renders only the actual price (${search || 'clarity'})`, () => {
    const product = { product_id: 'price-test', name_fr: 'Produit test', price: 8500,
      original_price: 99000, off: 0.9, image_url: [], stock: 99, skus: [] }
    const html = render(ProductDetail, { productId: product.product_id, initialProduct: product }, search)
    assert.doesNotMatch(html, forbidden)
    assert.doesNotMatch(html, /99[\s ]?000/)
    assert.match(html, /8[\s ]?500/)
    assert.match(html, /Commander|Acheter/)
    assert.doesNotMatch(html, /Black Friday|has-bf-offer/)
  })
  test(`bundle keeps its sale price and quantity without generated discounts (${search || 'clarity'})`, () => {
    const bundle = { id: 'bundle-price-test', title_fr: 'Pack test', cfa_price: 8500,
      original_price: 99000, off: 0.9, items: [{ product_id: 'item-test', name_fr: 'Article', unit_price: 7100, quantity: 2 }] }
    const html = render(BundleDetail, { bundleId: bundle.id, initialBundle: bundle }, search)
    assert.doesNotMatch(html, forbidden)
    assert.doesNotMatch(html, /99[\s ]?000/)
    assert.match(html, /8[\s ]?500/)
    assert.match(html, /class="bundle-quantity-input"[^>]*max="5"/)
    if (!search) {
      assert.match(html, /Prix unitaire/)
      assert.match(html, /7[\s ]?500/)
    }
  })
}

test('all product list and detail implementations exclude discount display code and styles', async () => {
  for (const path of ['components/ProductList.jsx', 'components/BundleList.jsx',
    'components/ProductDetail.jsx', 'components/BundleDetail.jsx', 'components/landing/LandingClarity.jsx',
    'components/ProductList.css', 'components/ProductDetail.css', 'components/landing/LandingClarity.css']) {
    const source = await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /original_price|original-price|discount-badge|BUNDLE_FAKE_DISCOUNT|referencePrice|line-through|<Countdown/, path)
  }
  const tabs = await readFile(new URL('../src/components/CategoryTabs.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(tabs, /Packs promo/)
})
