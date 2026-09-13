import { test, expect } from '@playwright/test'
import { createHash, randomUUID } from 'node:crypto'
import { createCheckoutRequests, isProviderCheckout } from '../../packages/shared/checkoutRequests'

function fixture() {
  const saved = new Map<string, string>()
  const deps = {
    digest: async (text: string) => createHash('sha256').update(text).digest('hex'), randomId: randomUUID,
    read: async (key: string) => saved.get(key) ?? null,
    write: async (key: string, value: string) => { saved.set(key, value) },
    remove: async (key: string) => { saved.delete(key) },
  }
  return { saved, deps, run: createCheckoutRequests(deps) }
}
const payload = JSON.stringify({ agreementId: 'agreement', amount: 100, phone: '0241234567' })
test('a lost checkout response survives restart using the original key without stored payment details', async () => {
  const f = fixture(); const keys: string[] = []
  await expect(f.run('owner', '/payments', payload, async key => { keys.push(key); throw new Error('Response lost') })).rejects.toThrow('Response lost')
  expect(JSON.stringify([...f.saved])).not.toContain('0241234567')
  expect(JSON.stringify([...f.saved])).not.toContain('agreement')
  const restarted = createCheckoutRequests(f.deps)
  expect(await restarted('owner', '/payments', payload, async key => { keys.push(key); return 'original-payment' })).toBe('original-payment')
  expect(keys[1]).toBe(keys[0])
  expect(f.saved.size).toBe(0)
})
test('simultaneous matching submissions share one network operation', async () => {
  const f = fixture(); let sends = 0; let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const send = async () => { sends++; await gate; return 'payment' }
  const first = f.run('owner', '/payments', payload, send)
  const second = f.run('owner', '/payments', payload, send)
  await expect.poll(() => sends).toBe(1); release()
  expect(await Promise.all([first, second])).toEqual(['payment', 'payment'])
})
test('storage failures prevent collection and corrupt keys are never replaced silently', async () => {
  const f = fixture(); let sends = 0
  const broken = createCheckoutRequests({ ...f.deps, write: async () => { throw new Error('Storage unavailable') } })
  await expect(broken('owner', '/payments', payload, async () => { sends++; })).rejects.toThrow('Storage unavailable')
  const corrupt = createCheckoutRequests({ ...f.deps, read: async () => 'bad key' })
  await expect(corrupt('owner', '/payments', payload, async () => { sends++; })).rejects.toThrow('invalid')
  expect(sends).toBe(0)
})
test('a cleanup failure preserves safe replay while successful cleanup permits a later payment', async () => {
  const f = fixture(); const keys: string[] = []
  const send = async (key: string) => { keys.push(key); return 'ok' }
  const noCleanup = createCheckoutRequests({ ...f.deps, remove: async () => { throw new Error('Unavailable') } })
  await noCleanup('owner', '/payments', payload, send)
  await f.run('owner', '/payments', payload, send)
  await f.run('owner', '/payments', payload, send)
  expect(keys[1]).toBe(keys[0]); expect(keys[2]).not.toBe(keys[0])
})
test('owners and endpoints cannot inherit each other’s attempts', async () => {
  const f = fixture(); const keys: string[] = []
  const send = async (key: string) => { keys.push(key); throw new Error('Lost') }
  for (const [owner, path] of [['a', '/payments'], ['b', '/payments'], ['a', '/subscriptions/subscribe']]) {
    await expect(f.run(owner, path, payload, send)).rejects.toThrow('Lost')
  }
  expect(new Set(keys).size).toBe(3)
})
test('only provider checkout receives payment retry handling', () => {
  expect(isProviderCheckout('/payments', {})).toBe(true)
  expect(isProviderCheckout('/savings/wallet/deposit', {})).toBe(true)
  expect(isProviderCheckout('/savings/wallet/withdraw', {})).toBe(false)
  expect(isProviderCheckout('/subscriptions/subscribe', { packageId: 'free' })).toBe(false)
  expect(isProviderCheckout('/subscriptions/subscribe', { packageId: 'paid', method: 'mtn_momo' })).toBe(true)
  expect(isProviderCheckout('/payments/id/receipt', {})).toBe(false)
})

test('timeout aborts a stalled transport and retains the original attempt even if it resolves late', async () => {
  const f = fixture(); let keyUsed = ''; let transportSignal!: AbortSignal; let finish!: (value: string) => void
  const run = createCheckoutRequests({ ...f.deps, timeoutMs: 10 })
  const stalled = run('owner', '/payments', payload, (key, signal) => {
    keyUsed = key; transportSignal = signal
    return new Promise<string>(resolve => { finish = resolve })
  })
  await expect(stalled).rejects.toThrow('timed out')
  expect(transportSignal.aborted).toBe(true)
  finish('late acknowledgement')
  await Promise.resolve()
  expect([...f.saved.values()]).toEqual([keyUsed])
  await f.run('owner', '/payments', payload, async key => { expect(key).toBe(keyUsed) })
})

test('caller cancellation retains the key and prevents a pre-cancelled transport from starting', async () => {
  const f = fixture(); const controller = new AbortController(); controller.abort()
  let sends = 0
  await expect(f.run('owner', '/payments', payload, async () => { sends++ }, controller.signal)).rejects.toThrow('cancelled')
  expect(sends).toBe(0)
  expect(f.saved.size).toBe(1)
})
