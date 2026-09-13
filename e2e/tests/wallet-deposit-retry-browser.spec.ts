import { test, expect } from '../fixtures/auth'

test('a lost wallet-deposit response retries the original simulated payment and credits once', async ({ authedPage: page }) => {
  await page.goto('/savings')
  const before = await page.evaluate(async () => {
    const path = '/src/lib/api.ts'; const { api } = await import(path)
    return { mode: (await api.get('/payments/methods')).mode, balance: (await api.get('/savings/wallet')).balance }
  })
  expect(before.mode).toBe('simulated')
  const keys: string[] = []; let originalId = ''
  await page.route('**/api/savings/wallet/deposit', async route => {
    keys.push(route.request().headers()['idempotency-key'])
    if (keys.length !== 1) return route.continue()
    const accepted = await route.fetch()
    expect(accepted.status()).toBe(201)
    originalId = (await accepted.json()).data.payment.id
    await route.abort('connectionreset')
  })
  const deposit = () => page.evaluate(async () => {
    const path = '/src/lib/api.ts'; const { api } = await import(path)
    try { return await api.post('/savings/wallet/deposit', { amount: 1, method: 'bank_transfer' }) }
    catch (failure) { return { error: (failure as Error).message } }
  })
  expect(await deposit()).toHaveProperty('error')
  expect(originalId).toBeTruthy()
  const retried = await deposit()
  expect(retried.payment.id).toBe(originalId)
  expect(keys).toHaveLength(2)
  expect(keys[0]).toMatch(/^[\da-f-]{36}$/)
  expect(keys[1]).toBe(keys[0])
  await expect.poll(() => page.evaluate(async id => {
    const path = '/src/lib/api.ts'; const { api } = await import(path)
    return (await api.get(`/payments/${id}`)).walletCreditCompletedAt
  }, originalId)).toBeTruthy()
  const balance = await page.evaluate(async () => {
    const path = '/src/lib/api.ts'; const { api } = await import(path)
    return (await api.get('/savings/wallet')).balance
  })
  expect(balance).toBe(Math.round((before.balance + 1) * 100) / 100)
})
