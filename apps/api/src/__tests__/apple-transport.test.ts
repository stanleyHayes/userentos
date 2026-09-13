import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { appleVerificationDeadline, AppleVerificationTimeout, fetchAppleResponse } from '../services/storeBilling/appleTransport.js'
let server: Server
let url: string
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/headers') return
    if (req.url === '/body') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); return }
    if (req.url === '/redirect') { res.writeHead(302, { Location: `${url}/ok` }); res.end(); return }
    if (req.url === '/large') { res.end('x'.repeat(1_000_001)); return }
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '30' }); res.end('{"errorCode":4290000}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
describe('bounded Apple transport with actual HTTP sockets', () => {
  it.each(['/headers', '/body'])('aborts a stalled response at %s', async path => {
    await expect(fetchAppleResponse(`${url}${path}`, {}, 50)).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('rejects redirects and oversized bodies', async () => {
    await expect(fetchAppleResponse(`${url}/redirect`, {})).rejects.toMatchObject({ type: 'no-redirect' })
    await expect(fetchAppleResponse(`${url}/large`, {})).rejects.toMatchObject({ type: 'max-size' })
  })
  it('preserves status, headers and buffered JSON for the official SDK validator', async () => {
    const response = await fetchAppleResponse(`${url}/ok`, {})
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('30')
    expect(await response.json()).toEqual({ errorCode: 4290000 })
  })
  it('rejects a slow verifier without accepting its late result', async () => {
    let finish!: (value: string) => void
    const operation = new Promise<string>(resolve => { finish = resolve })
    await expect(appleVerificationDeadline(operation, 20)).rejects.toBeInstanceOf(AppleVerificationTimeout)
    finish('too late')
    await expect(appleVerificationDeadline(Promise.resolve('verified'), 20)).resolves.toBe('verified')
  })
})
