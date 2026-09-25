import mongoose, { Schema, type Document } from 'mongoose'
import { decryptPii, piiSetter, PII_FIELDS } from '../utils/piiCrypto.js'
import { USER_ROLES } from '../utils/accessControl.js'
import { isConsentRequired } from '../types/index.js'

/**
 * Evidence of Terms/Privacy acceptance (Act 843 s.20 consent; store terms).
 * Written only by the server from a validated acceptance — never from a
 * profile update body. Each acceptance is also audit-logged (consent.accept),
 * which keeps the history; this holds the latest.
 */
export interface IUserConsents {
  termsVersion: string
  privacyVersion: string
  acceptedAt: Date
  ageConfirmed: boolean
  ip?: string
  userAgent?: string
}

export interface IUser extends Document {
  email: string
  phone: string
  firstName: string
  lastName: string
  passwordHash: string
  roles: string[]
  activeRole: string
  permissions: string[]
  ghanaCardId?: string
  isVerified: boolean
  /** Identity-verification workflow state: none → pending → verified (admin action). */
  verificationStatus: 'none' | 'pending' | 'verified'
  taxReportingConsent: boolean
  storeAccountToken?: string
  profileImage?: string
  subscriptionPackageId?: string
  /**
   * The plan VERSION this subscriber signed up on.
   *
   * Entitlements are authored per plan version precisely so that changing
   * commercial terms does not re-price people who already subscribed. Without
   * this recorded here there is nothing to grandfather against, and every
   * subscriber silently moves to the newest version the moment it is
   * published. Absent on older rows, which fall back to the plan's current
   * version — the behaviour they already had.
   */
  subscriptionPlanVersion?: number
  subscriptionPaymentId?: string
  subscriptionSnapshotJson?: string
  subscriptionStartDate?: Date
  subscriptionEndDate?: Date
  invitedBy?: string
  deletedAt?: Date
  suspendedAt?: Date
  suspensionReason?: string
  suspensionReportId?: string
  mfaEnabled: boolean
  mfaSecret?: string
  /** Set whenever the password changes — invalidates reset tokens issued before. */
  biometricVersion?: number
  sessionVersion?: number
  credentialsChangedAt?: Date
  consents?: IUserConsents
  settings?: {
    theme: string
    language: string
    notifications: {
      email: boolean
      sms: boolean
      push: boolean
      payment: boolean
      savings: boolean
    }
  }
}

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  passwordHash: { type: String, required: true },
  // Enum-checked per element so a cast object ({ _id: 'x' }) or an invented
  // role can never be persisted, whichever route wrote it.
  roles: { type: [{ type: String, enum: USER_ROLES }], required: true },
  activeRole: { type: String, enum: USER_ROLES, required: true },
  permissions: { type: [String], default: [] },
  // National ID is special personal data (Act 843): encrypted at rest on
  // every write path; read it through decryptPii / toSafe().
  ghanaCardId: { type: String, set: piiSetter(PII_FIELDS.userGhanaCard) },
  isVerified: { type: Boolean, default: false },
  verificationStatus: { type: String, enum: ['none', 'pending', 'verified'], default: 'none' },
  taxReportingConsent: { type: Boolean, default: false },
  storeAccountToken: { type: String, select: false, unique: true, sparse: true },
  profileImage: String,
  subscriptionPackageId: { type: String },
  subscriptionPlanVersion: { type: Number },
  subscriptionPaymentId: String,
  subscriptionSnapshotJson: String,
  subscriptionStartDate: { type: Date },
  subscriptionEndDate: { type: Date },
  invitedBy: { type: String },
  deletedAt: { type: Date, index: true },
  suspendedAt: Date,
  suspensionReason: String,
  suspensionReportId: String,
  mfaEnabled: { type: Boolean, default: false },
  // select:false — the TOTP seed must never ride along in general queries
  // (the admin user list previously leaked every user's seed). Code that
  // verifies codes opts in explicitly with .select('+mfaSecret').
  mfaSecret: { type: String, select: false },
  credentialsChangedAt: { type: Date },
  biometricVersion: { type: Number, default: 0 },
  sessionVersion: { type: Number, default: 0 },
  consents: {
    termsVersion: String,
    privacyVersion: String,
    acceptedAt: Date,
    ageConfirmed: Boolean,
    ip: String,
    userAgent: String,
  },
  settings: {
    theme: { type: String, default: 'system' },
    language: { type: String, default: 'en' },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      payment: { type: Boolean, default: true },
      savings: { type: Boolean, default: true },
    },
  },
}, { timestamps: true })

// Exclude soft-deleted users from all queries by default
userSchema.pre(/^find/, function () {
  const conditions = (this as unknown as mongoose.Query<unknown, unknown>).getQuery()
  if (!conditions.deletedAt) {
    ;(this as unknown as mongoose.Query<unknown, unknown>).where({ deletedAt: { $exists: false } })
  }
})

userSchema.methods.toSafe = function () {
  const obj = this.toObject()
  obj.id = obj._id.toString()
  delete obj.passwordHash
  delete obj.mfaSecret
  delete obj.__v
  // toSafe() is the account owner's own view — decrypt their card for them.
  if (obj.ghanaCardId !== undefined) obj.ghanaCardId = decryptPii(obj.ghanaCardId, PII_FIELDS.userGhanaCard)
  // Clients re-prompt for acceptance when this is true (new Terms/Privacy
  // version, or an account that predates consent capture).
  obj.consentRequired = isConsentRequired(obj.consents)
  return obj
}

// Belt-and-braces: any res.json(userDoc) path that forgets toSafe() still
// never serializes credentials or the TOTP seed.
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>
    delete obj.passwordHash
    delete obj.mfaSecret
    delete obj.__v
    return obj
  },
})

export const User = mongoose.model<IUser>('User', userSchema)
