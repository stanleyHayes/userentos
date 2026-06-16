import mongoose, { Schema, type Document } from 'mongoose'

export interface IFavorite extends Document {
  userId: string
  propertyId: string
}

const favoriteSchema = new Schema<IFavorite>({
  userId: { type: String, required: true, index: true },
  propertyId: { type: String, required: true, index: true },
}, { timestamps: true })

// One favorite per user per property
favoriteSchema.index({ userId: 1, propertyId: 1 }, { unique: true })

export const Favorite = mongoose.model<IFavorite>('Favorite', favoriteSchema)
