import mongoose, { Schema, type Document } from 'mongoose'

export interface IEmployer extends Document {
  ownerId: string
  legalName: string
  tradingName?: string
  tin: string
  ssnitEmployerNumber?: string
  industry?: string
  address: {
    street: string
    city: string
    region: string
    digitalAddress?: string
  }
  contactEmail: string
  contactPhone: string
  payrollCycle: 'weekly' | 'biweekly' | 'monthly'
  paydayDayOfMonth?: number
  verificationStatus: 'pending' | 'verified' | 'rejected'
  verifiedBy?: string
  verifiedAt?: string
  totalEmployees: number
}

const employerSchema = new Schema<IEmployer>({
  ownerId: { type: String, required: true, index: true },
  legalName: { type: String, required: true },
  tradingName: String,
  tin: { type: String, required: true, unique: true },
  ssnitEmployerNumber: String,
  industry: String,
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    region: { type: String, required: true },
    digitalAddress: String,
  },
  contactEmail: { type: String, required: true, lowercase: true },
  contactPhone: { type: String, required: true },
  payrollCycle: { type: String, required: true, enum: ['weekly', 'biweekly', 'monthly'], default: 'monthly' },
  paydayDayOfMonth: { type: Number, min: 1, max: 31 },
  verificationStatus: { type: String, required: true, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  verifiedBy: String,
  verifiedAt: String,
  totalEmployees: { type: Number, default: 0 },
}, { timestamps: true })

export const Employer = mongoose.model<IEmployer>('Employer', employerSchema)
