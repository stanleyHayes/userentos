// Mirrors apps/api/src/config/regulatedFeatures.ts; the API is the authority and
// publishes which of these are enabled at GET /api/platform/features.
export const regulatedFeatureKeys = [
  'rent_collection', 'wallet', 'lending', 'financing', 'investments', 'insurance', 'payroll', 'credit_reporting',
] as const
export type RegulatedFeatureKey = (typeof regulatedFeatureKeys)[number]
export type RegulatedFeatureStatus = Record<RegulatedFeatureKey, boolean>

/** A partial or malformed response is treated as unknown, never as permission. */
export function parseRegulatedFeatureStatus(data: unknown): RegulatedFeatureStatus | null {
  const regulated = (data as { regulated?: unknown } | null)?.regulated
  if (!regulated || typeof regulated !== 'object') return null
  const values = regulated as Record<string, unknown>
  if (!regulatedFeatureKeys.every(key => typeof values[key] === 'boolean')) return null
  return Object.fromEntries(regulatedFeatureKeys.map(key => [key, values[key]])) as RegulatedFeatureStatus
}

// Screen path prefixes (web and mobile share them) and the features, any one of
// which permits the screen. Longer prefixes are listed before shorter ones.
const pathFeatures: [prefix: string, anyOf: RegulatedFeatureKey[]][] = [
  ['/admin/payouts', ['rent_collection', 'wallet']],
  ['/admin/insurance', ['insurance']],
  ['/admin/financing', ['financing']],
  ['/admin/employers', ['payroll']],
  ['/financing-mandates', ['payroll']],
  ['/financing/mandates', ['payroll']],
  ['/financing', ['financing']],
  ['/financier', ['financing']],
  ['/employer', ['payroll']],
  ['/insurance', ['insurance']],
  ['/investments', ['investments']],
  ['/loans', ['lending']],
  ['/savings', ['wallet', 'lending', 'investments']],
  ['/credit-score', ['credit_reporting']],
  ['/payout-account', ['rent_collection', 'wallet']],
]

/** The features that permit a screen, or null when the screen is not regulated. */
export function regulatedFeaturesForPath(path: string): RegulatedFeatureKey[] | null {
  const match = pathFeatures.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))
  return match ? match[1] : null
}

// Self-registered account types that exist only to use a regulated feature
// (mirrors isRoleOffered in apps/api/src/config/regulatedFeatures.ts).
const roleFeatures: Partial<Record<string, RegulatedFeatureKey>> = { financier: 'financing', employer: 'payroll' }

/** Whether sign-up should offer this account type; unknown status hides regulated ones. */
export function isRoleOffered(role: string, status: RegulatedFeatureStatus | null): boolean {
  const feature = roleFeatures[role]
  return !feature || (status !== null && status[feature])
}

/** Unknown status (still loading or failed) is not permission. */
export function isPathAvailable(path: string, status: RegulatedFeatureStatus | null): boolean {
  const anyOf = regulatedFeaturesForPath(path)
  return !anyOf || (status !== null && anyOf.some(key => status[key]))
}
