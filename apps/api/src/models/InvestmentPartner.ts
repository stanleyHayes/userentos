import mongoose, { Schema, type Document } from 'mongoose'

/**
 * A regulated institution that actually holds investors' money. Created only by
 * an admin after checking the licence with the regulator — RentOS itself never
 * places, holds or pays out investments.
 */
export interface IInvestmentPartner extends Document {
  name: string
  regulator: 'SEC' | 'BoG'
  licenseNumber: string
  verifiedBy: string
  verifiedAt: Date
  active: boolean
}

const investmentPartnerSchema = new Schema<IInvestmentPartner>({
  name: { type: String, required: true, trim: true },
  regulator: { type: String, required: true, enum: ['SEC', 'BoG'] },
  licenseNumber: { type: String, required: true, trim: true },
  verifiedBy: { type: String, required: true },
  verifiedAt: { type: Date, required: true },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true })

export const InvestmentPartner = mongoose.model<IInvestmentPartner>('InvestmentPartner', investmentPartnerSchema)
