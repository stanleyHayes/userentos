import mongoose, { Schema, type Document } from 'mongoose'

export type BookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'disputed'
export type BookingType = 'maintenance' | 'cleaning' | 'repair' | 'installation' | 'inspection' | 'emergency' | 'other'

export interface IServiceBooking extends Document {
  requesterId: string
  requesterRole: 'tenant' | 'landlord' | 'property_manager'
  workerId: string
  /** The worker's platform user id (Worker.userId), used for auth & notifications.
   *  workerId is the Worker document _id; the two are different namespaces. */
  workerUserId?: string
  propertyId?: string
  maintenanceRequestId?: string
  type: BookingType
  description: string
  status: BookingStatus
  scheduledDate?: string
  scheduledTime?: string
  estimatedCost?: number
  finalCost?: number
  quoteProvided: boolean
  quoteAmount?: number
  quoteAccepted: boolean
  paymentStatus: 'pending' | 'partial' | 'paid'
  paymentAmount?: number
  rating?: number
  review?: string
  images: string[]
  notes: { text: string; by: string; at: string }[]
  createdAt: Date
  updatedAt: Date
}

const serviceBookingSchema = new Schema<IServiceBooking>({
  requesterId: { type: String, required: true, index: true },
  requesterRole: { type: String, enum: ['tenant', 'landlord', 'property_manager'], required: true },
  workerId: { type: String, required: true, index: true },
  workerUserId: { type: String, index: true },
  propertyId: { type: String, index: true },
  maintenanceRequestId: { type: String, index: true },
  type: {
    type: String,
    enum: ['maintenance', 'cleaning', 'repair', 'installation', 'inspection', 'emergency', 'other'],
    default: 'maintenance',
  },
  description: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'disputed'],
    default: 'pending',
    index: true,
  },
  scheduledDate: String,
  scheduledTime: String,
  estimatedCost: Number,
  finalCost: Number,
  quoteProvided: { type: Boolean, default: false },
  quoteAmount: Number,
  quoteAccepted: { type: Boolean, default: false },
  paymentStatus: { type: String, enum: ['pending', 'partial', 'paid'], default: 'pending' },
  paymentAmount: Number,
  rating: Number,
  review: String,
  images: { type: [String], default: [] },
  notes: { type: [{ text: String, by: String, at: String }], default: [] },
}, { timestamps: true })

serviceBookingSchema.index({ status: 1, createdAt: -1 })
serviceBookingSchema.index({ requesterId: 1, status: 1 })
serviceBookingSchema.index({ workerId: 1, status: 1 })

export const ServiceBooking = mongoose.model<IServiceBooking>('ServiceBooking', serviceBookingSchema)
