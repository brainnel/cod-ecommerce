import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyCheckoutDeliveryArea, validateCheckoutDeliveryArea } from '../src/utils/checkoutDeliveryArea.js'
import { validateCheckoutAddress } from '../src/utils/checkoutAddress.js'

test('explicit outside destinations show the city and block before order creation', () => {
  for (const [address, city] of [
    ['Bouaké quartier Air France', 'Bouaké'],
    ['Je suis à Divo', 'Divo'],
    ['San-Pedro quartier Bardot', 'San Pedro'],
    ['Livrer la commande à Bonoua', 'Bonoua'],
    ['Dabou tchotchoraff', 'Dabou'],
    ['Man gare TSR', 'Man'],
    ['Agbovilla', 'Agboville'],
    ['Irobo', 'Grand-Lahou']
  ]) {
    const result = validateCheckoutAddress(address)
    assert.equal(result.isValid, false, address)
    assert.equal(result.reason, 'outside_delivery_area', address)
    assert.equal(result.matchedLocation, city, address)
    assert.ok(result.error.includes(city), address)
  }
})

test('roads, stations and similar names do not become outside destinations', () => {
  for (const address of [
    'Yopougon route de Dabou',
    'Adjamé gare de Bondoukou',
    'Yopougon quartier Divo',
    'Cocody route de Man',
    'Cocody rue de Man',
    'bingerville m\'batto bouaké',
    'Bingerville mbatto bouake',
    'M’Batto-Bouaké prolongement du carrefour N\'Da',
    'Adjamé sbta Agboville',
    'Yopougon en allant à Adzopé',
    'Grand-Bassam quartier France',
    'Bingerville',
    'Anyama Abidjan',
    'Songon',
    'Marcory Anoumabo',
    'Mankono'
  ]) {
    assert.equal(validateCheckoutDeliveryArea(address).isValid, true, address)
  }
})

test('selected subarea and buyer-message context match the backend policy', () => {
  assert.equal(classifyCheckoutDeliveryArea('Divo', { selectedSubarea: 'Quartier Divo' }).confidence, 'ambiguous')
  assert.equal(classifyCheckoutDeliveryArea('Cocody Riviera', { buyerMessage: 'Livraison à Daloa' }).confidence, 'high')
  assert.equal(classifyCheckoutDeliveryArea('Je suis pas à Abidjan').reason, 'explicit_outside_abidjan_phrase')
  assert.equal(classifyCheckoutDeliveryArea('Cocody route de Dabou, livraison à Bouaké').location, 'Bouaké')
})

test('editing an outside address to a deliverable address removes the block', () => {
  for (let n = 0; n < 3; n += 1) {
    assert.equal(validateCheckoutDeliveryArea('Bouaké').isValid, false)
    assert.equal(validateCheckoutDeliveryArea('Cocody Riviera 3').isValid, true)
    assert.equal(validateCheckoutDeliveryArea('').isValid, true)
  }
  assert.equal(validateCheckoutAddress('Cocody Riviera 3').isValid, true)
  assert.equal(validateCheckoutAddress('aaaaaa').isValid, false)
})

test('actual local schools and Abatta addresses are not statistical gibberish', () => {
  for (const address of [
    'Abatta cyte belvue',
    'Cours scolaire methodiste John wesley ( Djorobité 2 ) Angré',
    'Cours scolaire methodiste John wesley ( Djorobité 2 )',
    'Treichville entre le CBCG et le collège Autoroute précisément au fdfp',
    'Cocody Abatta, Ecoles Internationales Maarif de Türkiye',
    'contact@example.com Yopougon académie collège André Gide'
  ]) assert.equal(validateCheckoutAddress(address).isValid, true, address)
  assert.equal(validateCheckoutAddress('contact@example.com').isValid, false)
  assert.equal(validateCheckoutAddress('Dksgdjfhkfngbdls agueh').isValid, false)
})
