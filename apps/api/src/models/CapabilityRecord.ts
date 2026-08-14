import mongoose, { Schema, type Document } from 'mongoose'

export type CapabilityKind =
  | 'provider_payout'
  | 'business_order'
  | 'business_campaign'
  | 'business_subscription'
  | 'housing_benefit'
  | 'developer_profile'
  | 'offplan_listing'

export interface ICapabilityRecord extends Document {
  kind: CapabilityKind
  ownerId: string
  participantId?: string
  status: string
  data: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

const capabilityRecordSchema = new Schema<ICapabilityRecord>({
  kind: { type: String, required: true, index: true },
  ownerId: { type: String, required: true, index: true },
  participantId: { type: String, index: true },
  status: { type: String, required: true, default: 'active', index: true },
  data: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true })

capabilityRecordSchema.index({ kind: 1, ownerId: 1, createdAt: -1 })

export const CapabilityRecord = mongoose.model<ICapabilityRecord>('CapabilityRecord', capabilityRecordSchema)
