import { afterEach, describe, expect, it, vi } from 'vitest'
import { decryptPii, encryptPii, isEncryptedPii, piiLast4, piiSetter, PII_FIELDS } from '../utils/piiCrypto.js'
import { User } from '../models/User.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { sharedProfileView } from '../services/tenantProfileViews.js'

const card = 'GHA-123456789-0'

describe('national ID field encryption', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it('round-trips with a fresh IV and never stores the digits', () => {
    const a = encryptPii(card, PII_FIELDS.userGhanaCard)
    const b = encryptPii(card, PII_FIELDS.userGhanaCard)
    expect(a).not.toBe(b)
    expect(a).not.toContain('123456789')
    expect(isEncryptedPii(a)).toBe(true)
    expect(decryptPii(a, PII_FIELDS.userGhanaCard)).toBe(card)
    expect(encryptPii(a, PII_FIELDS.userGhanaCard)).toBe(a)
  })

  it('binds ciphertext to its field and detects tampering', () => {
    const value = encryptPii(card, PII_FIELDS.userGhanaCard)
    expect(decryptPii(value, PII_FIELDS.tenantIdNumber)).toBeUndefined()
    const tampered = value.slice(0, -2) + (value.endsWith('00') ? '11' : '00')
    expect(decryptPii(tampered, PII_FIELDS.userGhanaCard)).toBeUndefined()
  })

  it('reads legacy plaintext rows unchanged and exposes only the last four', () => {
    expect(decryptPii(card, PII_FIELDS.userGhanaCard)).toBe(card)
    expect(piiLast4(card, PII_FIELDS.tenantIdNumber)).toBe('7890')
    expect(piiLast4(encryptPii(card, PII_FIELDS.tenantIdNumber), PII_FIELDS.tenantIdNumber)).toBe('7890')
    expect(piiSetter(PII_FIELDS.userGhanaCard)('')).toBeUndefined()
  })

  it('encrypts on every model write path and decrypts only for the owner view', () => {
    const user = new User({ email: 'x@rentos.test', phone: '0', firstName: 'A', lastName: 'B', passwordHash: 'x', roles: ['tenant'], activeRole: 'tenant', ghanaCardId: card })
    expect(isEncryptedPii(user.ghanaCardId)).toBe(true)
    expect(JSON.stringify(user.toJSON())).not.toContain('123456789')
    expect((user as unknown as { toSafe(): { ghanaCardId: string } }).toSafe().ghanaCardId).toBe(card)
    const profile = new TenantProfile({ userId: 'owner', idNumber: card })
    expect(isEncryptedPii(profile.idNumber)).toBe(true)
  })

  it('refuses to run in production without a configured key', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PII_ENCRYPTION_KEY', '')
    const fresh = await import('../utils/piiCrypto.js')
    expect(() => fresh.encryptPii(card, PII_FIELDS.userGhanaCard)).toThrow(/PII_ENCRYPTION_KEY is required/)
    vi.resetModules()
    vi.stubEnv('PII_ENCRYPTION_KEY', 'too-short')
    const misconfigured = await import('../utils/piiCrypto.js')
    expect(() => misconfigured.encryptPii(card, PII_FIELDS.userGhanaCard)).toThrow(/64 hex/)
  })

  it('uses the configured key so another key cannot decrypt', async () => {
    vi.stubEnv('PII_ENCRYPTION_KEY', 'a'.repeat(64))
    const keyed = await import('../utils/piiCrypto.js')
    const value = keyed.encryptPii(card, PII_FIELDS.userGhanaCard)
    vi.resetModules()
    vi.stubEnv('PII_ENCRYPTION_KEY', 'b'.repeat(64))
    const otherKey = await import('../utils/piiCrypto.js')
    expect(otherKey.decryptPii(value, PII_FIELDS.userGhanaCard)).toBeUndefined()
  })
})

describe('landlord view of a tenant profile', () => {
  it('shares verification status and last four only — no ID number, documents, selfie or family data', () => {
    const view = sharedProfileView({
      _id: 'p1', userId: 'tenant', occupation: 'Nurse', idType: 'ghana_card', idVerified: true,
      idNumber: encryptPii(card, PII_FIELDS.tenantIdNumber), idDocumentUrl: '/uploads/id.jpg', selfieUrl: '/uploads/selfie.jpg',
      proofOfIncomeUrl: '/uploads/payslip.pdf', proofOfAddressUrl: '/uploads/bill.pdf',
      maritalStatus: 'married', hasSpouse: true, spouseName: 'Kofi', spouseOccupation: 'Driver', hasChildren: true,
      numberOfChildren: 2, childrenAges: '3, 5', numberOfDependents: 3, occupantDetails: 'Mother-in-law', numberOfOccupants: 4,
      religion: 'x', ethnicGroup: 'y', dietaryRestrictions: 'halal', searchPreferences: { maxBudget: 1 },
    })
    expect(view).toEqual({ id: 'p1', userId: 'tenant', occupation: 'Nurse', idType: 'ghana_card', idVerified: true, numberOfOccupants: 4, idNumberLast4: '7890' })
  })
})
