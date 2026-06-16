import { InsuranceProduct } from './models/InsuranceProduct.js'
import { logger } from './utils/logger.js'

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
}

const SEED_PRODUCTS: SeedProduct[] = [
  {
    providerId: 'rentos-partner-sic',
    providerName: 'SIC Insurance (Partner)',
    productName: 'Renters Basic',
    category: 'renters',
    description: 'Affordable cover for tenants — protects personal belongings against theft, fire, and water damage.',
    coverageDetails: 'Personal belongings up to GHS 10,000. Theft, fire, water damage. 24/7 claims line.',
    monthlyPremium: 25,
    coverageLimit: 10000,
    excessAmount: 200,
    terms: 'Standard renters terms. 30-day waiting period for theft claims. Excludes acts of war.',
    active: true,
    commissionPct: 8,
  },
  {
    providerId: 'rentos-partner-sic',
    providerName: 'SIC Insurance (Partner)',
    productName: 'Renters Plus',
    category: 'renters',
    description: 'Comprehensive renters protection with liability coverage and accidental damage included.',
    coverageDetails: 'Belongings up to GHS 30,000, personal liability GHS 50,000, accidental damage to landlord property.',
    monthlyPremium: 60,
    coverageLimit: 30000,
    excessAmount: 300,
    terms: 'Full renters cover. Personal liability included. 14-day waiting period.',
    active: true,
    commissionPct: 10,
  },
  {
    providerId: 'rentos-partner-enterprise',
    providerName: 'Enterprise Insurance (Partner)',
    productName: 'Landlord Property Damage',
    category: 'property_damage',
    description: 'Covers structural damage, fixtures, and appliances. Designed for Ghanaian landlords.',
    coverageDetails: 'Structural damage up to GHS 200,000. Fixtures and fittings. Loss of rent during repairs.',
    monthlyPremium: 120,
    coverageLimit: 200000,
    excessAmount: 1000,
    terms: 'Annual renewable. Loss of rent for up to 6 months during covered repair periods.',
    active: true,
    commissionPct: 12,
  },
  {
    providerId: 'rentos-partner-glico',
    providerName: 'GLICO General (Partner)',
    productName: 'Rent Guarantee for Landlords',
    category: 'rent_guarantee',
    description: 'Guarantees rent payment if your tenant defaults. Up to 6 months of rent covered.',
    coverageDetails: 'Up to 6 months rent paid out on tenant default. Legal eviction support included.',
    monthlyPremium: 80,
    coverageLimit: 30000,
    excessAmount: 500,
    terms: 'Tenant must pass RentOS credit check. 60-day initial waiting period. Eviction must be lawful.',
    active: true,
    commissionPct: 12,
  },
  {
    providerId: 'rentos-partner-glico',
    providerName: 'GLICO General (Partner)',
    productName: 'Tenant Default Protection',
    category: 'tenant_default',
    description: 'Covers landlords against tenant non-payment, vandalism, and damages exceeding deposit.',
    coverageDetails: 'Up to GHS 25,000 in tenant-caused damages plus 3 months unpaid rent.',
    monthlyPremium: 95,
    coverageLimit: 25000,
    excessAmount: 750,
    terms: 'Requires tenant agreement on RentOS. Police report required for vandalism claims.',
    active: true,
    commissionPct: 11,
  },
  {
    providerId: 'rentos-partner-enterprise',
    providerName: 'Enterprise Insurance (Partner)',
    productName: 'Landlord Premium Bundle',
    category: 'landlord',
    description: 'Combined property damage + rent guarantee + liability cover for serious landlords.',
    coverageDetails: 'GHS 500,000 structural cover, GHS 100,000 liability, 6 months rent guarantee.',
    monthlyPremium: 220,
    coverageLimit: 500000,
    excessAmount: 1500,
    terms: 'Requires verified Ghana Card. Annual reviews. Premium adjustable based on claims.',
    active: true,
    commissionPct: 13,
  },
]

export async function bootstrapInsurance() {
  try {
    const existing = await InsuranceProduct.countDocuments()
    if (existing > 0) {
      logger.info(`Insurance products already seeded (${existing}), skipping bootstrap.`)
      return
    }

    await InsuranceProduct.insertMany(SEED_PRODUCTS)
    logger.info(`Seeded ${SEED_PRODUCTS.length} insurance products.`)
  } catch (err) {
    logger.error(`Failed to bootstrap insurance products: ${err}`)
  }
}
