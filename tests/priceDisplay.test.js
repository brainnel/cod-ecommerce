import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
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

const forbidden = /<(?:s|del)\b|original-price|discount-badge|clarity-comparison-price|Référence indicative|Achetés séparément|Offre du jour/
const render = (Component, props, search) => {
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
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
}

for (const search of ['', '?landing_design=original']) {
  test(`single product renders only the actual price (${search || 'clarity'})`, () => {
    const product = { product_id: 'price-test', name_fr: 'Produit test', price: 8500,
      original_price: 99000, off: 0.9, image_url: [], stock: 99, skus: [] }
    const html = render(ProductDetail, { productId: product.product_id, initialProduct: product }, search)
    assert.doesNotMatch(html, forbidden)
    assert.doesNotMatch(html, /99[\s ]?000/)
    assert.match(html, /8[\s ]?500/)
    assert.match(html, /Commander|Acheter/)
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
