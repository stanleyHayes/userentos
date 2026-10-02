import mongoose, { Schema, type Document } from 'mongoose'
import { LISTING_TYPES, generateListingRef, type ListingType } from '../services/listings.js'

export interface IProperty extends Document {
  landlordId: string
  quotaSlot?: number
  title: string
  description: string
  type: string
  /** For rent, for sale or short let (see services/listings.ts); rentAmount is the asking price for that purpose. */
  listingType: ListingType
  /** Short public reference, e.g. RX7K2P9: the listing's shareable URL is /property/<ref>. */
  listingRef?: string
  stayType: 'short_stay' | 'long_stay'
  status: string
  listingStatus: 'draft' | 'pending_review' | 'in_review' | 'changes_requested' | 'approved' | 'rejected' | 'published' | 'suspended' | 'archived' | 'withdrawn'
  /** Bumped on each resubmission so review cycles stay distinguishable. */
  reviewVersion?: number
  submittedAt?: Date
  /** Actionable issues from the latest request-changes decision. */
  reviewIssues?: string[]
  rejectionReason?: string
  reviewedBy?: string
  reviewedAt?: Date
  publishedAt?: Date
  address: { street: string; city: string; region: string; digitalAddress?: string; neighborhood?: string }
  rentAmount: number
  rentDurationMonths: number
  advanceMonths: number
  images: string[]
  /** Storage id of each uploaded photo, so the file can be erased with the listing.
   * `uploadKey`: the app's key for that photo, so a retried upload is stored once. */
  imageAssets: { url: string; publicId: string; uploadKey?: string }[]
  videos: string[]
  rules: string[]
  amenities: string[]

  // Property details
  bedrooms: number
  bathrooms: number
  furnished: boolean
  floorArea?: number  // sqm
  floor?: number
  parkingSpaces: number
  yearBuilt?: number
  availableFrom?: string

  // Tenant preferences / restrictions
  preferences: {
    minCreditScore: number
    minIncomeMultiple: number  // e.g. 3x means income must be 3x rent
    maxOccupants: number
    allowSmokers: boolean
    allowPets: boolean
    allowChildren: boolean
    preferredEmployment: string[]  // empty = any
    preferredGender: string   // any, male, female
    minAge: number
    maxAge: number
    requireReferences: boolean
    requireEmploymentProof: boolean
    requireProfileComplete: boolean
  }

  // Accessibility features
  accessibility: {
    wheelchairAccessible: boolean
    stepFreeEntry: boolean
    elevator: boolean
    accessibleBathroom: boolean
    hearingLoop: boolean
    brailleSignage: boolean
    groundFloorOnly: boolean
  }

  // Stats
  views: number
  inquiries: number
  favorites: number

  // Semantic search
  embedding?: number[]

  // Geospatial
  coordinates?: { lat: number; lng: number }
}

const propertySchema = new Schema<IProperty>({
  landlordId: { type: String, required: true, index: true },
  quotaSlot: { type: Number, min: 0, immutable: true, validate: Number.isSafeInteger },
  title: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, required: true, enum: ['apartment', 'house', 'room', 'commercial', 'warehouse', 'studio', 'townhouse', 'hostel', 'shared_room'] },
  listingType: { type: String, enum: LISTING_TYPES, default: 'rent' },
  listingRef: { type: String, uppercase: true, trim: true },
  stayType: { type: String, enum: ['short_stay', 'long_stay'], default: 'long_stay' },
  status: { type: String, required: true, enum: ['available', 'occupied', 'under_dispute', 'maintenance_required'], default: 'available' },
  listingStatus: {
    type: String,
    enum: ['draft', 'pending_review', 'in_review', 'changes_requested', 'approved', 'rejected', 'published', 'suspended', 'archived', 'withdrawn'],
    default: 'draft',
  },
  reviewVersion: { type: Number, default: 1 },
  submittedAt: Date,
  reviewIssues: { type: [String], default: [] },
  rejectionReason: String,
  reviewedBy: String,
  reviewedAt: Date,
  publishedAt: Date,
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    region: { type: String, required: true },
    digitalAddress: String,
    neighborhood: String,
  },
  rentAmount: { type: Number, required: true },
  rentDurationMonths: { type: Number, required: true },
  advanceMonths: { type: Number, required: true },
  images: [String],
  imageAssets: { type: [{ _id: false, url: { type: String, required: true }, publicId: { type: String, required: true }, uploadKey: String }], default: [] },
  videos: [String],
  rules: [String],
  amenities: [String],

  bedrooms: { type: Number, default: 1 },
  bathrooms: { type: Number, default: 1 },
  furnished: { type: Boolean, default: false },
  floorArea: Number,
  floor: Number,
  parkingSpaces: { type: Number, default: 0 },
  yearBuilt: Number,
  availableFrom: String,

  preferences: {
    minCreditScore: { type: Number, default: 0 },
    minIncomeMultiple: { type: Number, default: 0 },
    maxOccupants: { type: Number, default: 10 },
    allowSmokers: { type: Boolean, default: true },
    allowPets: { type: Boolean, default: true },
    allowChildren: { type: Boolean, default: true },
    preferredEmployment: [String],
    preferredGender: { type: String, default: 'any' },
    minAge: { type: Number, default: 18 },
    maxAge: { type: Number, default: 100 },
    requireReferences: { type: Boolean, default: false },
    requireEmploymentProof: { type: Boolean, default: false },
    requireProfileComplete: { type: Boolean, default: false },
  },

  accessibility: {
    wheelchairAccessible: { type: Boolean, default: false },
    stepFreeEntry: { type: Boolean, default: false },
    elevator: { type: Boolean, default: false },
    accessibleBathroom: { type: Boolean, default: false },
    hearingLoop: { type: Boolean, default: false },
    brailleSignage: { type: Boolean, default: false },
    groundFloorOnly: { type: Boolean, default: false },
  },

  views: { type: Number, default: 0 },
  inquiries: { type: Number, default: 0 },
  favorites: { type: Number, default: 0 },
  embedding: { type: [Number], index: false },
  coordinates: {
    lat: { type: Number },
    lng: { type: Number },
  },
}, { timestamps: true })

// Every listing gets a shareable reference, and its purpose decides the parts
// of a rental record that do not apply: a short let is a short stay, and
// neither it nor a sale has a lease length or rent advance.
propertySchema.pre('validate', function () {
  if (!this.listingRef) this.listingRef = generateListingRef()
  if (this.listingType === 'short_let') this.stayType = 'short_stay'
  if (this.listingType === 'sale' || this.listingType === 'short_let') {
    if (this.rentDurationMonths == null) this.rentDurationMonths = 0
    if (this.advanceMonths == null) this.advanceMonths = 0
  }
})

// Performance indexes
propertySchema.index({ listingRef: 1 }, { name: 'property_listing_ref', unique: true, partialFilterExpression: { listingRef: { $type: 'string' } } })
propertySchema.index({ listingType: 1, listingStatus: 1 })
propertySchema.index({ status: 1, listingStatus: 1 })
propertySchema.index({ type: 1 })
propertySchema.index({ createdAt: -1 })
propertySchema.index({ 'address.city': 1, 'address.region': 1 })
propertySchema.index({ rentAmount: 1 })
propertySchema.index({ landlordId: 1, status: 1 })
propertySchema.index({ landlordId: 1, quotaSlot: 1 }, { name: 'property_landlord_quota_slot', unique: true, partialFilterExpression: { quotaSlot: { $type: 'number' } } })

// Text index for search
propertySchema.index({ title: 'text', description: 'text', 'address.city': 'text', 'address.neighborhood': 'text' })

// Geospatial index (for nearby queries)
propertySchema.index({ 'coordinates.lat': 1, 'coordinates.lng': 1 })

export const Property = mongoose.model<IProperty>('Property', propertySchema)
