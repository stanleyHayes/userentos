import mongoose, { Schema } from 'mongoose'

// Persist BEFORE uploading so failed requests and replaced photos remain traceable.
const schema = new Schema({
  _id: { type: String, required: true },
  ownerId: { type: String, required: true, index: true },
  publicId: String,
  cloudName: String,
  legacyUrl: String,
}, { timestamps: true })
export const AvatarAsset = mongoose.model('AvatarAsset', schema)
