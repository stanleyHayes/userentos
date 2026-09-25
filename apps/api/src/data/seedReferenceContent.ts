import { createHash } from 'crypto'
import type { RegulatedFeature } from '../config/regulatedFeatures.js'
import { LegalArticle } from '../models/LegalArticle.js'
import { BlogPost } from '../models/BlogPost.js'
import { LEGAL_ARTICLES, BLOG_POSTS, SUPERSEDED_SEED_CONTENT, reviewedOnly } from './referenceData.js'

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

type StoredCopy = { content: string; createdAt?: Date; updatedAt?: Date }

/**
 * A stored copy is safe to replace or withdraw only if nobody edited it: its
 * text is a known earlier seed version, or it was never modified after it was
 * created (databases seeded from versions older than the recorded hashes).
 */
function untouchedSeed(existing: StoredCopy, knownHash: string | undefined): boolean {
  if (knownHash && sha256(existing.content) === knownHash) return true
  const { createdAt, updatedAt } = existing
  return !!createdAt && !!updatedAt && Math.abs(new Date(updatedAt).getTime() - new Date(createdAt).getTime()) < 5000
}

export interface ContentSeedResult {
  inserted: number
  corrected: number
  withdrawn: number
}

/**
 * Production seeding of legal articles and blog posts.
 *
 * - Only `reviewed` items are planted (see ReviewMeta in referenceData.ts).
 * - A stored copy that is an untouched earlier seed version (its content hash
 *   is in SUPERSEDED_SEED_CONTENT, or it was never edited after creation) is
 *   replaced with the corrected text —
 *   earlier seeds planted wrong law (30-day deposit return, 24-hour notice
 *   under "S.15", a flat 6-month advance cap) and financial promotions.
 * - A stored copy of an item that is no longer seeded (retracted, or not yet
 *   reviewed) is withdrawn — deleted for articles, unpublished for posts —
 *   but again only while untouched. Anything an editor changed is left alone.
 */
export async function seedReviewedReferenceContent(): Promise<{ articles: ContentSeedResult; posts: ContentSeedResult }> {
  const articles: ContentSeedResult = { inserted: 0, corrected: 0, withdrawn: 0 }
  const posts: ContentSeedResult = { inserted: 0, corrected: 0, withdrawn: 0 }

  const reviewedArticles = reviewedOnly(LEGAL_ARTICLES)
  for (const article of reviewedArticles) {
    const existing = await LegalArticle.findOne({ title: article.title }).select('content createdAt updatedAt').lean()
    if (!existing) {
      await LegalArticle.updateOne({ title: article.title }, { $setOnInsert: article }, { upsert: true })
      articles.inserted++
    } else if (existing.content !== article.content && untouchedSeed(existing, SUPERSEDED_SEED_CONTENT.legalArticles[article.title])) {
      await LegalArticle.updateOne({ _id: existing._id }, { $set: article })
      articles.corrected++
    }
  }
  const seededTitles = new Set(reviewedArticles.map((a) => a.title))
  for (const [title, hash] of Object.entries(SUPERSEDED_SEED_CONTENT.legalArticles)) {
    if (seededTitles.has(title)) continue
    const existing = await LegalArticle.findOne({ title }).select('content createdAt updatedAt').lean()
    if (existing && untouchedSeed(existing, hash)) {
      await LegalArticle.deleteOne({ _id: existing._id })
      articles.withdrawn++
    }
  }

  const reviewedPosts = reviewedOnly(BLOG_POSTS)
  for (const post of reviewedPosts) {
    const existing = await BlogPost.findOne({ slug: post.slug }).select('content createdAt updatedAt').lean()
    if (!existing) {
      await BlogPost.updateOne({ slug: post.slug }, { $setOnInsert: post }, { upsert: true })
      posts.inserted++
    } else if (existing.content !== post.content && untouchedSeed(existing, SUPERSEDED_SEED_CONTENT.blogPosts[post.slug])) {
      await BlogPost.updateOne({ _id: existing._id }, { $set: post })
      posts.corrected++
    }
    // Visibility metadata follows the seed even on edited copies; leave updatedAt
    // alone so the copy still reads as untouched for future corrections.
    const requiresFeature = (post as { requiresFeature?: RegulatedFeature }).requiresFeature
    if (existing && requiresFeature) {
      await BlogPost.updateOne({ _id: existing._id, requiresFeature: { $ne: requiresFeature } }, { $set: { requiresFeature } }, { timestamps: false })
    }
  }
  const seededSlugs = new Set(reviewedPosts.map((p) => p.slug))
  for (const [slug, hash] of Object.entries(SUPERSEDED_SEED_CONTENT.blogPosts)) {
    if (seededSlugs.has(slug)) continue
    const existing = await BlogPost.findOne({ slug }).select('content createdAt updatedAt').lean()
    if (existing && untouchedSeed(existing, hash)) {
      await BlogPost.updateOne({ _id: existing._id }, { $set: { published: false, status: 'archived' } })
      posts.withdrawn++
    }
  }

  return { articles, posts }
}
