import mongoose, { Schema, type Document } from 'mongoose'

export interface ILegalDocument extends Document {
  title: string
  content: string
  embedding: number[]
  source: string
  category: 'act' | 'regulation' | 'guideline' | 'case_law' | 'procedure'
  year?: number
  section?: string
  tags: string[]
  isActive: boolean
}

const legalDocumentSchema = new Schema<ILegalDocument>({
  title: { type: String, required: true },
  content: { type: String, required: true },
  embedding: { type: [Number], required: true, index: true },
  source: { type: String, required: true },
  category: { type: String, enum: ['act', 'regulation', 'guideline', 'case_law', 'procedure'], default: 'act' },
  year: Number,
  section: String,
  tags: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
}, { timestamps: true })

// Text search index for hybrid retrieval
legalDocumentSchema.index({ title: 'text', content: 'text', tags: 'text' })

export const LegalDocument = mongoose.model<ILegalDocument>('LegalDocument', legalDocumentSchema)
