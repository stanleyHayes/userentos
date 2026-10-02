import mongoose, { Schema, type Document } from 'mongoose'

export type LeadStatus = 'new' | 'contacted' | 'viewing' | 'applied' | 'closed' | 'lost'
/** How the enquiry arrived: "I'm interested", a WhatsApp tap, or the agent's website contact form. */
export type LeadChannel = 'interest' | 'whatsapp' | 'website'
export const LEAD_CHANNELS: readonly LeadChannel[] = ['interest', 'whatsapp', 'website']

export interface ILead extends Document {
  propertyId: string
  agentId: string
  requesterId?: string
  contactName: string
  contactPhone: string
  contactEmail?: string
  message?: string
  /** The first channel the enquiry came through. */
  channel: LeadChannel
  /** Every channel this person has used about the listing. */
  channels: LeadChannel[]
  status: LeadStatus
  createdAt: Date
  updatedAt: Date
}

const leadSchema = new Schema<ILead>(
  {
    propertyId: { type: String, required: true, index: true },
    agentId: { type: String, required: true, index: true },
    requesterId: String,
    contactName: { type: String, required: true },
    contactPhone: { type: String, required: true },
    contactEmail: String,
    message: String,
    channel: { type: String, enum: LEAD_CHANNELS, default: 'interest' },
    channels: { type: [String], enum: LEAD_CHANNELS, default: [] },
    status: { type: String, enum: ['new', 'contacted', 'viewing', 'applied', 'closed', 'lost'], default: 'new', index: true },
  },
  { timestamps: true },
)

leadSchema.index({ agentId: 1, status: 1, createdAt: -1 })

export const Lead = mongoose.model<ILead>('Lead', leadSchema)
