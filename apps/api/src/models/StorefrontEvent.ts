import mongoose, { Schema, type Document } from 'mongoose'

/**
 * Anonymous traffic events for a seller's storefront (spec §4).
 *
 * The `storefront.analytics` entitlement was enforceable but unservable because
 * nothing on the platform records storefront-scoped traffic: RegistryPageView
 * is keyed by registry path and carries no storefront dimension,
 * `Property.views` is a lifetime counter with no time axis, and
 * `Sponsorship.metrics` counts campaign impressions rather than shopfront ones.
 * None of them can answer "views this week against last week, for this seller",
 * so the numbers had to start being recorded somewhere.
 *
 * `visitorHash` is how unique visitors are counted without retaining anything
 * identifying — the same trade RegistryPageView.ipHash already makes here.
 */
export type StorefrontEventType = 'view' | 'listing_impression' | 'contact_click'
export type StorefrontContactChannel = 'phone' | 'email' | 'whatsapp'

export interface IStorefrontEvent extends Document {
  /** Tenant key. Matches Storefront.slug, which is how every scoped read works. */
  storefrontSlug: string
  type: StorefrontEventType
  /** Set when the event is about one listing — a listing view or a card impression. */
  propertyId?: string
  /** Which contact button was used. Always set for `contact_click`. */
  channel?: StorefrontContactChannel
  /** Client-generated per-tab id. Optional: crawlers and no-JS clients send none. */
  sessionId?: string
  /** SHA-256 of the session id, or of the request IP when there is no session. */
  visitorHash: string
  createdAt: Date
}

const storefrontEventSchema = new Schema<IStorefrontEvent>(
  {
    storefrontSlug: { type: String, required: true, lowercase: true, index: true },
    type: { type: String, required: true, enum: ['view', 'listing_impression', 'contact_click'] },
    propertyId: { type: String },
    channel: { type: String, enum: ['phone', 'email', 'whatsapp'] },
    sessionId: { type: String },
    visitorHash: { type: String, required: true },
  },
  // Events are written once and never edited, so an updatedAt on every row is
  // pure storage cost on the highest-volume collection here.
  { timestamps: { createdAt: true, updatedAt: false } },
)

// Every analytics read is "one storefront, one type, one date range".
storefrontEventSchema.index({ storefrontSlug: 1, createdAt: -1 })
storefrontEventSchema.index({ storefrontSlug: 1, type: 1, createdAt: -1 })

/**
 * Retention: 400 days.
 *
 * The reporting range is capped at 90 days and always compares against the 90
 * before it, so 180 days is the real floor; 400 leaves room for a year-on-year
 * view later without letting the collection grow without bound.
 */
storefrontEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 400 })

export const StorefrontEvent = mongoose.model<IStorefrontEvent>('StorefrontEvent', storefrontEventSchema)
