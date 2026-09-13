import mongoose, { Schema } from 'mongoose'

// Short-lived delivery deduplication only. Purchase history lives in StorePurchase.
const schema = new Schema({
  subscription: { type: String, required: true },
  messageId: { type: String, required: true },
  processedAt: { type: Date, required: true, default: Date.now },
})
schema.index({ subscription: 1, messageId: 1 }, { unique: true })
schema.index({ processedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 })
export const StoreNotification = mongoose.model('StoreNotification', schema)
