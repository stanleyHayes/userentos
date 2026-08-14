import mongoose, { Schema, type Document as MongoDoc } from 'mongoose'

export interface IDocument extends MongoDoc {
  ownerId: string
  name: string
  type: 'rental_agreement' | 'receipt' | 'legal_notice' | 'evidence' | 'identity' | 'other'
  mimeType: string
  fileUrl: string
  fileSize: number
  version: number
  parentId?: string // for version chains
  linkedEntityId?: string // property, agreement, dispute ID
  linkedEntityType?: string
  accessControl: string[] // user IDs who can access
}

const documentSchema = new Schema<IDocument>({
  ownerId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, required: true, enum: ['rental_agreement', 'receipt', 'legal_notice', 'evidence', 'identity', 'other'] },
  mimeType: { type: String, required: true },
  fileUrl: { type: String, required: true },
  fileSize: { type: Number, required: true },
  version: { type: Number, default: 1 },
  parentId: String,
  linkedEntityId: { type: String, index: true },
  linkedEntityType: String,
  accessControl: [String],
}, { timestamps: true })

export const DocumentModel = mongoose.model<IDocument>('Document', documentSchema)
