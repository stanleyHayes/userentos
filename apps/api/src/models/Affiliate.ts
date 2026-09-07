import mongoose, { Schema, type Document } from 'mongoose'

/** An affiliate's profile and referral code (spec §11). */
export interface IAffiliateProfile extends Document {
  userId: string
  code: string
  status: 'active' | 'suspended'
  suspendedReason?: string
  createdAt: Date
  updatedAt: Date
}

const affiliateProfileSchema = new Schema<IAffiliateProfile>({
  userId: { type: String, required: true, unique: true, index: true },
  code: { type: String, required: true, unique: true, uppercase: true, index: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  suspendedReason: String,
}, { timestamps: true })

export const AffiliateProfile = mongoose.model<IAffiliateProfile>('AffiliateProfile', affiliateProfileSchema)

/** A recorded referral touch, within the configured attribution window. */
export interface IAffiliateAttribution extends Document {
  affiliateId: string
  code: string
  referredUserId?: string
  sessionId?: string
  source?: string
  campaign?: string
  /** Set when anti-abuse rejects the attribution. */
  rejectedReason?: string
  expiresAt: Date
  createdAt: Date
}

const affiliateAttributionSchema = new Schema<IAffiliateAttribution>({
  affiliateId: { type: String, required: true, index: true },
  code: { type: String, required: true },
  referredUserId: { type: String, index: true },
  sessionId: String,
  source: String,
  campaign: String,
  rejectedReason: String,
  expiresAt: { type: Date, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } })

export const AffiliateAttribution = mongoose.model<IAffiliateAttribution>('AffiliateAttribution', affiliateAttributionSchema)

/**
 * A commission owed to an affiliate.
 *
 * The rule is snapshotted so that changing commission terms later never
 * rewrites what an affiliate already earned.
 */
export interface IAffiliateCommission extends Document {
  affiliateId: string
  event: 'qualified_signup' | 'subscription' | 'sponsorship' | 'transaction'
  sourceRef?: string
  ruleSnapshot: { type: 'flat' | 'percentage'; value: number }
  amount: number
  status: 'pending' | 'approved' | 'payable' | 'paid' | 'reversed' | 'rejected'
  reason?: string
  createdAt: Date
  updatedAt: Date
}

const affiliateCommissionSchema = new Schema<IAffiliateCommission>({
  affiliateId: { type: String, required: true, index: true },
  event: { type: String, required: true, enum: ['qualified_signup', 'subscription', 'sponsorship', 'transaction'] },
  sourceRef: String,
  ruleSnapshot: {
    type: { type: String, required: true, enum: ['flat', 'percentage'] },
    value: { type: Number, required: true },
  },
  amount: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['pending', 'approved', 'payable', 'paid', 'reversed', 'rejected'],
    default: 'pending',
    index: true,
  },
  reason: String,
}, { timestamps: true })

export const AffiliateCommission = mongoose.model<IAffiliateCommission>('AffiliateCommission', affiliateCommissionSchema)
