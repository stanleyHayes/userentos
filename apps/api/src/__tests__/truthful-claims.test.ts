import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/*
 * Guard against unverifiable public claims creeping back into the notices and
 * marketing surfaces (Apple 2.3.1, Play Misrepresentation, consumer
 * protection, Act 843 notice accuracy). Each pattern below was once shipped;
 * if a claim becomes true, back it with evidence-conditional code (e.g.
 * LEGAL_ENTITY.dpcRegistrationNumber) rather than deleting the guard.
 */

const REPO = join(process.cwd(), '..', '..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')

const SURFACES = [
  'apps/web/index.html',
  'apps/web/src/pages/legal/PrivacyPage.tsx',
  'apps/web/src/pages/legal/DataProtectionPage.tsx',
  'apps/web/src/pages/legal/DeleteAccountPage.tsx',
  'apps/web/src/pages/legal/TermsPage.tsx',
  'apps/web/src/pages/PublicRegistryPage.tsx',
  'apps/web/src/pages/PublicRegistryDetailPage.tsx',
  'apps/web/src/pages/RoleCapabilitiesPage.tsx',
  'apps/web/src/pages/LandingPage.tsx',
  'apps/web/src/components/onboarding/tourScripts.ts',
  'apps/web/src/lib/i18n.ts',
  'apps/mobile/app/about.tsx',
  'apps/mobile/app/help.tsx',
]

const BANNED: [RegExp, string][] = [
  [/government[- ]verified|verified by government/i, 'no government verification exists'],
  [/official (property |rental )?(property )?registry|national (digital|rental) (rental housing )?(platform|infrastructure)|national digital infrastructure/i, 'RentOS is not an official/national registry'],
  [/legally compliant|compliant with ghana rent control act|built-in compliance/i, 'compliance is not guaranteed'],
  [/property ownership confirmed|landlord identity verified/i, 'ownership is never checked; identity only when verificationStatus says so'],
  [/\b\d+K\+/, 'fabricated usage statistics'],
  [/X{3,}/, 'placeholder phone numbers'],
  [/AES-256|stored (and processed )?within Ghana|appointed a Data Protection Officer|within 72 hours/i, 'unverifiable privacy-notice claims'],
  [/BoG securitized|our legal partners|licensed partner banks|partner bank virtual accounts/i, 'no such regulator approval or partners'],
  [/legally binding when signed|tamper-proof/i, 'enforceability is not guaranteed'],
  [/RentOS Ghana Limited/, 'controller name must come from LEGAL_ENTITY'],
  [/every deletion is recorded|record of every deletion/i, 'only the deletions services/erasureLedger.ts records are re-applied after a restore'],
  [/every kind of personal data linked/i, 'the export leaves out messages others sent and documents others shared'],
  [/each kind of personal data has a set retention period/i, 'tenancy, financial, regulated and moderation records have no period yet'],
]

describe('public surfaces make no unverifiable claims', () => {
  for (const file of SURFACES) {
    it(file, () => {
      const src = read(file)
      for (const [pattern, why] of BANNED) {
        expect(src, `${file} matches ${pattern} (${why})`).not.toMatch(pattern)
      }
    })
  }

  it('the store disclosure notes claim no more deletion replay than the ledger does', () => {
    expect(read('docs/compliance/mobile-data-disclosures.md')).not.toMatch(/every deletion is recorded|record of every deletion/i)
  })

  it('the notices are version-stamped from the shared constants', () => {
    expect(read('apps/web/src/pages/legal/PrivacyPage.tsx')).toContain('versionLabel(PRIVACY_VERSION)')
    expect(read('apps/web/src/pages/legal/DataProtectionPage.tsx')).toContain('versionLabel(PRIVACY_VERSION)')
    expect(read('apps/web/src/pages/legal/TermsPage.tsx')).toContain('versionLabel(TERMS_VERSION)')
  })

  it('web session replay masks text and inputs and blocks media', () => {
    const src = read('apps/web/src/lib/sentry.ts')
    expect(src).toMatch(/maskAllText: true/)
    expect(src).toMatch(/maskAllInputs: true/)
    expect(src).toMatch(/blockAllMedia: true/)
    expect(src).toMatch(/sendDefaultPii: false/)
  })

  it('the mobile help screen does not dial a phone number', () => {
    expect(read('apps/mobile/app/help.tsx')).not.toMatch(/tel:/)
  })
})
