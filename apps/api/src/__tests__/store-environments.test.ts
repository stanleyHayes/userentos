import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appleEnvironmentsFor, appleRecoveryScope, googleEnvironmentsFor, googleRecoveryScope, sandboxAllowedUserIds } from '../services/storeBilling/storeEnvironments.js'

const reviewer = '64f0000000000000000000aa'
const landlord = '64f000000000000000000001'
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('APPLE_STORE_BUNDLE_ID', 'gh.rentos.mobile')
  vi.stubEnv('APPLE_STORE_ENVIRONMENT', 'Production')
  vi.stubEnv('GOOGLE_PLAY_ALLOW_TEST_PURCHASES', 'false')
  vi.stubEnv('STORE_SANDBOX_ALLOWED_USER_IDS', reviewer)
})
afterEach(() => vi.unstubAllEnvs())

describe('store test-purchase allowlist', () => {
  it('reads trimmed, case-folded user IDs and ignores anything else', () => {
    vi.stubEnv('STORE_SANDBOX_ALLOWED_USER_IDS', ` ${reviewer.toUpperCase()} , reviewer@rentos.test,,*, ${reviewer}`)
    expect(sandboxAllowedUserIds()).toEqual([reviewer])
    vi.stubEnv('STORE_SANDBOX_ALLOWED_USER_IDS', '')
    expect(sandboxAllowedUserIds()).toEqual([])
  })
  it('grants Apple sandbox rows in production only to allowlisted accounts', () => {
    expect(appleEnvironmentsFor(reviewer)).toEqual(['production', 'test'])
    expect(appleEnvironmentsFor(landlord)).toEqual(['production'])
  })
  it('keeps the sandbox-only Apple mode to development, where it covers everyone', () => {
    vi.stubEnv('APPLE_STORE_ENVIRONMENT', 'Sandbox')
    expect(appleEnvironmentsFor(reviewer)).toEqual([])
    expect(appleRecoveryScope()).toBeNull()
    vi.stubEnv('NODE_ENV', 'development')
    expect(appleEnvironmentsFor(landlord)).toEqual(['test'])
    expect(appleRecoveryScope()).toEqual({ $or: [{ environment: 'test' }] })
  })
  it('grants nothing without an Apple configuration', () => {
    vi.stubEnv('APPLE_STORE_BUNDLE_ID', '')
    expect(appleEnvironmentsFor(reviewer)).toEqual([])
  })
  it('grants Google license-test rows in production only to allowlisted accounts, whatever the developer switch says', () => {
    vi.stubEnv('GOOGLE_PLAY_ALLOW_TEST_PURCHASES', 'true')
    expect(googleEnvironmentsFor(reviewer)).toEqual(['production', 'test'])
    expect(googleEnvironmentsFor(landlord)).toEqual(['production'])
    vi.stubEnv('NODE_ENV', 'development')
    expect(googleEnvironmentsFor(landlord)).toEqual(['production', 'test'])
  })
  it('polls live rows plus only the allowlisted test rows', () => {
    const scope = { $or: [{ environment: 'production' }, { environment: 'test', userId: { $in: [reviewer] } }] }
    expect(appleRecoveryScope()).toEqual(scope)
    expect(googleRecoveryScope()).toEqual(scope)
  })
})
