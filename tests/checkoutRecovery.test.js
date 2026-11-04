import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { DISTRICT_LIST_CACHE_KEY, DISTRICT_LIST_TTL_MS, flattenDistrictCities, loadCheckoutDistricts, readDistrictCache, validateDistrictCities } from '../src/services/checkoutDistricts.js'
import { getCheckoutGuidance, getDistrictAddressExample } from '../src/utils/checkoutGuidance.js'

const cities = [{ id: 1, name: 'Abidjan', districts: [{ id: 7, name: 'Cocody', display_name: 'Cocody', latitude: '5.36', longitude: '-3.99' }] }]
const storage = initial => { const values = new Map(initial); return { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v) } }
const response = data => ({ ok: true, json: async () => data })

test('district response validates coordinates, ids and uniqueness before caching', () => {
  const result = validateDistrictCities(cities)
  assert.equal(result[0].districts[0].latitude, 5.36)
  assert.equal(flattenDistrictCities(result)[0].city_id, 1)
  for (const data of [null, {}, [], [{ ...cities[0], districts: [] }], [{ ...cities[0], districts: [cities[0].districts[0], cities[0].districts[0]] }]]) {
    assert.throws(() => validateDistrictCities(data))
  }
  for (const latitude of [null, '', 'NaN', 91]) assert.throws(() => validateDistrictCities([{ ...cities[0], districts: [{ ...cities[0].districts[0], latitude }] }]))
})

test('district cache ignores corrupt, future and expired records', () => {
  const s=storage(); const now=100000000
  for (const value of ['{', '{}', JSON.stringify({ savedAt: now+1, cities }), JSON.stringify({ savedAt: now-DISTRICT_LIST_TTL_MS-1, cities }), JSON.stringify({savedAt: now, cities: []})]) {
    s.setItem(DISTRICT_LIST_CACHE_KEY, value)
    assert.equal(readDistrictCache(s, now), null)
  }
  s.setItem(DISTRICT_LIST_CACHE_KEY, JSON.stringify({ savedAt: now-1, cities }))
  assert.equal(readDistrictCache(s, now)[0].districts.length, 1)
  assert.equal(readDistrictCache({getItem: () => {throw new Error('privacy mode')}},now),null)
})

test('district read retries once, then publishes and stores valid data', async () => {
  const states=[], events=[],s=storage(); let calls=0
  await loadCheckoutDistricts({url:'/districts',storage:s,retryDelayMs:1,fetcher:async () => {
    calls++;if(calls===1)throw new Error('offline');return response(cities)
  },onState:v=>states.push(v),onEvent:(name,p)=>events.push({name,...p})})
  assert.equal(calls,2);assert.equal(states.at(-1).source,'network');assert.equal(states.at(-1).error,false)
  assert.equal(readDistrictCache(s)[0].name,'Abidjan')
  assert.equal(events.filter(x=>x.name==='district_list_load_failed').length,1)
})

test('network failure retains a valid cached region list with a recoverable error state', async () => {
  const s=storage([[DISTRICT_LIST_CACHE_KEY,JSON.stringify({savedAt:Date.now(),cities})]]), states=[]
  await loadCheckoutDistricts({url:'/districts',storage:s,retryDelayMs:1,fetcher:async()=>{throw new Error('offline')},onState:v=>states.push(v)})
  assert.equal(states[0].source,'none');assert.equal(states[1].source,'cache');assert.equal(states[1].cities.length,1)
  assert.equal(states.at(-1).error,true);assert.equal(states.at(-1).source,'cache');assert.equal(states.at(-1).loading,false)
})

test('timeouts are bounded even if transport does not settle; no stale fallback after expiry', async () => {
  const s=storage([[DISTRICT_LIST_CACHE_KEY,JSON.stringify({savedAt:Date.now()-DISTRICT_LIST_TTL_MS-100,cities})]]), states=[], events=[]
  let calls=0
  await loadCheckoutDistricts({url:'/districts',storage:s,timeoutMs:5,retryDelayMs:1,
    fetcher:()=>{calls++;return new Promise(()=>{})},onState:v=>states.push(v),onEvent:(n,p)=>events.push({n,...p})})
  assert.equal(calls,2);assert.equal(states.at(-1).source,'none');assert.deepEqual(states.at(-1).cities,[])
  assert.ok(events.every(e=>e.reason==='district_timeout'))
})

test('invalid network data never replaces last good cache and manual rerun recovers', async () => {
  const s=storage([[DISTRICT_LIST_CACHE_KEY,JSON.stringify({savedAt:Date.now(),cities})]]), states=[]
  await loadCheckoutDistricts({url:'/districts',storage:s,retryDelayMs:1,fetcher:async()=>response([]),onState:v=>states.push(v)})
  assert.equal(states.at(-1).source,'cache');assert.equal(readDistrictCache(s)[0].name,'Abidjan')
  await loadCheckoutDistricts({url:'/districts',storage:s,fetcher:async()=>response(cities),onState:v=>states.push(v)})
  assert.equal(states.at(-1).source,'network');assert.equal(states.at(-1).error,false)
})

test('unmounted region requests publish nothing further and optional telemetry cannot break loading', async () => {
  const controller=new AbortController(),states=[]
  await loadCheckoutDistricts({url:'/districts',signal:controller.signal,fetcher:async()=>{controller.abort();return response(cities)},onState:v=>states.push(v)})
  assert.equal(states.length,1)
  await loadCheckoutDistricts({url:'/districts',fetcher:async()=>response(cities),onState:v=>states.push(v),onEvent:()=>{throw new Error('analytics unavailable')}})
  assert.equal(states.at(-1).source,'network')
})

test('guidance progresses through existing fields, then keeps the original submit action', () => {
  assert.equal(getCheckoutGuidance({}).field,'fullName')
  assert.equal(getCheckoutGuidance({fullNameReady:true}).field,'phone')
  assert.equal(getCheckoutGuidance({fullNameReady:true,phoneReady:true}).field,'addressDescription')
  assert.deepEqual(getCheckoutGuidance({fullNameReady:true,phoneReady:true,addressReady:true}),{field:null,label:'Passer la commande'})
  assert.match(getDistrictAddressExample('Yopougon'),/Yopougon/)
  assert.doesNotMatch(getDistrictAddressExample('Yopougon'),/Cocody/)
})

test('recovery integration preserves order and Purchase contracts and never auto reloads', async () => {
  const payment=await readFile(new URL('../src/pages/PaymentPage.jsx',import.meta.url),'utf8')
  const boundary=await readFile(new URL('../src/components/RouteRecoveryBoundary.jsx',import.meta.url),'utf8')
  assert.match(payment,/checkout_district_not_ready/)
  assert.match(payment,/optimization\.formGuidanceEnabled && guidance\.field/)
  assert.match(payment,/await orderAPI\.createOrder\(orderData\)/)
  assert.match(payment,/void trackPurchaseEvent\(response\.data\)/)
  assert.match(payment,/checkout_guidance_exposed/)
  assert.equal((boundary.match(/window\.location\.reload\(\)/g)||[]).length,1)
  assert.match(boundary,/onClick=\{\(\) =>/)
  assert.doesNotMatch(boundary,/setInterval|setTimeout|sessionStorage\.clear|localStorage\.clear|orderAPI/)
})
