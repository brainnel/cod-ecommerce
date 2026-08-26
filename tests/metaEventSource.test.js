import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_META_SITE_ORIGIN,
  buildMetaEventSourceUrl,
  resolveMetaSiteOrigin
} from '../src/utils/metaEventSource.js'


test('keeps any valid web origin without a domain allowlist', () => {
  for (const origin of [
    'https://brainnel.com',
    'https://www.brainnel.com',
    'https://brainnel-vite.com',
    'https://www.brainnel-vite.com',
    'https://future-campaign.example',
    'http://localhost:5173'
  ]) {
    assert.equal(resolveMetaSiteOrigin(origin), origin)
  }
})

test('rejects non-web, credential and invalid origins', () => {
  for (const origin of [
    'https://user@brainnel-vite.com',
    'ftp://brainnel-vite.com',
    'javascript:alert(1)',
    'not-a-url'
  ]) {
    assert.equal(resolveMetaSiteOrigin(origin), DEFAULT_META_SITE_ORIGIN)
  }
})

test('builds product and bundle URLs on the active site', () => {
  const locationLike = {
    origin: 'https://brainnel-vite.com',
    href: 'https://brainnel-vite.com/product/123?fbclid=test'
  }

  assert.equal(
    buildMetaEventSourceUrl('123', locationLike),
    'https://brainnel-vite.com/product/123'
  )
  assert.equal(
    buildMetaEventSourceUrl('bundle:45', locationLike),
    'https://brainnel-vite.com/bundle/45'
  )
  assert.equal(
    buildMetaEventSourceUrl('https://www.brainnel.com/product/789?old=1', locationLike),
    'https://brainnel-vite.com/product/789'
  )
})

test('uses the current page for events without a product and removes fragments', () => {
  assert.equal(
    buildMetaEventSourceUrl(null, {
      origin: 'https://brainnel-vite.com',
      href: 'https://brainnel-vite.com/payment?step=1#details'
    }),
    'https://brainnel-vite.com/payment?step=1'
  )
})

test('uses a future campaign domain without code changes', () => {
  assert.equal(
    buildMetaEventSourceUrl('123', {
      origin: 'https://future-campaign.example',
      href: 'https://future-campaign.example/product/123'
    }),
    'https://future-campaign.example/product/123'
  )
})

test('falls back only when the runtime URL is invalid', () => {
  assert.equal(
    buildMetaEventSourceUrl('123', { origin: 'invalid', href: 'invalid' }),
    'https://www.brainnel.com/product/123'
  )
})
