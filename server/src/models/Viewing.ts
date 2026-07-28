import mongoose, { Schema, type Document } from 'mongoose'

export type ViewingStatus = 'requested' | 'confirmed' | 'completed' | 'cancelled'

export interface IViewing extends Document {
  leadId?: string
  propertyId: string
  agentId: string
  requesterId?: string
  viewerName: string
  viewerPhone: string
  date: string
  time: string
  status: ViewingStatus
  notes?: string
  createdAt: Date
  updatedAt: Date
}

const viewingSchema = new Schema<IViewing>(
  {
    leadId: { type: String, index: true },
    propertyId: { type: String, required: true, index: true },
    agentId: { type: String, required: true, index: true },
    requesterId: String,
    viewerName: { type: String, required: true },
    viewerPhone: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    status: { type: String, enum: ['requested', 'confirmed', 'completed', 'cancelled'], default: 'requested', index: true },
    notes: String,
  },
  { timestamps: true },
)

export const Viewing = mongoose.model<IViewing>('Viewing', viewingSchema)
