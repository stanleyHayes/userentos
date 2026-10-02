import { describe, it, expect, afterEach, vi } from 'vitest'
import { availableMethods, isMethodAvailable, unavailableMethodError } from '../services/payments/index.js'

/**
 * Bank transfer is "pay by reference": the payer is shown a deposit account
 * number and sends money to it from their banking app. With
 * BANK_DEPOSIT_ACCOUNT unset the adapter falls back to `0000000000` at
 * "Stanbic Bank Ghana" — a placeholder that is right for a demo and very
 * wrong in production.
 *
 * "Bank Transfer" is offered in the payments and subscription UIs, so an
 * unguarded pick told a tenant to transfer real rent to a fake account, with
 * no webhook ever arriving to reconcile it.
 */

afterEach(() => { vi.unstubAllEnvs() })

function live() {
  vi.stubEnv('PAYMENTS_PROVIDER_MODE', 'live')
}

describe('payment rail availability', () => {
  it('hides bank transfer in live mode when no deposit account is configured', () => {
    live()
    vi.stubEnv('BANK_DEPOSIT_ACCOUNT', '')
    vi.stubEnv('BANK_PSP_WEBHOOK_SECRET', '')

    expect(isMethodAvailable('bank_transfer')).toBe(false)
    expect(availableMethods()).not.toContain('bank_transfer')
  })

  it('still hides it when the account is set but the webhook secret is not', () => {
    // Without the secret no inbound transfer can ever be verified, so the
    // money arrives and the payment stays pending forever.
    live()
    vi.stubEnv('BANK_DEPOSIT_ACCOUNT', '1234567890')
    vi.stubEnv('BANK_PSP_WEBHOOK_SECRET', '')

    expect(isMethodAvailable('bank_transfer')).toBe(false)
  })

  it('offers it once both are configured', () => {
    live()
    vi.stubEnv('BANK_DEPOSIT_ACCOUNT', '1234567890')
    vi.stubEnv('BANK_PSP_WEBHOOK_SECRET', 'a-real-secret')

    expect(isMethodAvailable('bank_transfer')).toBe(true)
    expect(availableMethods()).toContain('bank_transfer')
  })

  it('treats a blank value as unset, not as configuration', () => {
    // `BANK_DEPOSIT_ACCOUNT=` in a .env file is an empty STRING.
    live()
    vi.stubEnv('BANK_DEPOSIT_ACCOUNT', '   ')
    vi.stubEnv('BANK_PSP_WEBHOOK_SECRET', '   ')
    expect(isMethodAvailable('bank_transfer')).toBe(false)
  })

  it('offers every mobile-money rail once Paystack is configured — they ride Paystack', () => {
    live()
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_live_configured')
    vi.stubEnv('BANK_DEPOSIT_ACCOUNT', '')
    const methods = availableMethods()
    expect(methods).toEqual(
      expect.arrayContaining(['mtn_momo', 'telecel_cash', 'airteltigo_money']),
    )
  })

  it('offers no mobile money without a Paystack key, and checkouts say to try again later', () => {
    // Production ran like this: subscribing answered 500 after recording a
    // pending payment, which then blocked the next attempt as "in progress".
    live()
    vi.stubEnv('PAYSTACK_SECRET_KEY', '')
    vi.stubEnv('BANK_DEPOSIT_ACCOUNT', '')
    for (const method of ['mtn_momo', 'telecel_cash', 'airteltigo_money'] as const) expect(isMethodAvailable(method)).toBe(false)
    expect(availableMethods()).toEqual([])
    expect(unavailableMethodError()).toEqual({ message: 'Payments are not available right now. Please try again later.', status: 503 })
  })

  it('asks for another method when only the chosen one is unavailable', () => {
    live()
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_live_configured')
    vi.stubEnv('BANK_DEPOSIT_ACCOUNT', '')
    expect(isMethodAvailable('bank_transfer')).toBe(false)
    expect(unavailableMethodError()).toEqual({ message: 'That payment method is not available right now. Please choose another.', status: 422 })
  })

  it('gates nothing in simulated mode, where no real money moves', () => {
    vi.stubEnv('PAYMENTS_PROVIDER_MODE', 'simulated')
    vi.stubEnv('BANK_DEPOSIT_ACCOUNT', '')
    expect(isMethodAvailable('bank_transfer')).toBe(true)
  })
})

describe('test key in live mode', () => {
  /**
   * PAYMENTS_PROVIDER_MODE=live with sk_test_ is a real integration against
   * Paystack's TEST environment: the webhook flow, signature check and
   * settlement all run the production code path, and no money moves. Right
   * for staging, and the single most dangerous configuration to reach real
   * tenants — charges "succeed" and the platform marks rent paid.
   */
  it('warns when live mode runs on a test key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('PAYMENTS_PROVIDER_MODE', 'live')
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_abc123')

    const { warnOnTestKeyInLiveMode } = await import('../services/payments/index.js')
    warnOnTestKeyInLiveMode()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NO REAL MONEY WILL MOVE'))
    warn.mockRestore()
  })

  it('stays silent on a live key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('PAYMENTS_PROVIDER_MODE', 'live')
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_live_abc123')

    const { warnOnTestKeyInLiveMode } = await import('../services/payments/index.js')
    warnOnTestKeyInLiveMode()

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('warns when live mode has no key at all', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('PAYMENTS_PROVIDER_MODE', 'live')
    vi.stubEnv('PAYSTACK_SECRET_KEY', '')

    const { warnOnTestKeyInLiveMode } = await import('../services/payments/index.js')
    warnOnTestKeyInLiveMode()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('every collection will fail'))
    warn.mockRestore()
  })

  it('says nothing in simulated mode, where a test key is simply correct', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('PAYMENTS_PROVIDER_MODE', 'simulated')
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_abc123')

    const { warnOnTestKeyInLiveMode } = await import('../services/payments/index.js')
    warnOnTestKeyInLiveMode()

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
