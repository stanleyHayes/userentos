import mongoose, { Schema } from 'mongoose'

// A renewal changes the transaction ID, but ownership belongs to the original
// subscription chain. Sandbox and production chains never share identity.
const schema = new Schema({
  applicationId: { type: String, required: true, immutable: true },
  environment: { type: String, required: true, enum: ['production', 'test'], immutable: true },
  originalTransactionHash: { type: String, required: true, immutable: true },
  userId: { type: String, required: true, immutable: true, index: true },
  originalTransactionCiphertext: { type: String, required: true, select: false },
  transactionHash: { type: String, required: true },
  recoveryLeaseId: String,
  recoveryLeaseUntil: Date,
  recoveryNextAttemptAt: Date,
  recoveryAttempts: { type: Number, default: 0 },
  recoveryLastError: String,
  revision: { type: Number, required: true, default: 1 },
  productId: { type: String, required: true },
  subscriptionGroupId: { type: String, required: true },
  providerStatus: { type: Number, required: true, enum: [1, 2, 3, 4, 5] },
  purchasedAt: { type: Date, required: true },
  originalPurchasedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  signedAt: { type: Date, required: true },
  verifiedAt: { type: Date, required: true },
  revokedAt: Date,
  upgraded: { type: Boolean, required: true },
  autoRenewing: { type: Boolean, required: true },
  graceExpiresAt: Date,
  accessExpiresAt: Date,
  accessEligible: { type: Boolean, required: true },
  // Provider eligibility is not a mapped/activated application entitlement.
  preparedRevision: Number,
  preparedGrant: { type: new Schema({ mappingId: { type: String, required: true }, packageId: { type: String, required: true }, productId: { type: String, required: true }, expiresAt: { type: Date, required: true }, snapshot: { type: Schema.Types.Mixed, required: true } }, { _id: false }) },
  entitlementState: { type: String, enum: ['pending', 'prepared', 'active', 'revoked'], default: 'pending' },
}, { timestamps: true })
schema.index({ applicationId: 1, environment: 1, originalTransactionHash: 1 }, { unique: true })
schema.index({ applicationId: 1, environment: 1, recoveryNextAttemptAt: 1, recoveryLeaseUntil: 1 })
export const ApplePurchase = mongoose.model('ApplePurchase', schema)
