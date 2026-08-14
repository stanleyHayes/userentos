import mongoose, { Schema, type Document } from 'mongoose'

export interface IAgencyProfile extends Document {
  ownerId: string
  name: string
  slug: string
  description?: string
  phone: string
  email?: string
  city: string
  logo?: string
  teamMembers: { name: string; role: string; phone?: string }[]
  createdAt: Date
  updatedAt: Date
}

const agencyProfileSchema = new Schema<IAgencyProfile>(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: String,
    phone: { type: String, required: true },
    email: String,
    city: { type: String, required: true },
    logo: String,
    teamMembers: { type: [{ name: String, role: String, phone: String }], default: [] },
  },
  { timestamps: true },
)

export const AgencyProfile = mongoose.model<IAgencyProfile>('AgencyProfile', agencyProfileSchema)
