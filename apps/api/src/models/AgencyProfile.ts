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
  // Real Estate Agency Act 2020 (Act 1047): agents and brokers must hold a REAC
  // licence. The number is self-reported until an admin checks it with REAC.
  reacLicenceNumber?: string
  reacLicenceVerifiedAt?: Date
  reacLicenceVerifiedBy?: string
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
    reacLicenceNumber: { type: String, trim: true },
    reacLicenceVerifiedAt: Date,
    reacLicenceVerifiedBy: String,
  },
  { timestamps: true },
)

export const AgencyProfile = mongoose.model<IAgencyProfile>('AgencyProfile', agencyProfileSchema)
