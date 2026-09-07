import { describe, it, expect, afterEach } from 'vitest'
import { envOr, envOptional, envNumber } from '../utils/env.js'

/**
 * An empty environment variable must behave as ABSENT.
 *
 * `X=` in a .env file, or a blank field in a hosting dashboard, produces an
 * empty string. `process.env.X ?? 'default'` keeps that empty string, which
 * silently turned a Paystack base URL into '' and every API call into a
 * request against a relative path.
 */
describe('environment defaults treat empty as absent', () => {
  const saved = { ...process.env }
  afterEach(() => { process.env = { ...saved } })

  it('falls back when the variable is unset', () => {
    delete process.env.TEST_ENV_VALUE
    expect(envOr('TEST_ENV_VALUE', 'https://api.paystack.co')).toBe('https://api.paystack.co')
  })

  it('falls back when the variable is declared but empty', () => {
    process.env.TEST_ENV_VALUE = ''
    expect(envOr('TEST_ENV_VALUE', 'https://api.paystack.co')).toBe('https://api.paystack.co')
  })

  it('falls back on whitespace, which a pasted dashboard value can carry', () => {
    process.env.TEST_ENV_VALUE = '   '
    expect(envOr('TEST_ENV_VALUE', 'fallback')).toBe('fallback')
  })

  it('uses a real value and trims it', () => {
    process.env.TEST_ENV_VALUE = ' https://custom.example  '
    expect(envOr('TEST_ENV_VALUE', 'fallback')).toBe('https://custom.example')
  })

  it('returns undefined rather than an empty string for optional values', () => {
    process.env.TEST_ENV_VALUE = ''
    expect(envOptional('TEST_ENV_VALUE')).toBeUndefined()
  })

  it('does not turn an empty numeric variable into zero', () => {
    process.env.TEST_ENV_NUMBER = ''
    // Number('') is 0 — an attribution window of zero days would silently
    // reject every referral.
    expect(envNumber('TEST_ENV_NUMBER', 30)).toBe(30)
  })

  it('ignores a non-numeric value', () => {
    process.env.TEST_ENV_NUMBER = 'soon'
    expect(envNumber('TEST_ENV_NUMBER', 30)).toBe(30)
  })

  it('uses a real number', () => {
    process.env.TEST_ENV_NUMBER = '14'
    expect(envNumber('TEST_ENV_NUMBER', 30)).toBe(14)
  })
})

describe('env reads with a meaningful default do not use ?? (regression guard)', () => {
  const files = [
    'services/marketplace/paystack.ts',
    'services/payouts/paystack.ts',
    'services/payments/mtnMomo.ts',
    'services/payments/telecelCash.ts',
    'services/payments/airteltigoMoney.ts',
    'services/payouts/index.ts',
    'services/marketplace/affiliate.ts',
  ]

  it('uses envOr/envNumber for base URLs, provider names and windows', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), 'src', file), 'utf8')
      const offenders = [...source.matchAll(/process\.env\.([A-Z0-9_]+)\s*\?\?\s*'[^']+'/g)]
        .map((m) => m[1])
      expect(offenders, `${file} must not default a non-empty value with ??`).toEqual([])
    }
  })
})
