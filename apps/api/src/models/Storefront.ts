import mongoose, { Schema, type Document } from 'mongoose'

/**
 * A seller's branded shopfront (spec §4, §12).
 *
 * `slug` is the tenant key: it drives {slug}.userentos.com and every scoped
 * query. Reserved slugs are refused at the service layer so a storefront can
 * never shadow a platform hostname such as api or admin.
 */
export interface IStorefront extends Document {
  ownerType: 'user' | 'organization'
  ownerId: string
  slug: string
  name: string
  tagline?: string
  about?: string
  status: 'active' | 'suspended' | 'archived'
  /** The one URL that should be indexed; other domains redirect here. */
  canonicalDomain?: string
  branding: {
    logoUrl?: string
    coverUrl?: string
    primaryColor?: string
    accentColor?: string
    theme?: string
    hideRentosBranding?: boolean
  }
  contact: { phone?: string; email?: string; whatsapp?: string; city?: string }
  /** Suspension reason, set by an admin. Kept for the audit trail. */
  suspendedReason?: string
  createdAt: Date
  updatedAt: Date
}

const storefrontSchema = new Schema<IStorefront>({
  ownerType: { type: String, required: true, enum: ['user', 'organization'], default: 'user' },
  ownerId: { type: String, required: true, index: true },
  slug: { type: String, required: true, unique: true, lowercase: true, index: true },
  name: { type: String, required: true },
  tagline: String,
  about: String,
  status: { type: String, enum: ['active', 'suspended', 'archived'], default: 'active', index: true },
  canonicalDomain: String,
  branding: {
    logoUrl: String,
    coverUrl: String,
    primaryColor: String,
    accentColor: String,
    theme: { type: String, default: 'default' },
    hideRentosBranding: { type: Boolean, default: false },
  },
  contact: { phone: String, email: String, whatsapp: String, city: String },
  suspendedReason: String,
}, { timestamps: true })

export const Storefront = mongoose.model<IStorefront>('Storefront', storefrontSchema)
