import mongoose, { Schema } from 'mongoose'

const schema = new Schema({
  blockerId: { type: String, required: true },
  blockedId: { type: String, required: true },
}, { timestamps: true })
schema.index({ blockerId: 1, blockedId: 1 }, { unique: true })
schema.index({ blockedId: 1 })
export const UserBlock = mongoose.model('UserBlock', schema)
