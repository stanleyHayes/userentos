import mongoose, { Schema, type Document } from 'mongoose'

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
  subscriptionStartDate?: Date
  subscriptionEndDate?: Date
  invitedBy?: string
  deletedAt?: Date
  mfaEnabled: boolean
  mfaSecret?: string
  /** Set whenever the password changes — invalidates reset tokens issued before. */
  credentialsChangedAt?: Date
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
  roles: { type: [String], required: true },
  activeRole: { type: String, required: true },
  permissions: { type: [String], default: [] },
  ghanaCardId: String,
  isVerified: { type: Boolean, default: false },
  verificationStatus: { type: String, enum: ['none', 'pending', 'verified'], default: 'none' },
  taxReportingConsent: { type: Boolean, default: false },
  profileImage: String,
  subscriptionPackageId: { type: String },
  subscriptionPlanVersion: { type: Number },
  subscriptionStartDate: { type: Date },
  subscriptionEndDate: { type: Date },
  invitedBy: { type: String },
  deletedAt: { type: Date, index: true },
  mfaEnabled: { type: Boolean, default: false },
  // select:false — the TOTP seed must never ride along in general queries
  // (the admin user list previously leaked every user's seed). Code that
  // verifies codes opts in explicitly with .select('+mfaSecret').
  mfaSecret: { type: String, select: false },
  credentialsChangedAt: { type: Date },
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
