import mongoose, { Schema, type Document } from 'mongoose'

export type DelegationScope = 'applications' | 'maintenance' | 'payments' | 'edit' | 'leads'

export interface IDelegation extends Document {
  propertyId: string
  ownerId: string
  delegateId: string
  scopes: DelegationScope[]
  status: 'active' | 'revoked'
  createdAt: Date
  updatedAt: Date
}

const delegationSchema = new Schema<IDelegation>(
  {
    propertyId: { type: String, required: true, index: true },
    ownerId: { type: String, required: true, index: true },
    delegateId: { type: String, required: true, index: true },
    scopes: { type: [String], enum: ['applications', 'maintenance', 'payments', 'edit', 'leads'], default: ['applications'] },
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
  },
  { timestamps: true },
)

delegationSchema.index({ propertyId: 1, delegateId: 1 }, { unique: true })

export const Delegation = mongoose.model<IDelegation>('Delegation', delegationSchema)
