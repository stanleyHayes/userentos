import mongoose, { Schema, type Document } from 'mongoose'

/** An admin-configured sponsorship product (spec §9). */
export interface ISponsorshipProduct extends Document {
  name: string
  description?: string
  placement: 'search_top' | 'homepage' | 'category' | 'city'
  durationDays: number
  price: number
  targeting: { cities?: string[]; regions?: string[]; propertyTypes?: string[] }
  isActive: boolean
  sortOrder: number
}

const sponsorshipProductSchema = new Schema<ISponsorshipProduct>({
  name: { type: String, required: true },
  description: String,
  placement: { type: String, required: true, enum: ['search_top', 'homepage', 'category', 'city'], default: 'search_top' },
  durationDays: { type: Number, required: true, min: 1, default: 7 },
  price: { type: Number, required: true, min: 0 },
  targeting: { cities: [String], regions: [String], propertyTypes: [String] },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true })

export const SponsorshipProduct = mongoose.model<ISponsorshipProduct>('SponsorshipProduct', sponsorshipProductSchema)

/**
 * A purchased sponsorship campaign.
 *
 * `status` is separate from the listing's moderation state on purpose: when a
 * property loses approval the campaign stops SERVING but its billing history
 * is preserved, which the acceptance matrix requires.
 */
export interface ISponsorship extends Document {
  propertyId: string
  ownerId: string
  productId: string
  placement: string
  startAt: Date
  endAt: Date
  spend: number
  status: 'pending_payment' | 'active' | 'paused' | 'expired' | 'cancelled'
  pausedReason?: string
  transactionRef?: string
  metrics: { impressions: number; clicks: number }
  createdAt: Date
  updatedAt: Date
}

const sponsorshipSchema = new Schema<ISponsorship>({
  propertyId: { type: String, required: true, index: true },
  ownerId: { type: String, required: true, index: true },
  productId: { type: String, required: true },
  placement: { type: String, required: true },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true, index: true },
  spend: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['pending_payment', 'active', 'paused', 'expired', 'cancelled'],
    default: 'pending_payment',
    index: true,
  },
  pausedReason: String,
  transactionRef: String,
  metrics: {
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
}, { timestamps: true })

export const Sponsorship = mongoose.model<ISponsorship>('Sponsorship', sponsorshipSchema)
