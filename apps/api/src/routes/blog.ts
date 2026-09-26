import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { BlogPost } from '../models/BlogPost.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { User } from '../models/User.js'
import { REGULATED_FEATURES, isRegulatedFeatureEnabled } from '../config/regulatedFeatures.js'

const router = Router()

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * What counts as RentOS editorial.
 *
 * The platform blog and a storefront's blog are different publications that
 * happen to share a collection. "Has no storefront" used to be the whole test,
 * but any author can save a post with attachToStorefront: false — and that
 * post then appeared on the official RentOS blog under the author's byline.
 *
 * A post is editorial when staff created it here (`platform: true`). Posts
 * from before the flag carry no `platform` field; among those, staff and seed
 * posts still hold the schema's default status 'draft' while live, because
 * only the authoring flow ever moves a post to 'published'. The authoring
 * routes always write `platform: false`, so nothing they create can match the
 * legacy branch.
 */
// `$eq: null` matches both an explicit null and a missing field, which is how
// a post with no storefront is actually stored.
const PLATFORM_ONLY: Record<string, unknown> = {
  storefrontId: { $eq: null },
  $and: [{ $or: [
    { platform: true },
    { platform: { $exists: false }, status: { $in: ['draft', null] } },
  ] }],
}

// Posts about a regulated service stay hidden while it isn't offered, so the
// blog never advertises something the operator isn't licensed to provide.
function offeredOnly(): Record<string, unknown> {
  const off = REGULATED_FEATURES.filter((feature) => !isRegulatedFeatureEnabled(feature))
  return off.length ? { requiresFeature: { $nin: off } } : {}
}

// Public: list published posts on the platform's own blog
router.get('/', async (req, res) => {
  const filter: Record<string, unknown> = { published: true, ...PLATFORM_ONLY, ...offeredOnly() }
  if (req.query.tag) filter.tags = req.query.tag
  if (req.query.search) {
    const escaped = escapeRegex(String(req.query.search))
    filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { excerpt: { $regex: escaped, $options: 'i' } },
    ]
  }

  const posts = await BlogPost.find(filter).sort({ createdAt: -1 }).lean()
  const items = posts.map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() }))
  success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
})

// Public: get single post by slug
router.get('/slug/:slug', async (req, res) => {
  const slugFilter: Record<string, unknown> = { slug: param(req.params.slug), published: true, ...PLATFORM_ONLY, ...offeredOnly() }
  const post = await BlogPost.findOne(slugFilter).lean()
  if (!post) { error(res, 'Post not found', 404); return }
  success(res, { ...post, id: (post._id as Types.ObjectId).toString() })
})

// Get post by ID (for editing). Unpublished drafts stay private to their author
// and staff — the list/slug endpoints already filter to published posts only.
router.get('/:id', authenticate, async (req, res) => {
  const post = await BlogPost.findById(param(req.params.id)).lean()
  if (!post) { error(res, 'Post not found', 404); return }
  const roles = req.user!.roles
  const isStaff = roles.includes('admin') || roles.includes('government') || roles.includes('legal_officer') || roles.includes('super_admin')
  // `author` is a display name, not an id — comparing it to userId never
  // matched, so an author could not open their own unpublished draft here.
  // `authorId` is the ownership field.
  if (!post.published && post.authorId !== req.user!.userId && !isStaff) {
    error(res, 'Post not found', 404)
    return
  }
  success(res, { ...post, id: (post._id as Types.ObjectId).toString() })
})

// Admin: create post
router.post('/', authenticate, requireRole('admin', 'government', 'legal_officer'), async (req, res) => {
  const schema = z.object({
    title: z.string().min(1),
    slug: z.string().min(1),
    excerpt: z.string().min(1),
    content: z.string().min(1),
    coverImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
    published: z.boolean().default(false),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  /*
   * `author` is the public byline; `authorId` is the ownership field.
   *
   * This wrote the raw ObjectId into `author` and never set `authorId` at all,
   * so the public blog credited a post to "6aa469…" and the ownership check on
   * GET /blog/:id could never match — an author could not open their own
   * unpublished draft. Same mistake authoring.ts made with the email address.
   */
  const writer = await User.findById(req.user!.userId).select('firstName lastName').lean()
  const byline = writer ? `${writer.firstName ?? ''} ${writer.lastName ?? ''}`.trim() : ''

  const post = await BlogPost.create({
    ...parsed.data,
    author: byline || 'RentOS editorial',
    authorId: req.user!.userId,
    // The only place a post becomes RentOS editorial.
    platform: true,
  })
  success(res, { ...post.toObject(), id: post._id.toString() }, 'Post created', 201)
})

// Admin: update post
router.patch('/:id', authenticate, requireRole('admin', 'government', 'legal_officer'), async (req, res) => {
  const schema = z.object({
    title: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    excerpt: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    coverImage: z.string().optional(),
    tags: z.array(z.string()).optional(),
    published: z.boolean().optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  /*
   * Staff edit RentOS editorial only. Unscoped, this let government and legal
   * officers rewrite any seller's storefront post, and re-publish one an admin
   * had taken down — storefront moderation belongs to the audited takedown in
   * authoring.ts. A removed post can't be switched back on from here either.
   */
  const scope: Record<string, unknown> = { _id: param(req.params.id), ...PLATFORM_ONLY }
  const filter: Record<string, unknown> = parsed.data.published ? { ...scope, status: { $ne: 'removed' } } : scope
  const post = await BlogPost.findOneAndUpdate(filter, parsed.data, { returnDocument: 'after' }).lean()
  if (!post) {
    const removed = parsed.data.published && await BlogPost.exists({ ...scope, status: 'removed' })
    if (removed) { error(res, 'This post was removed by moderation and can no longer be published.', 403); return }
    error(res, 'Post not found', 404)
    return
  }
  success(res, { ...post, id: (post._id as Types.ObjectId).toString() })
})

// Admin: delete post — RentOS editorial only (see PATCH). A seller's post is
// taken down through /api/authoring/posts/:id/takedown, which is audited.
router.delete('/:id', authenticate, requireRole('admin', 'government', 'legal_officer'), async (req, res) => {
  const result = await BlogPost.deleteOne({ _id: param(req.params.id), ...PLATFORM_ONLY })
  if (!result.deletedCount) { error(res, 'Post not found', 404); return }
  success(res, null, 'Post deleted')
})

export default router
