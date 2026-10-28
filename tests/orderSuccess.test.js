import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { getWhatsAppCustomerGroup, WHATSAPP_GROUP_CLICK_EVENT } from '../src/config/customerCommunity.js'

let server
let OrderSuccessPage
const example = {
  product: { product_id: 'test-only', name_fr: 'Produit de démonstration', price: 10500, image_url: ['/logo.png'] },
  quantity: 1,
  userInfo: { fullName: 'Client exemple', phone: '2250700000000', whatsapp: '2250500000000', addressDescription: 'Cocody, près de la pharmacie, portail bleu.' },
  selectedLocation: { name: 'Cocody' }, totalPrice: 10500,
  orderResponse: { order_no: 'FL-TEST-ONLY', order_id: 'test-only' }
}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    define: { 'import.meta.env.VITE_ENABLE_CONSOLE_LOGS': JSON.stringify('false') },
    logLevel: 'error'
  })
  OrderSuccessPage = (await server.ssrLoadModule('/src/pages/OrderSuccessPage.jsx')).default
})
after(async () => { await server?.close() })

const render = (state) => renderToStaticMarkup(createElement(MemoryRouter, {
  initialEntries: [{ pathname: '/order-success', state }]
}, createElement(OrderSuccessPage)))

test('customer group click keeps the existing analytics event', () => {
  assert.equal(WHATSAPP_GROUP_CLICK_EVENT, 'order_success_whatsapp_group_click')
  assert.ok(WHATSAPP_GROUP_CLICK_EVENT.length <= 50)
})

test('production component puts the real group link before delivery and removes rejected copy', () => {
  const html = render(example)
  assert.ok(html.includes(`href="${getWhatsAppCustomerGroup({ phone: example.userInfo.phone }).url}"`))
  assert.ok(html.indexOf('os-community') < html.indexOf('os-delivery'))
  assert.equal((html.match(/class="os-join-group"/g) || []).length, 1)
  assert.doesNotMatch(html, /Facultatif|visible des membres|bons plans/)
  assert.match(html, /Service client/)
  assert.match(html, /L’app Brainnel/)
})

test('single product retains the full order and recipient information under details', () => {
  const html = render(example)
  for (const text of ['FL-TEST-ONLY', 'Produit de démonstration', 'Client exemple', '+2250700000000', '+2250500000000', 'Cocody', 'portail bleu.', '8:00 - 21:00']) assert.ok(html.includes(text), text)
  assert.match(html, /10\s500 FCFA/)
  assert.match(html, /<details class="os-order-details">/)
  assert.doesNotMatch(html, /<details[^>]+open/)
})

test('bundle names, multi-unit totals and long addresses remain intact and escaped', () => {
  const state = { ...example, product: { ...example.product, name_fr: 'Ensemble <essai>', image_url: '/logo.png' }, quantity: 2, totalPrice: 21000,
    userInfo: { ...example.userInfo, addressDescription: 'Repère '.repeat(80) } }
  const html = render(state)
  assert.match(html, /Ensemble &lt;essai&gt;/)
  assert.match(html, /Quantité : 2/)
  assert.match(html, /21\s000 FCFA/)
  assert.ok(html.includes(state.userInfo.addressDescription))
  assert.match(html, /src="\/logo.png"/)
})

test('missing amount safely uses product total and absent optional fields do not crash', () => {
  const html = render({ ...example, totalPrice: undefined, quantity: 2, product: { ...example.product, image_url: [] }, userInfo: { fullName: 'Client', phone: '+2250700000000' } })
  assert.match(html, /21\s000 FCFA/)
  assert.doesNotMatch(html, /NaN|undefined|\+\+/)
})

test('absent order state never exposes a confirmation or group CTA', () => {
  const html = render(undefined)
  assert.match(html, /Chargement de votre commande/)
  assert.doesNotMatch(html, /os-join-group|Commande confirmée/)
})

test('recent session cache restores the confirmation after returning from WhatsApp', () => {
  const previousWindow = globalThis.window
  globalThis.window = { sessionStorage: { getItem: () => JSON.stringify({ savedAt: Date.now(), state: example }) } }
  try {
    const html = render(undefined)
    assert.match(html, /Commande confirmée/)
    assert.match(html, /FL-TEST-ONLY/)
    assert.match(html, /os-join-group/)
    assert.ok(html.includes(`href="${getWhatsAppCustomerGroup({ phone: example.userInfo.phone }).url}"`))
    assert.match(render({ ...example, orderResponse: { order_no: 'FL-NEWER-ORDER' } }), /FL-NEWER-ORDER/)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('expired or malformed cached state does not pretend an order succeeded', (t) => {
  const warning = t.mock.method(console, 'warn', () => {})
  const previousWindow = globalThis.window
  for (const cached of ['not-json', JSON.stringify({ savedAt: Date.now() - 7200001, state: example }), JSON.stringify({ savedAt: Date.now(), state: {} })]) {
    globalThis.window = { sessionStorage: { getItem: () => cached, removeItem: () => {} } }
    try { assert.doesNotMatch(render(undefined), /os-join-group|Commande confirmée/) }
    finally {
      if (previousWindow === undefined) delete globalThis.window
      else globalThis.window = previousWindow
    }
  }
  assert.equal(warning.mock.calls.length, 1)
})

test('completion page never imports or emits Purchase and keeps a normal non-blocking anchor', async () => {
  const source = await readFile(new URL('../src/pages/OrderSuccessPage.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /trackPurchase|facebookConversions|fbq\(/)
  assert.match(source, /href=\{whatsappGroup.url\} onClick=\{handleWhatsAppGroup\}/)
  assert.match(source, /saveCachedOrderSuccessState\(orderSuccessState\)[\s\S]*trackSuccessPageAction\(WHATSAPP_GROUP_CLICK_EVENT, \{ whatsapp_group_id: whatsappGroup.id \}\)/)
  assert.match(source, /ORDER_SUCCESS_STATE_TTL_MS = 2 \* 60 \* 60 \* 1000/)
})
