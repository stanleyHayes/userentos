import mongoose, { Schema, type Document } from 'mongoose'

/**
 * Anonymous pageview record for the public property registry. IPs are stored
 * as a SHA-256 hash so we can compute "unique viewers" without retaining PII.
 */
export interface IRegistryPageView extends Document {
  path: string
  propertyId?: string
  referrer?: string
  userAgent?: string
  ipHash: string
  createdAt: Date
  updatedAt: Date
}

const registryPageViewSchema = new Schema<IRegistryPageView>(
  {
    path: { type: String, required: true, index: true },
    propertyId: { type: String, index: true },
    referrer: { type: String },
    userAgent: { type: String },
    ipHash: { type: String, required: true, index: true },
  },
  { timestamps: true },
)

// Compound index for time-series queries
registryPageViewSchema.index({ createdAt: -1 })
registryPageViewSchema.index({ path: 1, createdAt: -1 })

export const RegistryPageView = mongoose.model<IRegistryPageView>(
  'RegistryPageView',
  registryPageViewSchema,
)
