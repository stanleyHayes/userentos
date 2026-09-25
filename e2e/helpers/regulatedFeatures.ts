// Fixture responses for GET /api/platform/features. Mocked mobile flows must say
// which regulated services are offered, as the real API does.
const keys = ['rent_collection', 'wallet', 'lending', 'financing', 'investments', 'insurance', 'payroll', 'credit_reporting'] as const
export const allRegulatedFeatures = { regulated: Object.fromEntries(keys.map(key => [key, true])) }
export const noRegulatedFeatures = { regulated: Object.fromEntries(keys.map(key => [key, false])) }
