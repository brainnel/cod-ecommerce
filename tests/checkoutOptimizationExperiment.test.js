import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { getCheckoutOptimizationAssignment as assign, getCheckoutOptimizationBucket,
  getProductClarityCopy, PRODUCT_CLARITY_COPY, CHECKOUT_OPTIMIZATION_EXPERIMENT,
  CHECKOUT_OPTIMIZATION_STAGE } from '../src/utils/checkoutOptimizationExperiment.js'

const target = '900005131392'
const mem = () => {
  const values = new Map()
  return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) }
}
const example = (group, extra = {}) => assign({deviceId:'device-example',productId:target,
  hostname:'localhost', search:`?checkout_optimization_group=${group}`,storage:mem(), ...extra})

// Frozen original contract: changing the production salt/hash must not silently
// reshuffle the existing treatment, control or product-experiment populations.
const originalBucket = deviceId => {
  const text = `cod_opt_20261104_v1:${deviceId}`
  let hash = 2166136261
  for (let i=0;i<text.length;i+=1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash,16777619)
  }
  return (hash >>> 0) % 100
}
const originalGroup = bucket => bucket < 10 ? 'form_guidance_treatment'
  : bucket < 20 ? 'form_guidance_control'
  : bucket < 30 ? 'product_clarity_treatment'
  : bucket < 40 ? 'product_clarity_control' : 'baseline'
const expectedGroup = bucket => bucket >= 40 && bucket < 60
  ? 'form_guidance_treatment' : originalGroup(bucket)
const devicesByBucket = new Map()
for (let i=0;devicesByBucket.size<100 && i<100000;i+=1) {
  const deviceId=`device-frozen-v1-${i}`
  const bucket=originalBucket(deviceId)
  if (!devicesByBucket.has(bucket)) devicesByBucket.set(bucket,deviceId)
}

test('all 100 original buckets stay stable and only baseline 40–59 moves to form treatment', () => {
  assert.equal(CHECKOUT_OPTIMIZATION_EXPERIMENT,'cod_opt_20261104_v1')
  assert.equal(CHECKOUT_OPTIMIZATION_STAGE,'form30_20261109')
  assert.equal(devicesByBucket.size,100)
  const counts={};const moved=[]
  for (let bucket=0;bucket<100;bucket+=1) {
    const deviceId=devicesByBucket.get(bucket)
    assert.equal(getCheckoutOptimizationBucket(deviceId),bucket,`original hash bucket ${bucket}`)
    const a=assign({deviceId,productId:target,hostname:'www.brainnel.com'})
    assert.equal(a.bucket,bucket)
    assert.equal(a.group,expectedGroup(bucket),`group for bucket ${bucket}`)
    assert.equal(a.formGuidanceEnabled,a.group==='form_guidance_treatment')
    assert.equal(a.productClarityEnabled,a.group==='product_clarity_treatment')
    assert.equal(a.stage,'form30_20261109')
    assert.equal(a.analyticsProps.checkout_optimization_stage,'form30_20261109')
    assert.equal(a.analyticsProps.checkout_optimization_bucket,bucket)
    if (a.group!==originalGroup(bucket)) moved.push(bucket)
    else assert.ok(bucket<40 || bucket>=60,`unexpected unchanged expansion bucket ${bucket}`)
    counts[a.group]=(counts[a.group]||0)+1
  }
  assert.deepEqual(moved,Array.from({length:20},(_,i)=>40+i))
  assert.deepEqual(counts,{
    form_guidance_treatment:30,form_guidance_control:10,
    product_clarity_treatment:10,product_clarity_control:10,baseline:40
  })
})

test('stable 30/10/10/10/40 buckets keep treatments mutually exclusive', () => {
  const counts = {}
  for (let i=0;i<20000;i+=1) {
    const input={deviceId:`device-${i}`,productId:target,hostname:'www.brainnel.com'}
    const a=assign(input);assert.deepEqual(a,assign(input))
    assert.equal(a.bucket,getCheckoutOptimizationBucket(input.deviceId))
    assert.ok(!(a.formGuidanceEnabled && a.productClarityEnabled))
    assert.equal(assign({...input,productId:'other'}).group,a.group)
    counts[a.group]=(counts[a.group]||0)+1
  }
  for (const [group,expected] of Object.entries({form_guidance_treatment:6000,
    form_guidance_control:2000,product_clarity_treatment:2000,
    product_clarity_control:2000,baseline:8000})) {
    assert.ok(counts[group]>=expected*0.9 && counts[group]<=expected*1.1,`${group}: ${counts[group]}`)
  }
  assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),20000)
})

test('only three eligible products receive product clarity and controls do not change UI', () => {
  assert.equal(Object.keys(PRODUCT_CLARITY_COPY).length,3)
  for (const productId of Object.keys(PRODUCT_CLARITY_COPY)) assert.equal(example('product_clarity_treatment',{productId}).productClarityEnabled,true)
  for (const productId of ['other','bundle:97','__proto__',null,undefined]) {
    assert.equal(example('product_clarity_treatment',{productId}).productClarityEnabled,false)
    assert.equal(getProductClarityCopy(productId),null)
  }
  for(const group of ['form_guidance_control','product_clarity_control','baseline']) {
    const a=example(group);assert.equal(a.formGuidanceEnabled,false);assert.equal(a.productClarityEnabled,false)
  }
})

test('production ignores query and storage overrides on every non-loopback host', () => {
  const storage={getItem:()=>{throw new Error('must not access preview storage')},setItem:()=>{throw new Error('must not write')}}
  for (const hostname of ['www.brainnel.com','brainnel-vite.com','localhost.evil.example','example.com']) {
    const normal=assign({deviceId:'device-example',productId:target,hostname})
    assert.deepEqual(assign({deviceId:'device-example',productId:target,hostname,storage,
      search:'?checkout_optimization_group=product_clarity_treatment'}),normal)
  }
})

test('local preview override persists across route navigation but disabled rollout always wins', () => {
  for (const hostname of ['localhost','127.0.0.1','[::1]','::1']) {
    const storage=mem()
    const first=assign({deviceId:'device-x',productId:target,hostname,storage,search:'?checkout_optimization_group=form_guidance_treatment'})
    const next=assign({deviceId:'device-x',productId:target,hostname,storage,search:''})
    assert.deepEqual(first,next);assert.equal(next.formGuidanceEnabled,true)
    assert.equal(assign({deviceId:'device-x',productId:target,hostname,storage,enabled:false}).group,'baseline')
    assign({hostname,storage,search:'?checkout_optimization_group=baseline'})
    assert.equal(assign({hostname,storage}).group,'baseline')
  }
})

test('disabling rollout returns every bucket to baseline while preserving explicit stage and bucket', () => {
  for (const [bucket,deviceId] of devicesByBucket) {
    for (const hostname of ['www.brainnel.com','localhost']) {
      const a=assign({deviceId,productId:target,hostname,enabled:false,storage:mem(),
        search:'?checkout_optimization_group=product_clarity_treatment'})
      assert.equal(a.group,'baseline')
      assert.equal(a.formGuidanceEnabled,false)
      assert.equal(a.productClarityEnabled,false)
      assert.equal(a.bucket,bucket)
      assert.equal(a.stage,CHECKOUT_OPTIMIZATION_STAGE)
      assert.equal(a.analyticsProps.checkout_optimization_enabled,false)
      assert.equal(a.analyticsProps.checkout_optimization_preview,false)
      assert.equal(a.analyticsProps.checkout_optimization_stage,CHECKOUT_OPTIMIZATION_STAGE)
    }
  }
})

test('unavailable storage and invalid identifiers do not block rendering', () => {
  const storage={getItem:()=>{throw new Error('disabled')},setItem:()=>{throw new Error('disabled')}}
  assert.equal(assign({deviceId:'device-x',hostname:'localhost',storage}).analyticsProps.checkout_optimization_preview,false)
  assert.equal(example('product_clarity_treatment',{storage}).productClarityEnabled,true)
  for(const deviceId of ['',null,undefined,123,{}]) assert.equal(assign({deviceId}).group,'baseline')
})

test('analytics properties are versioned, explicit assignment, and do not contain customer data', () => {
  const a=example('product_clarity_treatment')
  assert.equal(a.analyticsProps.checkout_optimization_experiment,CHECKOUT_OPTIMIZATION_EXPERIMENT)
  assert.equal(a.stage,CHECKOUT_OPTIMIZATION_STAGE)
  assert.equal(a.analyticsProps.checkout_optimization_stage,CHECKOUT_OPTIMIZATION_STAGE)
  assert.equal(a.analyticsProps.product_clarity_assigned,true)
  assert.equal(a.analyticsProps.form_guidance_assigned,false)
  assert.ok(!JSON.stringify(a.analyticsProps).includes('device-example'))
  assert.ok(!Object.keys(a.analyticsProps).some(k=>/phone|address|email/.test(k)))
})

let server,ClaritySummary,analytics
before(async()=>{
  server=await createServer({server:{middlewareMode:true,hmr:false,ws:false,watch:null},
    optimizeDeps:{noDiscovery:true,include:[]},logLevel:'error'})
  ClaritySummary=(await server.ssrLoadModule('/src/components/landing/LandingClarity.jsx')).ClaritySummary
  analytics=await server.ssrLoadModule('/src/services/checkoutFunnelAnalytics.js')
})
after(async()=>{await server?.close()})

test('treatment adds verified facts while preserving actual price and children without comparison prices',()=>{
  const props={name:'Nom réel',price:8500,referencePrice:12000,children:'Modèle existant'}
  const baseline=renderToStaticMarkup(createElement(ClaritySummary,props))
  assert.doesNotMatch(baseline,/data-product-clarity/)
  for(const copy of Object.values(PRODUCT_CLARITY_COPY)) {
    const treatment=renderToStaticMarkup(createElement(ClaritySummary,{...props,highlights:copy}))
    assert.match(treatment,/data-product-clarity="v1"/)
    assert.ok(treatment.includes(copy.headline));assert.ok(treatment.includes(copy.detail))
    for(const text of ['Nom réel','Modèle existant','8\u202f500','Paiement','Payez']) {
      if(baseline.includes(text)) assert.ok(treatment.includes(text))
    }
    assert.doesNotMatch(treatment,/HD|4K|garanti|Avis clients/)
    assert.doesNotMatch(treatment,/<(?:s|del)\b|12\u202f000|Référence indicative|Achetés séparément/)
  }
})

test('funnel events retain stage and original/expanded buckets through landing, checkout, exposure and success',async()=>{
  const originalWindow=globalThis.window,originalDocument=globalThis.document
  const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator')
  const sent=[]
  globalThis.document={referrer:''}
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{sendBeacon:(url,body)=>{sent.push(body);return true}}})
  try {
    for (const bucket of [0,9,10,19,20,29,30,39,40,49,59,60,99]) {
      sent.length=0
      const localStorage=mem();localStorage.setItem('cod_checkout_device_id',devicesByBucket.get(bucket))
      globalThis.window={localStorage,sessionStorage:mem(),location:{hostname:'www.brainnel.com',
        search:'?checkout_optimization_group=product_clarity_treatment',pathname:'/product/'+target,
        href:'https://www.brainnel.com/product/'+target}}
      const group=expectedGroup(bucket)
      const product={product_id:target,name_fr:'Real product',price:8500,skus:[]}
      const props=analytics.buildCheckoutProductProperties(product)
      assert.equal(props.checkout_optimization_group,group)
      assert.equal(props.checkout_optimization_stage,CHECKOUT_OPTIMIZATION_STAGE)
      assert.equal(props.checkout_quantity_variant,'single_page_checkout')
      const landingSessionId=analytics.trackProductLandingView(product)
      analytics.beginCheckoutFunnel(product)
      globalThis.window.location.search=''
      const steps=['quantity_confirmed','district_selected','info_step_view','submit_order_click']
      for (const event of steps) analytics.trackCheckoutEvent(event)
      if (group.startsWith('form_guidance_')) analytics.trackCheckoutEvent('checkout_guidance_exposed')
      if (group.startsWith('product_clarity_')) analytics.trackProductClarityExposure(product,{
        landing_session_id:landingSessionId,product_clarity_rendered:group==='product_clarity_treatment'
      })
      analytics.trackCheckoutEvent('order_create_success',{order_no:'TEST-NOT-SENT'})
      const events=(await Promise.all(sent.map(b=>b.text()))).map(text=>JSON.parse(text).events[0])
      assert.deepEqual(events.filter(e=>!e.event_name.endsWith('_exposed')).map(e=>e.event_name),
        ['product_landing_view','checkout_start',...steps,'order_create_success'])
      for (const event of events) {
        const p=event.properties
        assert.equal(p.checkout_optimization_experiment,'cod_opt_20261104_v1')
        assert.equal(p.checkout_optimization_stage,'form30_20261109')
        assert.equal(p.checkout_optimization_bucket,bucket)
        assert.equal(p.checkout_optimization_group,group)
        assert.equal(p.checkout_optimization_preview,false)
        assert.equal(p.form_guidance_assigned,group==='form_guidance_treatment')
        assert.equal(p.product_clarity_assigned,group==='product_clarity_treatment')
      }
    }
  } finally {
    globalThis.window=originalWindow;globalThis.document=originalDocument
    if(originalNavigator) Object.defineProperty(globalThis,'navigator',originalNavigator)
    else delete globalThis.navigator
  }
})

test('exposure stays on the landing session and does not manufacture a checkout',async()=>{
  const originalWindow=globalThis.window,originalDocument=globalThis.document
  const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator')
  const sent=[]
  globalThis.window={localStorage:mem(),sessionStorage:mem(),location:{hostname:'localhost',search:'?checkout_optimization_group=product_clarity_treatment',pathname:'/product/'+target,href:'http://localhost/product/'+target}}
  globalThis.document={referrer:''}
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{sendBeacon:(url,body)=>{sent.push(body);return true}}})
  try {
    analytics.trackProductClarityExposure({product_id:target},{landing_session_id:'landing-only',product_clarity_rendered:true})
    const payload=JSON.parse(await sent[0].text())
    assert.equal(payload.events[0].event_name,'product_clarity_exposed')
    assert.equal(payload.events[0].session_id,'landing-only')
    assert.equal(payload.events[0].properties.product_clarity_rendered,true)
    assert.equal(payload.events[0].properties.checkout_optimization_stage,CHECKOUT_OPTIMIZATION_STAGE)
    assert.equal(globalThis.window.sessionStorage.getItem('cod_checkout_session_id'),null)
  } finally {
    globalThis.window=originalWindow;globalThis.document=originalDocument
    if(originalNavigator) Object.defineProperty(globalThis,'navigator',originalNavigator)
    else delete globalThis.navigator
  }
})
