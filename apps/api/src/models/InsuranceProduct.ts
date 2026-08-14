import mongoose, { Schema, type Document } from 'mongoose'

export type InsuranceCategory =
  | 'renters'
  | 'landlord'
  | 'rent_guarantee'
  | 'property_damage'
  | 'tenant_default'

export interface IInsuranceProduct extends Document {
  providerId: string
  providerName: string
  productName: string
  category: InsuranceCategory
  description: string
  coverageDetails: string
  monthlyPremium: number
  coverageLimit: number
  excessAmount: number
  terms: string
  active: boolean
  commissionPct: number
}

const insuranceProductSchema = new Schema<IInsuranceProduct>(
  {
    providerId: { type: String, required: true, index: true },
    providerName: { type: String, required: true },
    productName: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: ['renters', 'landlord', 'rent_guarantee', 'property_damage', 'tenant_default'],
      index: true,
    },
    description: { type: String, required: true },
    coverageDetails: { type: String, required: true },
    monthlyPremium: { type: Number, required: true, min: 0 },
    coverageLimit: { type: Number, required: true, min: 0 },
    excessAmount: { type: Number, default: 0 },
    terms: { type: String, default: '' },
    active: { type: Boolean, default: true, index: true },
    commissionPct: { type: Number, default: 5, min: 0, max: 15 },
  },
  { timestamps: true },
)

export const InsuranceProduct = mongoose.model<IInsuranceProduct>(
  'InsuranceProduct',
  insuranceProductSchema,
)
