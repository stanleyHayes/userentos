import mongoose, { Schema, type Document } from 'mongoose'

export interface IBlogPost extends Document {
  title: string
  slug: string
  excerpt: string
  content: string
  author: string
  coverImage?: string
  tags: string[]
  published: boolean
}

const blogPostSchema = new Schema<IBlogPost>({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  excerpt: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: String, required: true },
  coverImage: String,
  tags: [String],
  published: { type: Boolean, default: false },
}, { timestamps: true })

export const BlogPost = mongoose.model<IBlogPost>('BlogPost', blogPostSchema)
