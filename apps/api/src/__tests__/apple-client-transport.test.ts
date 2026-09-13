import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { Environment } from '@apple/app-store-server-library'
import { Response } from 'node-fetch'
import { BoundedAppleClient } from '../services/storeBilling/appleTransport.js'
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('node-fetch', async original => ({ ...await original<object>(), default: mocks.fetch }))
const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
beforeEach(() => {
  vi.resetAllMocks()
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ signedTransactionInfo: 'signed-jws' }), { status: 200 }))
})
describe('official Apple client bounded transport integration', () => {
  it.each([
    [Environment.PRODUCTION, 'https://api.storekit.itunes.apple.com'],
    [Environment.SANDBOX, 'https://api.storekit-sandbox.itunes.apple.com'],
  ])('retains SDK authentication and validation for %s', async (environment, endpoint) => {
    const client = new BoundedAppleClient(key, 'KEY1234567', 'issuer', 'gh.rentos.mobile', environment as Environment)
    expect(await client.getTransactionInfo('123456')).toEqual({ signedTransactionInfo: 'signed-jws' })
    expect(mocks.fetch).toHaveBeenCalledWith(`${endpoint}/inApps/v1/transactions/123456?`, expect.objectContaining({ method: 'GET', redirect: 'error', size: 1_000_000, signal: expect.any(AbortSignal), headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer /) }) }))
  })
  it('preserves provider API error classification through the buffered response', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ errorCode: 4040010, errorMessage: 'Not found' }), { status: 404 }))
    const client = new BoundedAppleClient(key, 'KEY1234567', 'issuer', 'gh.rentos.mobile', Environment.PRODUCTION)
    await expect(client.getTransactionInfo('123456')).rejects.toMatchObject({ httpStatusCode: 404, apiError: 4040010 })
  })
})
