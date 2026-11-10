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

test('drama card renders the inline player of the featured series, its continue link and thumbnails', () => {
  const html = renderToStaticMarkup(createElement(DramaPicksCard, { pid: '830827813382', preview: picks }))
  assert.match(html, /En attendant votre livraison/)
  assert.match(html, /<img class="os-drama-logo" src="\/babidrama\/babidrama-logo-64.png"/)
  assert.match(html, /BabiDrama/)
  // One persistent video: 9:16 contain, CORS mode for v.babidrama.com, no source before the client fetch.
  assert.equal((html.match(/<video/g) || []).length, 1)
  const video = html.match(/<video[^>]*>/)[0]
  assert.match(video, /class="os-drama-video"/)
  assert.match(video, /playsinline=""/)
  assert.match(video, /crossorigin="anonymous"/)
  assert.match(video, /preload="metadata"/)
  // The cover is a plain <img> under the video, never its CORS-mode `poster` (img.babidrama.com
  // sends no CORS headers; WebKit then fires `error` on the video).
  assert.doesNotMatch(video, /poster=/)
  assert.match(html, /<img class="os-drama-poster" src="https:\/\/img.babidrama.com\/i\/a\/cover-x.webp" alt="" aria-hidden="true"/)
  assert.doesNotMatch(html.match(/<img class="os-drama-poster"[^>]*>/)[0], /crossorigin/)
  assert.doesNotMatch(video, /\ssrc=|autoplay|controls/)
  assert.match(html, /<h3>Le Mari &lt;infidèle&gt;<\/h3>/)
  assert.match(html, /Épisode 1 · gratuit/)
  assert.match(html, /Romance · Vengeance/)
  assert.match(html, /class="os-drama-center os-drama-spinner"/, 'loading until the episode arrives')
  assert.match(html, /aria-label="Couper le son"/)
  // Links to BabiDrama say which product, which link and which test variant sent the customer.
  assert.match(html, /<a class="os-drama-cta" href="https:\/\/babidrama.com\/w\/le-mari\/1\?c=brainnel&amp;p=830827813382&amp;src=continue&amp;v=a" target="_blank" rel="noopener">/)
  assert.match(html, /Continuer sur BabiDrama/)
  assert.match(html, /Les 5 premiers épisodes sont gratuits/)
  assert.doesNotMatch(html, /Regarder ici|Touchez pour|Lecture impossible/)
  assert.match(html, /Autres séries/)
  assert.equal((html.match(/class="os-drama-thumb"/g) || []).length, 2)
  assert.ok(html.indexOf('Regarder La Reine') < html.indexOf('Regarder Le Boss'), 'ranked keeps API order')
  // Other series open BabiDrama directly (no in-page switch).
  assert.match(html, /<a class="os-drama-thumb" href="https:\/\/babidrama.com\/w\/la-reine\/1\?c=brainnel&amp;p=830827813382&amp;src=thumbnail&amp;v=a" target="_blank" rel="noopener" aria-label="Regarder La Reine sur BabiDrama">/)
  assert.doesNotMatch(html, /<button type="button" class="os-drama-thumb"/)
  assert.ok(html.indexOf('<video') < html.indexOf('os-drama-cta'), 'player above the link')
  assert.ok(html.indexOf('os-drama-cta') < html.indexOf('Autres séries'), 'thumbnails below the link')
})

test('variants b and c show no link to BabiDrama while episode 1 loads or plays; the order number picks the variant', () => {
  for (const variant of ['b', 'c']) {
    const html = renderToStaticMarkup(createElement(DramaPicksCard, { pid: '830827813382', preview: { ...picks, variant } }))
    assert.equal((html.match(/<video/g) || []).length, 1, variant)
    assert.doesNotMatch(html, /os-drama-cta|Continuer sur BabiDrama/, variant)
    assert.match(html, /Les 5 premiers épisodes sont gratuits/, variant)
    // The other series still open BabiDrama, tagged with the variant.
    assert.match(html, new RegExp(`la-reine\\/1\\?c=brainnel&amp;p=830827813382&amp;src=thumbnail&amp;v=${variant}"`), variant)
    assert.doesNotMatch(html, /os-drama-end|commence dans/, variant)
  }
  // Without a preview override the order number decides, and stays the same for that order.
  const byOrder = (orderNo) => renderToStaticMarkup(createElement(DramaPicksCard, { pid: '830827813382', impressionKey: orderNo, preview: picks }))
  const seen = new Set()
  for (let n = 0; n < 60; n += 1) {
    const html = byOrder(`FL-66${String(n).padStart(4, '0')}-00001`)
    const variant = html.match(/src=thumbnail&amp;v=([abc])"/)[1]
    seen.add(variant)
    assert.equal(/os-drama-cta/.test(html), variant === 'a', variant)
    assert.equal(byOrder(`FL-66${String(n).padStart(4, '0')}-00001`), html)
  }
  assert.deepEqual([...seen].sort(), ['a', 'b', 'c'])
})

test('a single series has no thumbnail row; empty, invalid or missing pid render nothing', () => {
  const single = renderToStaticMarkup(createElement(DramaPicksCard, { pid: 'p', preview: { ...picks, series: [picks.series[1]] } }))
  assert.match(single, /La Reine/)
  assert.match(single, /Le premier épisode est gratuit/)
  assert.doesNotMatch(single, /os-drama-genres/, 'no genres, no empty line')
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
  const playerSource = await readFile(new URL('../src/components/DramaPlayer.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /trackPurchase|facebookConversions|fbq\(/)
  assert.doesNotMatch(source, /customerCommunity|WhatsAppCommunity|customer-community/)
  assert.ok(source.indexOf('id="os-confirmation-title"') < source.indexOf('<DramaPicksBoundary'))
  assert.ok(source.indexOf('<DramaPicksBoundary') < source.indexOf('<DramaPicksCard'))
  assert.ok(source.indexOf('</DramaPicksBoundary>') < source.indexOf('<section className="os-delivery"'))
  assert.match(source, /handleDramaLeave = \(\) => \{\s*if \(!previewState\) saveCachedOrderSuccessState\(orderSuccessState\)/)
  assert.match(source, /onTrack=\{trackSuccessPageAction\}/)
  assert.match(source, /https:\/\/wa\.me\//)
  // Leaving for BabiDrama saves the confirmation first, then counts the open.
  assert.match(cardSource, /const handleOpenSite = [\s\S]*?safely\(\(\) => onLeave\?\.\(\)\)[\s\S]*?type: 'open'[\s\S]*?'order_success_drama_open'/)
  assert.match(cardSource, /'order_success_drama_click', series, slot, \{ action \}/)
  assert.match(cardSource, /'order_success_drama_complete'/)
  // A finished episode 1 is reported to BabiDrama once (it orders the big card by it).
  assert.match(cardSource, /completedKeys\.add\(key\)[\s\S]*?type: 'complete'/)
  assert.match(cardSource, /'order_success_drama_progress'/)
  assert.match(cardSource, /'order_success_drama_exit'/)
  // Every event carries the test variant.
  assert.match(cardSource, /pid, series: series\.slug, slot, mode: picks\.mode, variant, \.\.\.extra/)
  // Only variant c leaves by itself, after the countdown, in a visible page, saving the page first.
  assert.equal((playerSource.match(/window\.location\.assign/g) || []).length, 1)
  assert.match(playerSource, /status !== 'ended' \|\| variant !== 'c' \|\| !hasNext/)
  assert.match(playerSource, /document\.hidden\) \|\| !inViewRef\.current\) return undefined\s+const target = link\(nextHref, 'auto_next'\)\s+onLeave\('auto_next'\)/)
  assert.doesNotMatch(cardSource, /location\.assign|location\.href\s*=/)
  assert.match(playerSource, /crossOrigin="anonymous"/)
  // Inline only: no history entries, no dialogs, no full-screen takeover.
  for (const code of [source, cardSource, playerSource]) assert.doesNotMatch(code, /pushState|replaceState|history\.|requestFullscreen/)
  assert.match(source, /ORDER_SUCCESS_STATE_TTL_MS = 2 \* 60 \* 60 \* 1000/)
  // The dev fixture is only reachable from the DEV-only preview path.
  assert.match(source, /const getDevDramaPreview = \(search\) => \{\s*if \(!import\.meta\.env\.DEV\) return null/)
})
