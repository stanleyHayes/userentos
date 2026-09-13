import mongoose, { Schema } from 'mongoose'

const storeProductSchema = new Schema({
  platform: { type: String, enum: ['apple', 'google'], required: true, immutable: true },
  productId: { type: String, required: true, immutable: true },
  basePlanId: { type: String, default: '', immutable: true },
  packageId: { type: String, required: true, immutable: true, index: true },
  entitlementSnapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
  isActive: { type: Boolean, default: false },
}, { timestamps: true })

// Keep inactive mappings: reusing a product for a different package would
// reinterpret receipts and restorations for existing purchasers.
storeProductSchema.index({ platform: 1, productId: 1, basePlanId: 1 }, { unique: true })
export const StoreProduct = mongoose.model('StoreProduct', storeProductSchema)
