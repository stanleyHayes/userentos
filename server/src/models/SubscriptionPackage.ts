import mongoose, { Schema, type Document } from 'mongoose'

export interface ISubscriptionPackage extends Document {
  name: string
  slug: string
  description: string
  price: number // monthly price in GHS, 0 = free
  billingCycle: 'monthly' | 'yearly'
  maxProperties: number // -1 = unlimited
  benefits: string[]
  isActive: boolean
  isDefault: boolean // auto-assigned to new landlords/managers
  sortOrder: number
}

const subscriptionPackageSchema = new Schema<ISubscriptionPackage>({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, default: 0 },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  maxProperties: { type: Number, required: true, default: 3 },
  benefits: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true })

subscriptionPackageSchema.methods.toSafe = function () {
  const obj = this.toObject()
  obj.id = obj._id.toString()
  delete obj.__v
  return obj
}

export const SubscriptionPackage = mongoose.model<ISubscriptionPackage>('SubscriptionPackage', subscriptionPackageSchema)
