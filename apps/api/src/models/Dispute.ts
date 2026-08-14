import mongoose, { Schema, type Document } from 'mongoose'

// IDispute
export interface IDispute extends Document {
  filedBy: string
  filedAgainst: string
  propertyId: string
  agreementId?: string
  category: string
  status: string
  title: string
  description: string
  evidence: { type: string; url: string; description: string; uploadedAt: string }[]
  mediationNotes?: string
  resolution?: string
  assignedTo?: string
  /** Property status before it was set under_dispute — restored on resolve/close. */
  previousPropertyStatus?: string
}

const disputeSchema = new Schema<IDispute>({
  filedBy: { type: String, required: true, index: true },
  filedAgainst: { type: String, required: true, index: true },
  propertyId: { type: String, required: true },
  agreementId: String,
  category: { type: String, required: true, enum: ['rent_increase', 'eviction', 'maintenance', 'deposit_refund', 'illegal_clause', 'other'] },
  status: { type: String, required: true, enum: ['filed', 'under_mediation', 'escalated', 'resolved', 'closed'], default: 'filed' },
  title: { type: String, required: true },
  description: { type: String, required: true },
  evidence: [{
    type: { type: String },
    url: String,
    description: String,
    uploadedAt: String,
  }],
  mediationNotes: String,
  resolution: String,
  assignedTo: String,
  previousPropertyStatus: String,
}, { timestamps: true })

export const Dispute = mongoose.model<IDispute>('Dispute', disputeSchema)
