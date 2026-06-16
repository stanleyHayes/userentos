import mongoose, { Schema, type Document } from 'mongoose'

export interface IInvitation extends Document {
  email: string
  roles: string[]
  permissions: string[]
  invitedBy: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  token: string
  expiresAt: Date
  acceptedAt?: Date
}

const invitationSchema = new Schema<IInvitation>({
  email: { type: String, required: true, lowercase: true },
  roles: { type: [String], required: true },
  permissions: { type: [String], default: [] },
  invitedBy: { type: String, required: true },
  status: { type: String, default: 'pending', enum: ['pending', 'accepted', 'expired', 'revoked'] },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  acceptedAt: Date,
}, { timestamps: true })

invitationSchema.index({ email: 1, status: 1 })

export const Invitation = mongoose.model<IInvitation>('Invitation', invitationSchema)
