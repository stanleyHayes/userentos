import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { BlogPost } from '../models/BlogPost.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Public: list published posts
router.get('/', async (req, res) => {
  const filter: Record<string, unknown> = { published: true }
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
  const post = await BlogPost.findOne({ slug: param(req.params.slug), published: true }).lean()
  if (!post) { error(res, 'Post not found', 404); return }
  success(res, { ...post, id: (post._id as Types.ObjectId).toString() })
})

// Get post by ID (for editing)
router.get('/:id', authenticate, async (req, res) => {
  const post = await BlogPost.findById(param(req.params.id)).lean()
  if (!post) { error(res, 'Post not found', 404); return }
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

  const post = await BlogPost.create({ ...parsed.data, author: req.user!.userId })
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

  const post = await BlogPost.findByIdAndUpdate(param(req.params.id), parsed.data, { new: true }).lean()
  if (!post) { error(res, 'Post not found', 404); return }
  success(res, { ...post, id: (post._id as Types.ObjectId).toString() })
})

// Admin: delete post
router.delete('/:id', authenticate, requireRole('admin', 'government', 'legal_officer'), async (req, res) => {
  await BlogPost.findByIdAndDelete(param(req.params.id))
  success(res, null, 'Post deleted')
})

export default router
