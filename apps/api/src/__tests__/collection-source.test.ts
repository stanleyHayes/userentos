import { afterEach, expect, it, vi } from 'vitest'
import { getProvider } from '../services/payments/index.js'
afterEach(() => vi.unstubAllEnvs())
it('keeps saved collections on their originating rail after configuration changes', () => {
  vi.stubEnv('PAYMENTS_PROVIDER_MODE', 'simulated')
  vi.stubEnv('PAYMENTS_RAIL', 'direct')
  expect(getProvider('mtn_momo', 'paystack').source).toBe('paystack')
  expect(getProvider('mtn_momo', 'mtn_momo').source).toBe('mtn_momo')
  vi.stubEnv('PAYMENTS_PROVIDER_MODE', 'live')
  expect(getProvider('mtn_momo', 'simulated').source).toBe('simulated')
  expect(() => getProvider('bank_transfer', 'paystack')).toThrow('Invalid saved')
  expect(() => getProvider('mtn_momo', 'bank_transfer')).toThrow('Invalid saved')
})
