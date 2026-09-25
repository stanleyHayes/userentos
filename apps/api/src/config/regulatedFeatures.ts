/**
 * Features that are regulated activities in Ghana. Each needs a licence held by
 * the operator, or a licensed partner that performs the activity, before it can
 * be offered:
 *  - rent_collection: collecting rent into the platform's provider account and
 *    holding it until payout (Payment Systems and Services Act 2019, Act 987)
 *  - wallet: stored value, deposits, savings plans, withdrawals (Act 987; Act 930)
 *  - lending: platform loans (BoG digital credit directive; Act 1052)
 *  - financing: third-party rent advances and deposit loans (Act 1052)
 *  - investments: investment products (Securities Industry Act 2016, Act 929)
 *  - insurance: selling policies and handling claims (Insurance Act 2021, Act 1061)
 *  - payroll: employer salary deductions for repayments
 *  - credit_reporting: computing and sharing credit scores (Credit Reporting Act 2007, Act 726)
 *
 * Production enables none by default. Enabling one requires REGULATED_FEATURES to
 * name it and REGULATED_BASIS_<FEATURE> to record the licence or partner
 * agreement relied on, so switching a regulated activity on is a deliberate,
 * documented operator decision rather than a side effect of deploying code.
 */
export const REGULATED_FEATURES = [
  'rent_collection', 'wallet', 'lending', 'financing', 'investments', 'insurance', 'payroll', 'credit_reporting',
] as const
export type RegulatedFeature = (typeof REGULATED_FEATURES)[number]

export const basisEnvName = (feature: RegulatedFeature) => `REGULATED_BASIS_${feature.toUpperCase()}`

function isRegulatedFeature(value: string): value is RegulatedFeature {
  return (REGULATED_FEATURES as readonly string[]).includes(value)
}

export function resolveRegulatedFeatures(env: NodeJS.ProcessEnv = process.env): ReadonlySet<RegulatedFeature> {
  const production = env.NODE_ENV === 'production'
  const raw = env.REGULATED_FEATURES
  // Development and tests exercise every feature unless told otherwise.
  if (raw === undefined) return new Set(production ? [] : REGULATED_FEATURES)
  const requested = [...new Set(raw.split(',').map(value => value.trim()).filter(Boolean))]
  const unknown = requested.filter(value => !isRegulatedFeature(value))
  if (unknown.length) throw new Error(`Unknown REGULATED_FEATURES entries: ${unknown.join(', ')}`)
  const features = requested as RegulatedFeature[]
  if (production) {
    const undocumented = features.filter(feature => !env[basisEnvName(feature)]?.trim())
    if (undocumented.length) {
      throw new Error(`Regulated features enabled without a recorded licence or partner basis: set ${undocumented.map(basisEnvName).join(', ')}`)
    }
  }
  return new Set(features)
}

let enabled = resolveRegulatedFeatures()

export const isRegulatedFeatureEnabled = (feature: RegulatedFeature) => enabled.has(feature)

// Self-registered account types that exist only to use a regulated feature.
const ROLE_FEATURES: Partial<Record<string, RegulatedFeature>> = { financier: 'financing', employer: 'payroll' }

/** Whether someone may sign up as this account type right now. */
export function isRoleOffered(role: string): boolean {
  const feature = ROLE_FEATURES[role]
  return !feature || enabled.has(feature)
}

export function regulatedFeatureStatus(): Record<RegulatedFeature, boolean> {
  return Object.fromEntries(REGULATED_FEATURES.map(feature => [feature, enabled.has(feature)])) as Record<RegulatedFeature, boolean>
}

/** Tests only: re-read the configuration from a supplied environment. */
export function reloadRegulatedFeatures(env: NodeJS.ProcessEnv = process.env) {
  enabled = resolveRegulatedFeatures(env)
}
