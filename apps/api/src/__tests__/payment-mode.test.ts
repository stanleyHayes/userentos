import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMode } from '../services/payments/index.js'

describe('payment provider mode in production', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('refuses simulated collections unless a staging deployment opts in', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PAYMENTS_PROVIDER_MODE', 'simulated')
    vi.stubEnv('ALLOW_SIMULATED_PAYMENTS', '')
    expect(() => getMode()).toThrow('ALLOW_SIMULATED_PAYMENTS')
  })

  it('allows an explicitly opted-in staging deployment to simulate', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PAYMENTS_PROVIDER_MODE', 'simulated')
    vi.stubEnv('ALLOW_SIMULATED_PAYMENTS', 'true')
    expect(getMode()).toBe('simulated')
  })

  it('still requires an explicit mode in production and accepts live', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PAYMENTS_PROVIDER_MODE', '')
    expect(() => getMode()).toThrow('must be explicitly set')
    vi.stubEnv('PAYMENTS_PROVIDER_MODE', 'live')
    expect(getMode()).toBe('live')
  })
})
