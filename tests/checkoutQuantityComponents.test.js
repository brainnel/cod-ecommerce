import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

let server, PaymentPage, QuantityModal, BundleDetail, AdTrackingContext
const product = { product_id: 'quantity-test', name_fr: 'Produit test', price: 1000, stock: 99, image_url: [], skus: [{ sku_id: 'sku-test' }] }
const bundle = { id: 'bundle-test', title_fr: 'Pack test', cfa_price: 3000, items: [] }
const experiment = { checkout_quantity_variant: 'single_page_checkout' }

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    define: { 'import.meta.env.VITE_ENABLE_CONSOLE_LOGS': JSON.stringify('false') },
    logLevel: 'error'
  })
  PaymentPage = (await server.ssrLoadModule('/src/pages/PaymentPage.jsx')).default
  QuantityModal = (await server.ssrLoadModule('/src/components/QuantityModal.jsx')).default
  BundleDetail = (await server.ssrLoadModule('/src/components/BundleDetail.jsx')).default
  AdTrackingContext = (await server.ssrLoadModule('/src/contexts/AdTrackingContext.jsx')).default
})
after(async () => { await server?.close() })

const render = (component, props, state) => renderToStaticMarkup(createElement(MemoryRouter, {
  initialEntries: [{ pathname: '/payment', search: '?step=1', state }]
}, createElement(AdTrackingContext.Provider, { value: { adId: null, isLoading: false } }, createElement(component, props))))
const renderPayment = (state) => render(PaymentPage, {}, state)

test('single-product checkout clamps a restored route of 99 to five and displays the matching total', () => {
  const html = renderPayment({ product, quantity: 99, checkoutQuantityExperiment: experiment })
  assert.match(html, /class="inline-quantity-input"[^>]*max="5"[^>]*value="5"/)
  assert.match(html, /disabled="" aria-label="Augmenter la quantité"/)
  assert.match(html, /5000 FCFA/)
  assert.doesNotMatch(html, /99000 FCFA/)
})

test('checkout honors low stock and the one-piece minimum', () => {
  const lowStock = renderPayment({ product: { ...product, stock: 2 }, quantity: 99, checkoutQuantityExperiment: experiment })
  assert.match(lowStock, /class="inline-quantity-input"[^>]*max="2"[^>]*value="2"/)
  assert.match(lowStock, /2000 FCFA/)
  const negative = renderPayment({ product, quantity: -8, checkoutQuantityExperiment: experiment })
  assert.match(negative, /class="inline-quantity-input"[^>]*value="1"/)
})

test('bundle checkout limits purchased sets to five without changing the bundle definition', () => {
  const html = renderPayment({ bundle, productType: 'bundle', quantity: 88, checkoutQuantityExperiment: experiment })
  assert.match(html, /class="inline-quantity-input"[^>]*max="5"[^>]*value="5"/)
  assert.match(html, /15000 FCFA/)
})

test('legacy modal and bundle landing both declare a maximum of five', () => {
  const modal = render(QuantityModal, { isOpen: true, onClose() {}, product })
  assert.match(modal, /class="quantity-input"[^>]*max="5"/)
  const lowStockModal = render(QuantityModal, { isOpen: true, onClose() {}, product: { ...product, stock: 2 } })
  assert.match(lowStockModal, /class="quantity-input"[^>]*max="2"/)
  const landing = render(BundleDetail, { bundleId: bundle.id, initialBundle: bundle })
  assert.match(landing, /class="bundle-quantity-input"[^>]*max="5"/)
})

test('old session cache with quantity 99 is normalized on the first checkout render', () => {
  const previousWindow = globalThis.window
  const state = { product, quantity: 99, checkoutQuantityExperiment: experiment }
  globalThis.window = {
    sessionStorage: { getItem: (key) => key === 'cod_checkout_payment_state_v1' ? JSON.stringify({ savedAt: Date.now(), state }) : null },
    localStorage: { getItem: () => null },
    location: { search: '', pathname: '/payment', hostname: 'localhost', href: 'http://localhost/payment' }
  }
  try {
    const html = renderPayment(undefined)
    assert.match(html, /class="inline-quantity-input"[^>]*max="5"[^>]*value="5"/)
    assert.match(html, /5000 FCFA/)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('legacy modal retains its disabled increment for zero stock', () => {
  const html = render(QuantityModal, { isOpen: true, onClose() {}, product: { ...product, stock: 0 } })
  assert.match(html, /class="quantity-input"[^>]*max="0"/)
  assert.match(html, /class="quantity-btn" disabled="">\+<\/button>/)
})
