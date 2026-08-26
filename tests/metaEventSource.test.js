import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_META_SITE_ORIGIN,
  buildMetaEventSourceUrl,
  resolveMetaSiteOrigin
} from '../src/utils/metaEventSource.js'


test('keeps each supported production origin', () => {
  for (const origin of [
    'https://brainnel.com',
    'https://www.brainnel.com',
    'https://brainnel-vite.com',
    'https://www.brainnel-vite.com'
  ]) {
    assert.equal(resolveMetaSiteOrigin(origin), origin)
  }
})

test('rejects insecure, lookalike, credential and port origins', () => {
  for (const origin of [
    'http://brainnel-vite.com',
    'https://brainnel-vite.com.evil.example',
    'https://user@brainnel-vite.com',
    'https://brainnel-vite.com:444',
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

test('falls back to the canonical legacy site outside production hosts', () => {
  assert.equal(
    buildMetaEventSourceUrl('123', {
      origin: 'https://evil.example',
      href: 'https://evil.example/product/123'
    }),
    'https://www.brainnel.com/product/123'
  )
})
