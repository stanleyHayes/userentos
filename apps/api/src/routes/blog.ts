import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { BlogPost } from '../models/BlogPost.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { User } from '../models/User.js'
import { REGULATED_FEATURES, isRegulatedFeatureEnabled } from '../config/regulatedFeatures.js'
import { Storefront } from '../models/Storefront.js'
import { storefrontUrl } from '../services/storefront.js'
import { submitToIndexNow } from '../services/indexNow.js'

const router = Router()

const slugify = (title: string) =>
  title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)

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

/**
 * RentOS Real Estate News (product brief §07): RentOS's own articles, plus
 * every post published on a live professional website, always credited to
 * that website ("By ABC Properties"). A suspended, archived or draft website's
 * posts stay out, like the website itself.
 */
async function hiddenStorefrontIds(): Promise<string[]> {
  const hidden = await Storefront.find({ $or: [{ status: { $ne: 'active' } }, { published: false }] }).select('_id').lean()
  return hidden.map((s) => String(s._id))
}

async function websitePostsFilter(): Promise<Record<string, unknown>> {
  return { storefrontId: { $exists: true, $ne: null, $nin: await hiddenStorefrontIds() }, status: 'published' }
}

/** Attribution for website posts: the website's name, address and logo. */
async function withAttribution<T extends { _id: unknown; storefrontId?: string | null }>(posts: T[]) {
  const ids = [...new Set(posts.map((p) => p.storefrontId).filter((id): id is string => Boolean(id)))]
  const sites = ids.length ? await Storefront.find({ _id: { $in: ids } }).select('name slug canonicalDomain branding.logoUrl').lean() : []
  const byId = new Map(sites.map((site) => [String(site._id), site]))
  return posts.map((p) => {
    const site = p.storefrontId ? byId.get(p.storefrontId) : undefined
    return {
      ...p,
      id: (p._id as Types.ObjectId).toString(),
      source: site ? 'website' as const : 'rentos' as const,
      website: site ? { name: site.name, slug: site.slug, url: storefrontUrl(site), logoUrl: site.branding?.logoUrl ?? null } : null,
    }
  })
}

// Public: the news feed. ?scope=rentos (RentOS articles), websites, or all (default).
router.get('/', async (req, res) => {
  const scope = req.query.scope === 'rentos' || req.query.scope === 'websites' ? req.query.scope : 'all'
  const sources: Record<string, unknown>[] = []
  if (scope !== 'websites') sources.push(PLATFORM_ONLY)
  if (scope !== 'rentos') sources.push(await websitePostsFilter())
  const and: Record<string, unknown>[] = [{ published: true }, offeredOnly(), { $or: sources }]
  if (req.query.tag) and.push({ tags: req.query.tag })
  if (req.query.search) {
    const escaped = escapeRegex(String(req.query.search))
    and.push({ $or: [{ title: { $regex: escaped, $options: 'i' } }, { excerpt: { $regex: escaped, $options: 'i' } }] })
  }
  const filter = { $and: and }
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 24))
  const page = Math.max(1, Number(req.query.page) || 1)

  // Newest first by publish date. Older RentOS articles never recorded one, so
  // they fall back to when they were written instead of sinking below every
  // website post.
  const [posts, total] = await Promise.all([
    BlogPost.aggregate<{ _id: Types.ObjectId; storefrontId?: string | null }>([
      { $match: filter },
      { $addFields: { feedDate: { $ifNull: ['$publishedAt', '$createdAt'] } } },
      { $sort: { feedDate: -1, _id: -1 } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
      { $project: { feedDate: 0 } },
    ]),
    BlogPost.countDocuments(filter),
  ])
  success(res, { items: await withAttribution(posts), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
})

// Public: one article by slug — RentOS's own or a website's, credited to it.
router.get('/slug/:slug', async (req, res) => {
  const slugFilter: Record<string, unknown> = { $and: [{ slug: param(req.params.slug), published: true }, offeredOnly(), { $or: [PLATFORM_ONLY, await websitePostsFilter()] }] }
  const post = await BlogPost.findOne(slugFilter).lean()
  if (!post) { error(res, 'Post not found', 404); return }
  const [attributed] = await withAttribution([post])
  success(res, attributed)
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
    // The news desk does not ask for one; it comes from the title.
    slug: z.string().min(1).optional(),
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

  let slug = slugify(parsed.data.slug || parsed.data.title) || 'post'
  if (await BlogPost.exists({ slug })) slug = `${slug}-${Date.now().toString(36)}`

  const post = await BlogPost.create({
    ...parsed.data,
    slug,
    author: byline || 'RentOS editorial',
    authorId: req.user!.userId,
    // The only place a post becomes RentOS editorial.
    platform: true,
    status: parsed.data.published ? 'published' : 'draft',
    // The news feed orders RentOS and website posts together by publish date.
    ...(parsed.data.published ? { publishedAt: new Date() } : {}),
  })
  if (post.status === 'published') void submitToIndexNow([`/article/${post.slug}`, '/blog'])
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
  const existing = parsed.data.published === undefined ? null : await BlogPost.findOne(filter).select('publishedAt').lean()
  // The scope already proves this is RentOS editorial, so a legacy row without
  // the flag gets it here; otherwise the status change below would drop it
  // out of PLATFORM_ONLY and off the feed.
  const update: Record<string, unknown> = { ...parsed.data, platform: true }
  if (parsed.data.published !== undefined) update.status = parsed.data.published ? 'published' : 'draft'
  if (parsed.data.published && existing && !existing.publishedAt) update.publishedAt = new Date()
  const post = await BlogPost.findOneAndUpdate(filter, update, { returnDocument: 'after' }).lean()
  if (!post) {
    const removed = parsed.data.published && await BlogPost.exists({ ...scope, status: 'removed' })
    if (removed) { error(res, 'This post was removed by moderation and can no longer be published.', 403); return }
    error(res, 'Post not found', 404)
    return
  }
  if (post.status === 'published') void submitToIndexNow([`/article/${post.slug}`, '/blog'])
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
