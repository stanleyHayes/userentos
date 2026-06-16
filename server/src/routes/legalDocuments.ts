import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { LegalDocument } from '../models/LegalDocument.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { embed } from '../services/embeddings.js'
import { retrieveLegalChunks } from '../services/rag.js'

const router = Router()

// Admin: ingest a new legal document
router.post('/', authenticate, requireRole('admin', 'super_admin', 'legal_officer'), async (req, res) => {
  const schema = z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    source: z.string().min(1),
    category: z.enum(['act', 'regulation', 'guideline', 'case_law', 'procedure']).default('act'),
    year: z.number().optional(),
    section: z.string().optional(),
    tags: z.array(z.string()).default([]),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

  const { embedding } = await embed(parsed.data.content)

  const doc = await LegalDocument.create({
    ...parsed.data,
    embedding,
  })

  success(res, { ...doc.toObject(), id: doc._id.toString() }, 'Legal document ingested', 201)
})

// Admin: list all legal documents
router.get('/', authenticate, requireRole('admin', 'super_admin', 'legal_officer'), async (req, res) => {
  const filter: Record<string, unknown> = {}
  if (req.query.category) filter.category = req.query.category
  if (req.query.isActive === 'true') filter.isActive = true
  if (req.query.isActive === 'false') filter.isActive = false
  if (req.query.search) {
    filter.$text = { $search: req.query.search as string }
  }

  const docs = await LegalDocument.find(filter)
    .sort({ createdAt: -1 })
    .select('-embedding')
    .lean()

  success(res, {
    items: docs.map((d) => ({ ...d, id: (d._id as Types.ObjectId).toString() })),
    total: docs.length,
  })
})

// Admin: get single document
router.get('/:id', authenticate, requireRole('admin', 'super_admin', 'legal_officer'), async (req, res) => {
  const doc = await LegalDocument.findById(param(req.params.id)).lean()
  if (!doc) { error(res, 'Document not found', 404); return }
  success(res, { ...doc, id: (doc._id as Types.ObjectId).toString() })
})

// Admin: update document
router.patch('/:id', authenticate, requireRole('admin', 'super_admin', 'legal_officer'), async (req, res) => {
  const doc = await LegalDocument.findById(param(req.params.id))
  if (!doc) { error(res, 'Document not found', 404); return }

  const schema = z.object({
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    category: z.enum(['act', 'regulation', 'guideline', 'case_law', 'procedure']).optional(),
    year: z.number().optional(),
    section: z.string().optional(),
    tags: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

  // Re-embed if content changed
  if (parsed.data.content && parsed.data.content !== doc.content) {
    const { embedding } = await embed(parsed.data.content)
    doc.embedding = embedding
  }

  Object.assign(doc, parsed.data)
  await doc.save()

  success(res, { ...doc.toObject(), id: doc._id.toString() })
})

// Admin: delete document
router.delete('/:id', authenticate, requireRole('admin', 'super_admin', 'legal_officer'), async (req, res) => {
  await LegalDocument.findByIdAndDelete(param(req.params.id))
  success(res, null, 'Document deleted')
})

// Public: semantic search over legal documents
router.post('/search', async (req, res) => {
  const schema = z.object({
    query: z.string().min(1),
    topK: z.number().int().min(1).max(20).default(5),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

  const chunks = await retrieveLegalChunks(parsed.data.query, parsed.data.topK)
  success(res, { items: chunks, total: chunks.length })
})

export default router
