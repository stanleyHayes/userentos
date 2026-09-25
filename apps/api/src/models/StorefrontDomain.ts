import mongoose, { Schema, type Document } from 'mongoose'

/**
 * A custom domain attached to a storefront (spec §4.3).
 *
 * Ownership is proven with a TXT record before the domain can ever become
 * canonical — the acceptance matrix requires that an unverified domain cannot
 * be promoted. TLS state is tracked separately because provisioning happens in
 * the hosting layer, asynchronously.
 */
export interface IStorefrontDomain extends Document {
  storefrontId: string
  domain: string
  /** Value the seller publishes as a TXT record to prove ownership. */
  verificationToken: string
  status: 'pending' | 'verified' | 'active' | 'failed' | 'removed'
  tlsStatus: 'none' | 'provisioning' | 'active' | 'failed'
  verifiedAt?: Date
  /**
   * When the current storefront claimed the domain. Unlike updatedAt it does
   * not move when verification is retried, so an unverified claim cannot be
   * kept alive by clicking Verify. Absent on older rows; createdAt stands in.
   */
  claimedAt?: Date
  lastCheckedAt?: Date
  failureReason?: string
  /** Which hosting provider was asked to issue the certificate. */
  tlsProvider?: string
  /** When issuance was requested, so a stuck certificate can time out. */
  tlsRequestedAt?: Date
  /** DNS the host still wants, surfaced to the seller verbatim. */
  tlsChallenges?: Array<{ type: string; domain: string; value: string; reason?: string }>
  createdAt: Date
  updatedAt: Date
}

const storefrontDomainSchema = new Schema<IStorefrontDomain>({
  storefrontId: { type: String, required: true, index: true },
  domain: { type: String, required: true, unique: true, lowercase: true },
  verificationToken: { type: String, required: true },
  status: { type: String, enum: ['pending', 'verified', 'active', 'failed', 'removed'], default: 'pending', index: true },
  tlsStatus: { type: String, enum: ['none', 'provisioning', 'active', 'failed'], default: 'none' },
  verifiedAt: Date,
  claimedAt: Date,
  lastCheckedAt: Date,
  failureReason: String,
  tlsProvider: String,
  tlsRequestedAt: Date,
  tlsChallenges: [{
    _id: false,
    type: { type: String },
    domain: String,
    value: String,
    reason: String,
  }],
}, { timestamps: true })

export const StorefrontDomain = mongoose.model<IStorefrontDomain>('StorefrontDomain', storefrontDomainSchema)
