import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { getCheckoutOptimizationAssignment as assign, getCheckoutOptimizationBucket,
  getProductClarityCopy, PRODUCT_CLARITY_COPY, CHECKOUT_OPTIMIZATION_EXPERIMENT } from '../src/utils/checkoutOptimizationExperiment.js'

const target = '900005131392'
const mem = () => {
  const values = new Map()
  return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) }
}
const example = (group, extra = {}) => assign({deviceId:'device-example',productId:target,
  hostname:'localhost', search:`?checkout_optimization_group=${group}`,storage:mem(), ...extra})

test('stable 10/10/10/10/60 buckets keep treatments mutually exclusive', () => {
  const counts = {}
  for (let i=0;i<20000;i+=1) {
    const input={deviceId:`device-${i}`,productId:target,hostname:'www.brainnel.com'}
    const a=assign(input);assert.deepEqual(a,assign(input))
    assert.equal(a.bucket,getCheckoutOptimizationBucket(input.deviceId))
    assert.ok(!(a.formGuidanceEnabled && a.productClarityEnabled))
    assert.equal(assign({...input,productId:'other'}).group,a.group)
    counts[a.group]=(counts[a.group]||0)+1
  }
  for (const group of ['form_guidance_treatment','form_guidance_control','product_clarity_treatment','product_clarity_control']) {
    assert.ok(counts[group]>=1800 && counts[group]<=2200,`${group}: ${counts[group]}`)
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
  for (const hostname of ['localhost','127.0.0.1','[::1]']) {
    const storage=mem()
    const first=assign({deviceId:'device-x',productId:target,hostname,storage,search:'?checkout_optimization_group=form_guidance_treatment'})
    const next=assign({deviceId:'device-x',productId:target,hostname,storage,search:''})
    assert.deepEqual(first,next);assert.equal(next.formGuidanceEnabled,true)
    assert.equal(assign({deviceId:'device-x',productId:target,hostname,storage,enabled:false}).group,'baseline')
    assign({hostname,storage,search:'?checkout_optimization_group=baseline'})
    assert.equal(assign({hostname,storage}).group,'baseline')
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
    for(const text of ['Nom réel','Modèle existant','8 500','Paiement','Payez']) {
      if(baseline.includes(text)) assert.ok(treatment.includes(text))
    }
    assert.doesNotMatch(treatment,/HD|4K|garanti|Avis clients/)
    assert.doesNotMatch(treatment,/<(?:s|del)\b|12 000|Référence indicative|Achetés séparément/)
  }
})

test('funnel events retain stable assignment through landing, checkout, submit and success',()=>{
  const originalWindow=globalThis.window,originalDocument=globalThis.document
  const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator')
  const sent=[];const localStorage=mem();localStorage.setItem('cod_checkout_device_id','device-analytics-test')
  globalThis.window={localStorage,sessionStorage:mem(),location:{hostname:'localhost',search:'?checkout_optimization_group=form_guidance_treatment',pathname:'/product/'+target,href:'http://localhost/product/'+target}}
  globalThis.document={referrer:''}
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{sendBeacon:(url,body)=>{sent.push(body);return true}}})
  try {
    const product={product_id:target,name_fr:'Real product',price:8500,skus:[]}
    const props=analytics.buildCheckoutProductProperties(product)
    assert.equal(props.checkout_optimization_group,'form_guidance_treatment')
    assert.equal(props.checkout_quantity_variant,'single_page_checkout')
    analytics.trackProductLandingView(product)
    analytics.beginCheckoutFunnel(product)
    globalThis.window.location.search=''
    analytics.trackCheckoutEvent('submit_order_click')
    analytics.trackCheckoutEvent('order_create_success',{order_no:'TEST-NOT-SENT'})
    assert.equal(sent.length,4)
    return Promise.all(sent.map(b=>b.text())).then(texts=>{
      for(const text of texts) {
        const p=JSON.parse(text).events[0].properties
        assert.equal(p.checkout_optimization_group,'form_guidance_treatment')
        assert.equal(p.product_clarity_assigned,false)
      }
    })
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
    assert.equal(globalThis.window.sessionStorage.getItem('cod_checkout_session_id'),null)
  } finally {
    globalThis.window=originalWindow;globalThis.document=originalDocument
    if(originalNavigator) Object.defineProperty(globalThis,'navigator',originalNavigator)
    else delete globalThis.navigator
  }
})
