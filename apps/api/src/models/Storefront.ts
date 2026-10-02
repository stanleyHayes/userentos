import mongoose, { Schema, type Document } from 'mongoose'

/**
 * A professional's RentOS website (spec §4, §12; product brief §03).
 *
 * `slug` is the tenant key: it drives {slug}.userentos.com and every scoped
 * query. Reserved slugs are refused at the service layer so a storefront can
 * never shadow a platform hostname such as api or admin.
 *
 * RentOS owns the structure (Home, Properties, About, News, Contact); the
 * owner fills in the content below. They cannot add pages or move sections.
 *
 * Contact details (phone, email, WhatsApp, street address) are private: every
 * enquiry goes through RentOS so deals stay on the platform, where the
 * customer is protected and RentOS earns its share. Public reads strip them.
 */
export interface IStorefront extends Document {
  ownerType: 'user' | 'organization'
  ownerId: string
  slug: string
  name: string
  tagline?: string
  about?: string
  status: 'active' | 'suspended' | 'archived'
  /**
   * Whether the public can see it. A website set up in onboarding starts as a
   * draft and goes live when the owner launches it; storefronts created before
   * this existed have no value and count as published.
   */
  published?: boolean
  publishedAt?: Date
  /** The Home page's headline and supporting line. */
  heroTitle?: string
  heroSubtitle?: string
  /** What the business does, e.g. "Lettings", "Sales", "Property management". */
  services: string[]
  /** Areas the business covers, e.g. "East Legon", "Spintex". */
  serviceAreas: string[]
  /** Image beside the About story. */
  aboutImageUrl?: string
  /** Photos of the team, office or work, shown on About. */
  gallery: string[]
  /** Storage id of every uploaded image, so the files are erased with the website. */
  imageAssets: { url: string; publicId: string }[]
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
  /** phone, email, whatsapp and address are private (never in a public read); city and hours are shown. */
  contact: { phone?: string; email?: string; whatsapp?: string; city?: string; address?: string; hours?: string }
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
  published: { type: Boolean },
  publishedAt: Date,
  heroTitle: String,
  heroSubtitle: String,
  services: { type: [String], default: [] },
  serviceAreas: { type: [String], default: [] },
  aboutImageUrl: String,
  gallery: { type: [String], default: [] },
  imageAssets: { type: [{ _id: false, url: { type: String, required: true }, publicId: { type: String, required: true } }], default: [] },
  canonicalDomain: String,
  branding: {
    logoUrl: String,
    coverUrl: String,
    primaryColor: String,
    accentColor: String,
    theme: { type: String, default: 'default' },
    hideRentosBranding: { type: Boolean, default: false },
  },
  contact: { phone: String, email: String, whatsapp: String, city: String, address: String, hours: String },
  suspendedReason: String,
}, { timestamps: true })

export const Storefront = mongoose.model<IStorefront>('Storefront', storefrontSchema)
