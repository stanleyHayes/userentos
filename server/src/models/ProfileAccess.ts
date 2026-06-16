import mongoose, { Schema, type Document } from 'mongoose'

export interface IProfileAccess extends Document {
  requesterId: string
  tenantId: string
  propertyId?: string
  status: 'pending' | 'approved' | 'denied' | 'revoked'
  requestedAt: Date
  respondedAt?: Date
  message?: string
}

const profileAccessSchema = new Schema<IProfileAccess>({
  requesterId: { type: String, required: true },
  tenantId: { type: String, required: true },
  propertyId: String,
  status: { type: String, required: true, enum: ['pending', 'approved', 'denied', 'revoked'], default: 'pending' },
  requestedAt: { type: Date, default: Date.now },
  respondedAt: Date,
  message: String,
}, { timestamps: true })

profileAccessSchema.index({ requesterId: 1, tenantId: 1 })
profileAccessSchema.index({ tenantId: 1 })

export const ProfileAccess = mongoose.model<IProfileAccess>('ProfileAccess', profileAccessSchema)
