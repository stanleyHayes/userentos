import mongoose, { Schema } from 'mongoose'
const schema = new Schema({
  applicationId: { type: String, required: true, immutable: true },
  environment: { type: String, enum: ['production', 'test'], required: true, immutable: true },
  transactionHash: { type: String, required: true, immutable: true },
  revoked: { type: Boolean, required: true },
  signedAt: { type: Date, required: true },
  observedAt: { type: Date, required: true },
})
schema.index({ applicationId: 1, environment: 1, transactionHash: 1 }, { unique: true })
export const AppleTransactionRevocation = mongoose.model('AppleTransactionRevocation', schema)
