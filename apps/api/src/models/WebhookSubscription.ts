import mongoose, { Schema, type Document } from 'mongoose'

export interface IWebhookSubscription extends Document {
  userId: string
  url: string
  events: string[]
  secret: string
  isActive: boolean
  lastDeliveredAt?: string
  lastFailureAt?: string
  failureCount: number
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IWebhookSubscription>({
  userId: { type: String, required: true, index: true },
  url: { type: String, required: true },
  events: { type: [String], required: true },
  secret: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  lastDeliveredAt: { type: String },
  lastFailureAt: { type: String },
  failureCount: { type: Number, default: 0 },
}, { timestamps: true })

schema.index({ userId: 1, isActive: 1 })
schema.index({ events: 1 })

export const WebhookSubscription = mongoose.model<IWebhookSubscription>('WebhookSubscription', schema)
