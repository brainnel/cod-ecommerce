import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

let server
let OrderSuccessPage
let DramaPicksCard
let DramaPicksBoundary
const example = {
  product: { product_id: 'test-only', name_fr: 'Produit de démonstration', price: 10500, image_url: ['/logo.png'] },
  quantity: 1,
  userInfo: { fullName: 'Client exemple', phone: '2250700000000', whatsapp: '2250500000000', addressDescription: 'Cocody, près de la pharmacie, portail bleu.' },
  selectedLocation: { name: 'Cocody' }, totalPrice: 10500,
  orderResponse: { order_no: 'FL-TEST-ONLY', order_id: 'test-only' }
}
const picks = {
  pid: '830827813382',
  mode: 'ranked',
  series: [
    { slug: 'le-mari', title: 'Le Mari <infidèle>', genres: ['Romance', 'Vengeance'], episodeCount: 73, freeEpisodes: 5, hook: '💔 Elle surprend son mari…', coverUrl: 'https://img.babidrama.com/i/a/cover-x.webp', watchUrl: 'https://babidrama.com/w/le-mari/1?c=brainnel' },
    { slug: 'la-reine', title: 'La Reine', genres: [], episodeCount: 60, freeEpisodes: 1, hook: '', coverUrl: null, watchUrl: 'https://babidrama.com/w/la-reine/1?c=brainnel' },
    { slug: 'le-boss', title: 'Le Boss', genres: ['Drame'], episodeCount: 40, freeEpisodes: 3, hook: 'x', coverUrl: null, watchUrl: 'https://babidrama.com/w/le-boss/1?c=brainnel' }
  ]
}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    define: { 'import.meta.env.VITE_ENABLE_CONSOLE_LOGS': JSON.stringify('false') },
    logLevel: 'error'
  })
  OrderSuccessPage = (await server.ssrLoadModule('/src/pages/OrderSuccessPage.jsx')).default
  const drama = await server.ssrLoadModule('/src/components/DramaPicksCard.jsx')
  DramaPicksCard = drama.default
  DramaPicksBoundary = drama.DramaPicksBoundary
})
after(async () => { await server?.close() })

const render = (state) => renderToStaticMarkup(createElement(MemoryRouter, {
  initialEntries: [{ pathname: '/order-success', state }]
}, createElement(OrderSuccessPage)))

test('confirmation renders without any WhatsApp group card or invite', () => {
  const html = render(example)
  assert.match(html, /Commande confirmée/)
  assert.doesNotMatch(html, /os-join-group|os-community|chat.whatsapp.com|groupe clients/)
  assert.match(html, /Service client/)
  assert.match(html, /L’app Brainnel/)
})

test('drama card reserves its space for single products and bundles, never for unknown ids', () => {
  for (const productId of ['830827813382', 830827813382, 'bundle:12']) {
    const html = render({ ...example, product: { ...example.product, product_id: productId } })
    assert.match(html, /class="os-drama os-drama-skeleton" aria-hidden="true"/, String(productId))
    assert.ok(html.indexOf('os-drama-skeleton') > html.indexOf('Commande confirmée'))
    assert.ok(html.indexOf('os-drama-skeleton') < html.indexOf('class="os-delivery"'))
  }
  assert.doesNotMatch(render(example), /os-drama/)
})

test('drama card renders the featured series, thumbnails and real new-tab links', () => {
  const html = renderToStaticMarkup(createElement(DramaPicksCard, { pid: '830827813382', preview: picks }))
  assert.match(html, /En attendant votre livraison/)
  assert.match(html, /BabiDrama/)
  assert.match(html, /Le Mari &lt;infidèle&gt;/)
  assert.match(html, /Romance · Vengeance · 73\u00a0épisodes/)
  assert.match(html, /💔 Elle surprend son mari…/)
  assert.match(html, /Regarder l’épisode 1/)
  assert.match(html, /5\u00a0épisodes gratuits · en français/)
  assert.match(html, /<a class="os-drama-cta" href="https:\/\/babidrama.com\/w\/le-mari\/1\?c=brainnel" target="_blank" rel="noopener">/)
  assert.match(html, /<img src="https:\/\/img.babidrama.com\/i\/a\/cover-x.webp" alt="" loading="lazy" decoding="async"/)
  assert.match(html, /Autres séries/)
  assert.equal((html.match(/class="os-drama-thumb"/g) || []).length, 2)
  assert.ok(html.indexOf('la-reine') < html.indexOf('le-boss'), 'ranked keeps API order')
  assert.match(html, /<a class="os-drama-thumb" href="https:\/\/babidrama.com\/w\/la-reine\/1\?c=brainnel" target="_blank" rel="noopener">/)
  assert.doesNotMatch(html, /<video|autoplay/)
})

test('a single series has no thumbnail row; empty, invalid or missing pid render nothing', () => {
  const single = renderToStaticMarkup(createElement(DramaPicksCard, { pid: 'p', preview: { ...picks, series: [picks.series[1]] } }))
  assert.match(single, /La Reine/)
  assert.match(single, /60\u00a0épisodes/)
  assert.match(single, /1\u00a0épisode gratuit · en français/)
  assert.doesNotMatch(single, /Autres séries|os-drama-thumb/)
  assert.equal(renderToStaticMarkup(createElement(DramaPicksCard, { pid: 'p', preview: { ...picks, series: [] } })), '')
  assert.equal(renderToStaticMarkup(createElement(DramaPicksCard, { pid: 'p', preview: { series: [{ slug: 'x', title: 'X', watchUrl: 'javascript:alert(1)' }] } })), '')
  assert.equal(renderToStaticMarkup(createElement(DramaPicksCard, { pid: null, preview: picks })), '')
  assert.equal(renderToStaticMarkup(createElement(DramaPicksCard, { pid: null })), '')
})

test('drama error boundary swallows render failures and renders nothing', (t) => {
  t.mock.method(console, 'warn', () => {})
  assert.deepEqual(DramaPicksBoundary.getDerivedStateFromError(new Error('boom')), { failed: true })
  const errors = []
  const boundary = new DramaPicksBoundary({ children: 'child', onError: (error) => errors.push(error) })
  assert.equal(boundary.render(), 'child')
  boundary.state = { failed: true }
  assert.equal(boundary.render(), null)
  boundary.componentDidCatch(new Error('boom'))
  assert.equal(errors.length, 1)
  const throwing = new DramaPicksBoundary({ onError: () => { throw new Error('analytics down') } })
  assert.doesNotThrow(() => throwing.componentDidCatch(new Error('boom')))
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

test('absent order state never exposes a confirmation or drama card', () => {
  const html = render(undefined)
  assert.match(html, /Chargement de votre commande/)
  assert.doesNotMatch(html, /os-drama|Commande confirmée/)
})

test('recent session cache restores the confirmation after returning from another site', () => {
  const previousWindow = globalThis.window
  globalThis.window = { sessionStorage: { getItem: () => JSON.stringify({ savedAt: Date.now(), state: example }) } }
  try {
    const html = render(undefined)
    assert.match(html, /Commande confirmée/)
    assert.match(html, /FL-TEST-ONLY/)
    assert.doesNotMatch(html, /chat.whatsapp.com/)
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
    try { assert.doesNotMatch(render(undefined), /os-drama|Commande confirmée/) }
    finally {
      if (previousWindow === undefined) delete globalThis.window
      else globalThis.window = previousWindow
    }
  }
  assert.equal(warning.mock.calls.length, 1)
})

test('completion page never emits Purchase, isolates the drama card and saves state before leaving', async () => {
  const source = await readFile(new URL('../src/pages/OrderSuccessPage.jsx', import.meta.url), 'utf8')
  const cardSource = await readFile(new URL('../src/components/DramaPicksCard.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /trackPurchase|facebookConversions|fbq\(/)
  assert.doesNotMatch(source, /customerCommunity|WhatsAppCommunity|customer-community/)
  assert.ok(source.indexOf('id="os-confirmation-title"') < source.indexOf('<DramaPicksBoundary'))
  assert.ok(source.indexOf('<DramaPicksBoundary') < source.indexOf('<DramaPicksCard'))
  assert.ok(source.indexOf('</DramaPicksBoundary>') < source.indexOf('<section className="os-delivery"'))
  assert.match(source, /handleDramaLeave = \(\) => \{\s*if \(!previewState\) saveCachedOrderSuccessState\(orderSuccessState\)/)
  assert.match(source, /onTrack=\{trackSuccessPageAction\}/)
  assert.match(source, /https:\/\/wa\.me\//)
  assert.match(cardSource, /safely\(\(\) => onLeave\?\.\(\)\)[\s\S]*'order_success_drama_click', \{ pid, series: series.slug, slot, mode: picks.mode \}/)
  assert.match(source, /ORDER_SUCCESS_STATE_TTL_MS = 2 \* 60 \* 60 \* 1000/)
  // The dev fixture is only reachable from the DEV-only preview path.
  assert.match(source, /const getDevDramaPreview = \(search\) => \{\s*if \(!import\.meta\.env\.DEV\) return null/)
})
