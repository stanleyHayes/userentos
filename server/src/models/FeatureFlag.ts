import mongoose, { Schema, type Document } from 'mongoose'
import type { UserRole } from '../types/index.js'

export interface IFeatureFlag extends Document {
  key: string
  description: string
  enabled: boolean
  rolloutPct: number
  enabledForUserIds: string[]
  enabledForRoles: UserRole[]
  disabledForUserIds: string[]
  createdAt: Date
  updatedAt: Date
}

const featureFlagSchema = new Schema<IFeatureFlag>({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: '' },
  enabled: { type: Boolean, default: false },
  rolloutPct: { type: Number, default: 0, min: 0, max: 100 },
  enabledForUserIds: { type: [String], default: [] },
  enabledForRoles: { type: [String], default: [] },
  disabledForUserIds: { type: [String], default: [] },
}, { timestamps: true })

featureFlagSchema.methods.toSafe = function () {
  const obj = this.toObject()
  obj.id = obj._id.toString()
  delete obj.__v
  return obj
}

export const FeatureFlag = mongoose.model<IFeatureFlag>('FeatureFlag', featureFlagSchema)
