import { describe, it, expect, afterEach, vi } from 'vitest'
import { availableMethods, isMethodAvailable } from '../services/payments/index.js'

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

  it('leaves every mobile-money rail available — they ride Paystack', () => {
    live()
    vi.stubEnv('BANK_DEPOSIT_ACCOUNT', '')
    const methods = availableMethods()
    expect(methods).toEqual(
      expect.arrayContaining(['mtn_momo', 'telecel_cash', 'airteltigo_money']),
    )
  })

  it('gates nothing in simulated mode, where no real money moves', () => {
    vi.stubEnv('PAYMENTS_PROVIDER_MODE', 'simulated')
    vi.stubEnv('BANK_DEPOSIT_ACCOUNT', '')
    expect(isMethodAvailable('bank_transfer')).toBe(true)
  })
})
