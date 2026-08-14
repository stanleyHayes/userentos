import mongoose, { Schema, type Document } from 'mongoose'

export interface IProperty extends Document {
  landlordId: string
  title: string
  description: string
  type: string
  stayType: 'short_stay' | 'long_stay'
  status: string
  listingStatus: 'draft' | 'pending_review' | 'approved' | 'rejected'
  rejectionReason?: string
  reviewedBy?: string
  reviewedAt?: Date
  publishedAt?: Date
  address: { street: string; city: string; region: string; digitalAddress?: string; neighborhood?: string }
  rentAmount: number
  rentDurationMonths: number
  advanceMonths: number
  images: string[]
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
  title: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, required: true, enum: ['apartment', 'house', 'room', 'commercial', 'warehouse', 'studio', 'townhouse', 'hostel', 'shared_room'] },
  stayType: { type: String, enum: ['short_stay', 'long_stay'], default: 'long_stay' },
  status: { type: String, required: true, enum: ['available', 'occupied', 'under_dispute', 'maintenance_required'], default: 'available' },
  listingStatus: { type: String, enum: ['draft', 'pending_review', 'approved', 'rejected'], default: 'draft' },
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

// Performance indexes
propertySchema.index({ status: 1, listingStatus: 1 })
propertySchema.index({ type: 1 })
propertySchema.index({ createdAt: -1 })
propertySchema.index({ 'address.city': 1, 'address.region': 1 })
propertySchema.index({ rentAmount: 1 })
propertySchema.index({ landlordId: 1, status: 1 })

// Text index for search
propertySchema.index({ title: 'text', description: 'text', 'address.city': 'text', 'address.neighborhood': 'text' })

// Geospatial index (for nearby queries)
propertySchema.index({ 'coordinates.lat': 1, 'coordinates.lng': 1 })

export const Property = mongoose.model<IProperty>('Property', propertySchema)
