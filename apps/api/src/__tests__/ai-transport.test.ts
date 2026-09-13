import { afterAll, beforeAll, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { createAiFetch } from '../services/aiTransport.js'
let server: Server
let origin: string
let redirected = 0
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/stall-headers') return
    if (req.url === '/stall-body') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); return }
    if (req.url === '/large') { res.end('x'.repeat(1025)); return }
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/target' }); res.end(); return }
    if (req.url === '/target') redirected++
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('request-id', 'fixture-request')
    if (req.url === '/v1/messages') { res.end(JSON.stringify({ id: 'msg_fixture', type: 'message', role: 'assistant', model: 'fixture', content: [{ type: 'text', text: 'Fixture answer' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } })); return }
    if (req.url === '/v1/embeddings') { res.end(JSON.stringify({ object: 'list', data: [{ object: 'embedding', index: 0, embedding: [1, 0] }], model: 'fixture', usage: { prompt_tokens: 1, total_tokens: 1 } })); return }
    res.statusCode = 429; res.end(JSON.stringify({ error: 'fixture provider error' }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
it.each(['/stall-headers', '/stall-body'])('aborts an actual HTTP request stalled at %s', async path => {
  const started = Date.now()
  await expect(createAiFetch(origin, { timeoutMs: 100 })(origin + path)).rejects.toThrow('AI provider request failed')
  expect(Date.now() - started).toBeLessThan(2000)
})
it('rejects excessive bodies and disallowed origins without exposing raw errors', async () => {
  await expect(createAiFetch(origin, { maxResponseBytes: 1024 })(origin + '/large')).rejects.toThrow('AI provider request failed')
  await expect(createAiFetch('https://api.openai.com')(origin + '/target')).rejects.toThrow('endpoint is not allowed')
})
it('does not follow redirects', async () => {
  await expect(createAiFetch(origin)(origin + '/redirect')).rejects.toThrow('AI provider request failed')
  expect(redirected).toBe(0)
})
it('preserves HTTP errors, JSON and request identifiers for SDK classification', async () => {
  const response = await createAiFetch(origin)(origin + '/error')
  expect(response.status).toBe(429)
  expect(response.headers.get('request-id')).toBe('fixture-request')
  expect(await response.json()).toEqual({ error: 'fixture provider error' })
})
it('respects caller cancellation during the response body', async () => {
  const controller = new AbortController()
  const request = createAiFetch(origin)(origin + '/stall-body', { signal: controller.signal })
  setTimeout(() => controller.abort(), 30)
  await expect(request).rejects.toThrow('AI provider request failed')
})
it('works with the installed Anthropic and OpenAI SDK response parsers', async () => {
  const transport = createAiFetch(origin)
  const anthropic = new Anthropic({ apiKey: 'fixture-only', baseURL: origin, maxRetries: 0, fetch: transport })
  const openai = new OpenAI({ apiKey: 'fixture-only', baseURL: origin + '/v1', maxRetries: 0, fetch: transport })
  const answer = await anthropic.messages.create({ model: 'fixture', max_tokens: 10, messages: [{ role: 'user', content: 'Fixture question' }] })
  expect(answer.content[0]).toMatchObject({ type: 'text', text: 'Fixture answer' })
  const vectors = await openai.embeddings.create({ model: 'fixture', input: 'Fixture property', encoding_format: 'float' })
  expect(vectors.data[0].embedding).toEqual([1, 0])
})
