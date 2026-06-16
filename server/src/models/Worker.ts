import mongoose, { Schema, type Document } from 'mongoose'

export type WorkerStatus = 'available' | 'busy' | 'offline'
export type WorkerVerificationLevel = 'none' | 'basic' | 'verified' | 'premium'

export interface IWorker extends Document {
  userId?: string
  name: string
  phone: string
  email?: string
  photo?: string
  trades: string[]
  skills: string[]
  bio: string
  location: string
  serviceRadiusKm: number
  hourlyRate?: number
  fixedRates: { service: string; price: number }[]
  availability: {
    monday: string[]
    tuesday: string[]
    wednesday: string[]
    thursday: string[]
    friday: string[]
    saturday: string[]
    sunday: string[]
  }
  status: WorkerStatus
  verificationLevel: WorkerVerificationLevel
  verifiedAt?: Date
  rating: number
  reviewCount: number
  completedJobs: number
  emergencyAvailable: boolean
  createdAt: Date
  updatedAt: Date
}

const workerSchema = new Schema<IWorker>({
  userId: { type: String, index: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: String,
  photo: String,
  trades: { type: [String], default: [] },
  skills: { type: [String], default: [] },
  bio: { type: String, default: '' },
  location: { type: String, required: true },
  serviceRadiusKm: { type: Number, default: 10 },
  hourlyRate: Number,
  fixedRates: { type: [{ service: String, price: Number }], default: [] },
  availability: {
    monday: { type: [String], default: [] },
    tuesday: { type: [String], default: [] },
    wednesday: { type: [String], default: [] },
    thursday: { type: [String], default: [] },
    friday: { type: [String], default: [] },
    saturday: { type: [String], default: [] },
    sunday: { type: [String], default: [] },
  },
  status: { type: String, enum: ['available', 'busy', 'offline'], default: 'available' },
  verificationLevel: { type: String, enum: ['none', 'basic', 'verified', 'premium'], default: 'none' },
  verifiedAt: Date,
  rating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  completedJobs: { type: Number, default: 0 },
  emergencyAvailable: { type: Boolean, default: false },
}, { timestamps: true })

workerSchema.index({ trades: 1 })
workerSchema.index({ location: 1 })
workerSchema.index({ status: 1 })
workerSchema.index({ rating: -1 })
workerSchema.index({ verificationLevel: 1 })
workerSchema.index({ emergencyAvailable: 1 })

export const Worker = mongoose.model<IWorker>('Worker', workerSchema)
