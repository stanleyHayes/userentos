import mongoose, { Schema, type Document } from 'mongoose'

export interface ILegalArticle extends Document {
  title: string
  content: string
  simplifiedContent: string
  category: string
  lawReference: string
  effectiveDate: string
  tags: string[]
  language: string
}

const legalArticleSchema = new Schema<ILegalArticle>({
  title: { type: String, required: true },
  content: { type: String, required: true },
  simplifiedContent: { type: String, required: true },
  category: { type: String, required: true },
  lawReference: { type: String, required: true },
  effectiveDate: { type: String, required: true },
  tags: [String],
  language: { type: String, default: 'en' },
}, { timestamps: true })

export const LegalArticle = mongoose.model<ILegalArticle>('LegalArticle', legalArticleSchema)
