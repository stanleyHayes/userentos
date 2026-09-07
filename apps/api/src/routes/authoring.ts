/**
 * Blog authoring for sellers and agents (spec §6, P4).
 *
 * Publishing rights are plan-gated by a blog quota, and posts carry an author
 * and an optional storefront so a storefront feed contains only that seller's
 * content.
 */
import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { BlogPost } from '../models/BlogPost.js'
import { Storefront } from '../models/Storefront.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'
import { requireQuota, EntitlementError } from '../services/entitlements.js'

const router = Router()

const slugify = (title: string) =>
  title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)

/** The author's own dashboard: drafts, scheduled, published, archived. */
router.get('/posts', authenticate, asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = { authorId: req.user!.userId }
  if (req.query.status) filter.status = req.query.status

  const items = await BlogPost.find(filter).sort({ createdAt: -1 }).limit(100).lean()
  success(res, { items: items.map((p) => ({ ...p, id: String(p._id) })), total: items.length })
}))

const postSchema = z.object({
  title: z.string().min(3).max(160),
  excerpt: z.string().min(3).max(400),
  content: z.string().min(10).max(60_000),
  coverImage: z.string().url().optional(),
  tags: z.array(z.string().max(40)).max(10).default([]),
  seoTitle: z.string().max(160).optional(),
  seoDescription: z.string().max(320).optional(),
  canonicalUrl: z.string().url().optional(),
  scheduledFor: z.coerce.date().optional(),
  attachToStorefront: z.boolean().default(true),
})

router.post('/posts', authenticate, asyncHandler(async (req, res) => {
  const parsed = postSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  // No quota here. blog.limit is a *publishing* quota (§7.1): counting drafts
  // against it blocked an author from even saving work, and let anyone who
  // drafted before a downgrade publish past their new limit. The check now
  // lives on the publish route, where it belongs.

  const storefront = parsed.data.attachToStorefront
    ? await Storefront.findOne({ ownerId: req.user!.userId }).lean()
    : null

  let slug = slugify(parsed.data.title)
  if (await BlogPost.findOne({ slug }).lean()) slug = `${slug}-${Date.now().toString(36)}`

  // The byline is public. This used to be req.user.email, which published the
  // author's email address on every post they wrote.
  const author = await User.findById(req.user!.userId).select('firstName lastName').lean()
  const byline = author ? `${author.firstName ?? ''} ${author.lastName ?? ''}`.trim() : ''

  const post = await BlogPost.create({
    ...parsed.data,
    slug,
    author: byline || 'RentOS author',
    authorId: req.user!.userId,
    storefrontId: storefront ? String(storefront._id) : undefined,
    status: 'draft',
    published: false,
  })

  success(res, { ...post.toObject(), id: String(post._id) }, 'Draft saved', 201)
}))

router.patch('/posts/:id', authenticate, asyncHandler(async (req, res) => {
  const parsed = postSchema.partial().safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const post = await BlogPost.findById(param(req.params.id))
  if (!post) { error(res, 'Post not found', 404); return }
  if (post.authorId !== req.user!.userId) { error(res, 'You can only edit your own posts', 403); return }

  Object.assign(post, parsed.data)
  await post.save()
  success(res, { ...post.toObject(), id: String(post._id) }, 'Post updated')
}))

router.post('/posts/:id/publish', authenticate, asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(param(req.params.id))
  if (!post) { error(res, 'Post not found', 404); return }
  if (post.authorId !== req.user!.userId) { error(res, 'You can only publish your own posts', 403); return }
  if (post.status === 'published') { error(res, 'This post is already published', 409); return }

  // Plan-gated publishing quota (§7.1 blog.limit), counted over posts that are
  // actually live or queued to go live. Re-publishing an archived post counts
  // again, which is correct: it is occupying a slot once more.
  try {
    const live = await BlogPost.countDocuments({
      authorId: req.user!.userId,
      status: { $in: ['published', 'scheduled'] },
    })
    await requireQuota(req.user!.userId, 'blog.limit', live, 'Published posts')
  } catch (err) {
    if (err instanceof EntitlementError) { error(res, err.message, 402); return }
    throw err
  }

  // A future scheduledFor means "queue it", not "publish it now". Without this
  // the field was accepted, stored and then silently ignored.
  const scheduledFor = post.scheduledFor
  if (scheduledFor && scheduledFor.getTime() > Date.now()) {
    post.status = 'scheduled'
    post.published = false
    await post.save()

    await recordAudit(req, 'blog.scheduled', 'BlogPost', String(post._id), {
      slug: post.slug,
      scheduledFor: scheduledFor.toISOString(),
    })
    success(res, { id: String(post._id), status: post.status, scheduledFor }, 'Scheduled')
    return
  }

  post.status = 'published'
  post.published = true
  post.publishedAt = post.publishedAt ?? new Date()
  await post.save()

  await recordAudit(req, 'blog.published', 'BlogPost', String(post._id), { slug: post.slug })
  success(res, { id: String(post._id), status: post.status }, 'Published')
}))

router.post('/posts/:id/archive', authenticate, asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(param(req.params.id))
  if (!post) { error(res, 'Post not found', 404); return }
  if (post.authorId !== req.user!.userId) { error(res, 'You can only archive your own posts', 403); return }

  post.status = 'archived'
  post.published = false
  await post.save()
  success(res, { id: String(post._id), status: 'archived' }, 'Archived')
}))

/** Admin takedown (§6). */
router.post('/posts/:id/takedown', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const schema = z.object({ reason: z.string().min(3).max(500) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const post = await BlogPost.findById(param(req.params.id))
  if (!post) { error(res, 'Post not found', 404); return }

  post.status = 'removed'
  post.published = false
  post.removedReason = parsed.data.reason
  await post.save()

  await recordAudit(req, 'blog.takedown', 'BlogPost', String(post._id), { reason: parsed.data.reason })
  success(res, { id: String(post._id), status: 'removed' }, 'Post removed')
}))

export default router
