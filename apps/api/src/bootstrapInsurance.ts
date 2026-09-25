import { InsuranceProduct } from './models/InsuranceProduct.js'
import { logger } from './utils/logger.js'

/**
 * Demo insurance products exist only so non-production environments have
 * something to click through. They use obviously fictional insurers (never a
 * real company's name) and are flagged isDemo. Production gets none unless an
 * operator explicitly opts in, e.g. for a staging box running NODE_ENV=production.
 */
export function demoInsuranceEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.INSURANCE_DEMO_SEED === 'true'
}

interface SeedProduct {
  providerId: string
  providerName: string
  productName: string
  category: 'renters' | 'landlord' | 'rent_guarantee' | 'property_damage' | 'tenant_default'
  description: string
  coverageDetails: string
  monthlyPremium: number
  coverageLimit: number
  excessAmount: number
  terms: string
  active: boolean
  commissionPct: number
  isDemo: true
}

const DEMO_NOTE = 'DEMO PRODUCT — fictional insurer for testing only. Not a real insurance offer.'

const SEED_PRODUCTS: SeedProduct[] = [
  {
    providerId: 'demo-insurer-a',
    providerName: 'Demo Insurer A (fictional)',
    productName: 'Demo Renters Basic',
    category: 'renters',
    description: `${DEMO_NOTE} Sample cover for tenants' belongings against theft, fire and water damage.`,
    coverageDetails: 'Belongings up to GHS 10,000. Theft, fire, water damage.',
    monthlyPremium: 25,
    coverageLimit: 10000,
    excessAmount: 200,
    terms: DEMO_NOTE,
    active: true,
    commissionPct: 8,
    isDemo: true,
  },
  {
    providerId: 'demo-insurer-b',
    providerName: 'Demo Insurer B (fictional)',
    productName: 'Demo Landlord Property Damage',
    category: 'property_damage',
    description: `${DEMO_NOTE} Sample cover for structural damage, fixtures and appliances.`,
    coverageDetails: 'Structural damage up to GHS 200,000. Fixtures and fittings.',
    monthlyPremium: 120,
    coverageLimit: 200000,
    excessAmount: 1000,
    terms: DEMO_NOTE,
    active: true,
    commissionPct: 12,
    isDemo: true,
  },
  {
    providerId: 'demo-insurer-b',
    providerName: 'Demo Insurer B (fictional)',
    productName: 'Demo Rent Guarantee',
    category: 'rent_guarantee',
    description: `${DEMO_NOTE} Sample cover paying rent if a tenant defaults.`,
    coverageDetails: 'Up to 6 months rent on tenant default.',
    monthlyPremium: 80,
    coverageLimit: 30000,
    excessAmount: 500,
    terms: DEMO_NOTE,
    active: true,
    commissionPct: 12,
    isDemo: true,
  },
]

export async function bootstrapInsurance() {
  if (!demoInsuranceEnabled()) {
    logger.info('Insurance demo products skipped in production (set INSURANCE_DEMO_SEED=true to seed them).')
    return
  }
  try {
    const existing = await InsuranceProduct.countDocuments()
    if (existing > 0) {
      logger.info(`Insurance products already present (${existing}), skipping demo seed.`)
      return
    }

    await InsuranceProduct.insertMany(SEED_PRODUCTS)
    logger.info(`Seeded ${SEED_PRODUCTS.length} demo insurance products.`)
  } catch (err) {
    logger.error(`Failed to bootstrap insurance products: ${err}`)
  }
}
