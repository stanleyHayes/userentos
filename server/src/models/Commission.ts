import mongoose, { Schema, type Document } from 'mongoose'

export type CommissionStatus = 'pending' | 'paid'

export interface ICommission extends Document {
  agentId: string
  propertyId?: string
  leadId?: string
  agreementId?: string
  description: string
  amount: number
  status: CommissionStatus
  paidAt?: Date
  createdAt: Date
  updatedAt: Date
}

const commissionSchema = new Schema<ICommission>(
  {
    agentId: { type: String, required: true, index: true },
    propertyId: String,
    leadId: String,
    agreementId: String,
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending', index: true },
    paidAt: Date,
  },
  { timestamps: true },
)

export const Commission = mongoose.model<ICommission>('Commission', commissionSchema)
