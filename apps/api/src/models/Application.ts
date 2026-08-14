import mongoose, { Schema, type Document } from 'mongoose'

export interface IApplication extends Document {
  tenantId: string
  propertyId: string
  landlordId: string
  status: string
  message: string
  sharedSections: string[]
  moveInDate: Date
  duration: number
  offeredRent?: number
  landlordNotes?: string
  respondedAt?: Date
}

const applicationSchema = new Schema<IApplication>({
  tenantId: { type: String, required: true },
  propertyId: { type: String, required: true },
  landlordId: { type: String, required: true, index: true },
  status: { type: String, required: true, enum: ['pending', 'approved', 'rejected', 'withdrawn'], default: 'pending', index: true },
  message: { type: String, default: '' },
  sharedSections: { type: [String], default: ['personal', 'professional'] },
  moveInDate: { type: Date, required: true },
  duration: { type: Number, required: true },
  offeredRent: Number,
  landlordNotes: String,
  respondedAt: Date,
}, { timestamps: true })

// Compound index for fast lookups
applicationSchema.index({ tenantId: 1, propertyId: 1 })

// One pending application per tenant per property at the DATABASE level —
// the route-level check alone raced under concurrent submissions.
applicationSchema.index(
  { tenantId: 1, propertyId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_application' },
)

export const Application = mongoose.model<IApplication>('Application', applicationSchema)
