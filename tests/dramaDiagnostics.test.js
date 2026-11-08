import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bufferedSeconds, mediaErrorDetails, networkDetails, probeMedia } from '../src/services/dramaDiagnostics.js'

test('mediaErrorDetails reports the MediaError and only the host of the signed URL', () => {
  const video = { error: { code: 4, message: 'x'.repeat(300) }, networkState: 3, readyState: 0 }
  const details = mediaErrorDetails(video, 'https://v.babidrama.com/v/ABC/1/480p.mp4?t=123.sig')
  assert.deepEqual({ ...details, error_message: details.error_message.length }, {
    error_code: 4, error_message: 200, network_state: 3, ready_state: 0, media_host: 'v.babidrama.com',
    url: 'https://v.babidrama.com/v/ABC/1/480p.mp4?t=123.sig',
  })
  assert.equal(mediaErrorDetails(null, 'not a url').media_host, null)
  assert.equal(mediaErrorDetails({}, null).error_code, null)
})

test('probeMedia returns the status of a 2-byte CORS request, or the failure', async () => {
  let seen
  const ok = await probeMedia('https://v.example/x.mp4', {
    fetchImpl: async (url, init) => {
      seen = init
      return { status: 206, type: 'cors', headers: new Map([['access-control-allow-origin', 'https://www.brainnel.com'], ['content-type', 'video/mp4']]) }
    },
  })
  assert.deepEqual(ok, { probe_status: 206, probe_type: 'cors', probe_acao: 'https://www.brainnel.com', probe_content_type: 'video/mp4' })
  assert.equal(seen.mode, 'cors')
  assert.equal(seen.headers.Range, 'bytes=0-1')
  const failed = await probeMedia('https://v.example/x.mp4', { fetchImpl: async () => { throw new TypeError('Load failed') } })
  assert.deepEqual(failed, { probe_error: 'TypeError: Load failed' })
})

test('bufferedSeconds reads the first buffered range and never throws', () => {
  assert.equal(bufferedSeconds({ buffered: { length: 1, end: () => 3.14159 } }), 3.1)
  assert.equal(bufferedSeconds({ buffered: { length: 0, end: () => 0 } }), 0)
  assert.equal(bufferedSeconds(null), 0)
  assert.equal(bufferedSeconds({ buffered: { length: 1, end: () => { throw new Error('x') } } }), null)
})

test('networkDetails reports the Network Information API when the browser has it', () => {
  assert.deepEqual(networkDetails({ connection: { effectiveType: '3g', downlink: 0.7, rtt: 450, saveData: true } }), {
    net_type: '3g', net_downlink_mbps: 0.7, net_rtt_ms: 450, net_save_data: true,
  })
  assert.deepEqual(networkDetails({}), {})
  assert.deepEqual(networkDetails(null), {})
})
