import { describe, expect, it } from 'vitest'
import { profilePatchSchema } from '../routes/tenantProfile.js'
import { calcScore, TenantProfile } from '../models/TenantProfile.js'
import { TENANT_PROFILE_EDITABLE_FIELDS, tenantProfilePatch } from '../types/shared.js'

describe('tenant profile contract and data minimisation', () => {
  it('does not reward disclosure of religion or ethnicity', () => {
    const profile = { dateOfBirth: '1990-01-01', gender: 'prefer_not_to_say', maritalStatus: 'single', nationality: 'Ghanaian' }
    expect(calcScore(profile)).toBe(calcScore({ ...profile, religion: 'private', ethnicGroup: 'private' }))
  })
  it('can reach full completion without religion or ethnicity', () => {
    expect(calcScore({ dateOfBirth: '1990-01-01', gender: 'prefer_not_to_say', maritalStatus: 'single', nationality: 'Ghanaian', highestEducation: 'none', employmentStatus: 'employed', occupation: 'Teacher', monthlyIncome: 1000, employmentDuration: '1_3yrs', hasSpouse: false, hasChildren: false, numberOfOccupants: 1, numberOfDependents: 0, smoker: false, noiseLevel: 'quiet', workSchedule: 'day', pets: false, personalReferences: [{ name: 'A' }, { name: 'B' }], professionalReferences: [{ name: 'C' }], previousRentals: [{ city: 'Accra' }], emergencyContact: { name: 'D', phone: '0240000000' }, idType: 'passport', idNumber: 'test', idVerified: true, incomeVerified: true })).toBe(100)
  })
  it('refuses new religion/ethnicity collection while allowing legacy values to be cleared', () => {
    expect(profilePatchSchema.safeParse({ religion: 'private' }).success).toBe(false)
    expect(profilePatchSchema.safeParse({ ethnicGroup: 'private' }).success).toBe(false)
    expect(profilePatchSchema.safeParse({ religion: '', ethnicGroup: '' }).success).toBe(true)
  })
  it('both editors can submit a fetched profile without server metadata or verification flags', () => {
    const patch = tenantProfilePatch({ _id: 'db-id', id: 'api-id', userId: 'owner', completionScore: 100, profileComplete: true, idVerified: true, createdAt: 'date', religion: 'legacy', ethnicGroup: 'legacy', bio: 'Hello', monthlyIncome: 1200, primaryCurrency: 'USD', incomeSources: [{ source: 'Freelance', amount: 30, currency: 'GHS' }], smoker: false, smokingStatus: 'non_smoker', pets: true, petStatus: 'has_pets' })
    expect(patch).toEqual({ bio: 'Hello', monthlyIncome: 1200, primaryCurrency: 'USD', incomeSources: [{ source: 'Freelance', amount: 30, currency: 'GHS' }], smoker: false, pets: true })
    expect(profilePatchSchema.safeParse(patch).success).toBe(true)
    expect(TENANT_PROFILE_EDITABLE_FIELDS.every(key => key in profilePatchSchema.shape)).toBe(true)
  })
  it('stores declared income currencies and sources without silently discarding them', () => {
    const doc = new TenantProfile({ userId: 'owner', primaryCurrency: 'USD', incomeSources: [{ source: 'Freelance', amount: 25, currency: 'EUR' }] })
    expect(doc.primaryCurrency).toBe('USD')
    expect(doc.incomeSources?.[0].currency).toBe('EUR')
    expect(profilePatchSchema.safeParse({ incomeSources: [{ source: 'x', amount: -10, currency: 'USD' }] }).success).toBe(false)
  })
})
