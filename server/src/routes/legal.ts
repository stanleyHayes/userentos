import { Router } from 'express'
import type { Types } from 'mongoose'
import { LegalArticle } from '../models/LegalArticle.js'
import { success, error } from '../utils/response.js'
import { param, escapeRegex } from '../utils/params.js'

const router = Router()

router.get('/', async (req, res) => {
  const filter: Record<string, unknown> = {}
  if (req.query.category) filter.category = req.query.category
  if (req.query.language) filter.language = req.query.language
  if (req.query.search) {
    const q = escapeRegex(String(req.query.search))
    filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { content: { $regex: q, $options: 'i' } },
      { tags: { $regex: q, $options: 'i' } },
    ]
  }

  const articles = await LegalArticle.find(filter).lean()
  const items = articles.map((a) => ({ ...a, id: (a._id as Types.ObjectId).toString() }))
  success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
})

router.get('/:id', async (req, res) => {
  const article = await LegalArticle.findById(param(req.params.id)).lean()
  if (!article) { error(res, 'Article not found', 404); return }
  success(res, { ...article, id: (article._id as Types.ObjectId).toString() })
})

export default router
