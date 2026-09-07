import mongoose, { Schema, type Document } from 'mongoose'

/**
 * A single feature grant on a plan version, stored as a feature key plus a JSON
 * value (spec §7.1, §12).
 *
 * Deliberately key/value rather than columns: the spec forbids branching on
 * plan names anywhere in the product, and requires that pricing and capability
 * changes ship without a redeploy. A new capability becomes a new row, not a
 * migration plus a code change.
 *
 * Values are typed by the feature registry, not by this schema, so a boolean
 * gate, a numeric quota and a tier string all live here.
 */
export interface IPlanEntitlement extends Document {
  planId: string
  /** Version of the plan this grant belongs to — old subscribers keep theirs. */
  planVersion: number
  featureKey: string
  value: unknown
  createdAt: Date
  updatedAt: Date
}

const planEntitlementSchema = new Schema<IPlanEntitlement>({
  planId: { type: String, required: true, index: true },
  planVersion: { type: Number, required: true, default: 1 },
  featureKey: { type: String, required: true },
  value: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true })

planEntitlementSchema.index({ planId: 1, planVersion: 1, featureKey: 1 }, { unique: true })

export const PlanEntitlement = mongoose.model<IPlanEntitlement>('PlanEntitlement', planEntitlementSchema)
