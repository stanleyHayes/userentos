import mongoose, { Schema, type Document } from 'mongoose'

/**
 * Raw provider webhook payloads, kept for dispute investigation and
 * dead-letter retry (spec §8.4).
 *
 * `eventId` is unique per provider so a replayed delivery is visible as such.
 * Payloads expire automatically: they are operational evidence, not a
 * permanent record, and they can contain buyer contact details.
 */
export interface IWebhookEvent extends Document {
  provider: string
  eventId: string
  eventType: string
  reference?: string
  payload: string
  processedAt?: Date
  processingError?: string
  attempts: number
  createdAt: Date
}

const webhookEventSchema = new Schema<IWebhookEvent>({
  provider: { type: String, required: true, index: true },
  eventId: { type: String, required: true },
  eventType: { type: String, required: true },
  reference: { type: String, index: true },
  payload: { type: String, required: true },
  processedAt: Date,
  processingError: String,
  attempts: { type: Number, default: 0 },
}, { timestamps: { createdAt: true, updatedAt: false } })

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true })
// 90-day retention — long enough to investigate a dispute, short enough to
// avoid keeping buyer data indefinitely.
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 })

export const WebhookEvent = mongoose.model<IWebhookEvent>('WebhookEvent', webhookEventSchema)
