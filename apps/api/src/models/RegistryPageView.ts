import mongoose, { Schema, type Document } from 'mongoose'
import { ttlSeconds } from '../config/retention.js'

/**
 * Anonymous pageview record for the public property registry. IPs are stored
 * only as a keyed, daily-rotating hash (utils/visitorHash.ts) so we can compute
 * "unique viewers" without retaining PII.
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

// Time-series queries, and expiry: views are kept 13 months (config/retention.ts).
registryPageViewSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttlSeconds('registryPageView') })
registryPageViewSchema.index({ path: 1, createdAt: -1 })

export const RegistryPageView = mongoose.model<IRegistryPageView>(
  'RegistryPageView',
  registryPageViewSchema,
)
