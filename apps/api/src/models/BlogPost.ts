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
  /** User id of the author — drives the author dashboard and moderation. */
  authorId?: string
  /** Storefront this post belongs to; scopes the storefront blog feed. */
  storefrontId?: string
  status?: 'draft' | 'in_review' | 'scheduled' | 'published' | 'archived' | 'removed'
  scheduledFor?: Date
  /**
   * When the post actually went live. Distinct from createdAt: a post drafted
   * in March and scheduled for June was created once and published once, and a
   * reader's "posted on" date means the second of those.
   */
  publishedAt?: Date
  seoTitle?: string
  seoDescription?: string
  canonicalUrl?: string
  /** Set by an admin takedown; kept for the audit trail. */
  removedReason?: string
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
  authorId: { type: String, index: true },
  storefrontId: { type: String, index: true },
  status: { type: String, enum: ['draft', 'in_review', 'scheduled', 'published', 'archived', 'removed'], default: 'draft', index: true },
  scheduledFor: Date,
  publishedAt: Date,
  seoTitle: String,
  seoDescription: String,
  canonicalUrl: String,
  removedReason: String,
}, { timestamps: true })

export const BlogPost = mongoose.model<IBlogPost>('BlogPost', blogPostSchema)
