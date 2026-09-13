import mongoose, { Schema } from 'mongoose'

const itemSchema = new Schema({
  productId: { type: String, required: true },
  basePlanId: { type: String, required: true },
  offerId: String,
  expiresAt: String,
  autoRenewing: Boolean,
  latestOrderId: String,
  accessEligible: Boolean,
}, { _id: false })
const schema = new Schema({
  platform: { type: String, required: true, enum: ['google', 'apple'], immutable: true },
  applicationId: { type: String, required: true, immutable: true },
  tokenHash: { type: String, required: true, immutable: true },
  userId: { type: String, required: true, immutable: true, index: true },
  tokenCiphertext: { type: String, required: true, select: false },
  revision: { type: Number, required: true, default: 1 },
  providerState: { type: String, required: true },
  environment: { type: String, required: true, enum: ['test', 'production'] },
  acknowledged: { type: Boolean, required: true },
  voidedOrderIds: { type: [String], default: [] },
  recoveryLeaseId: String,
  recoveryLeaseUntil: Date,
  recoveryNextAttemptAt: Date,
  recoveryAttempts: { type: Number, default: 0 },
  recoveryLastError: String,
  startedAt: String,
  verifiedAt: { type: Date, required: true },
  linkedPurchaseTokenHash: String,
  supersedesTokenHash: { type: String, index: true },
  items: { type: [itemSchema], required: true },
  // Verification does not imply that the user has been granted access.
  preparedRevision: Number,
  preparedGrants: { type: [new Schema({
    productId: { type: String, required: true }, basePlanId: { type: String, required: true }, mappingId: { type: String, required: true },
    packageId: { type: String, required: true }, expiresAt: { type: String, required: true }, snapshot: { type: Schema.Types.Mixed, required: true },
  }, { _id: false })], default: [] },
  entitlementState: { type: String, enum: ['pending', 'prepared', 'active', 'revoked'], default: 'pending' },
}, { timestamps: true })
schema.index({ platform: 1, applicationId: 1, tokenHash: 1 }, { unique: true })
schema.index({ platform: 1, applicationId: 1, recoveryNextAttemptAt: 1, recoveryLeaseUntil: 1 })
export const StorePurchase = mongoose.model('StorePurchase', schema)
