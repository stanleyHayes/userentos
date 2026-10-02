/**
 * Metadata and sitemaps for the web app's page renderer (apps/web/api). Public,
 * read-only and cacheable: the renderer and Vercel's CDN cache the answers.
 */
import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { success, error } from '../utils/response.js'
import { landingData, pageMeta, sitemapXml } from '../services/seo.js'
import { popularSearches } from '../services/seoLanding.js'

const router = Router()

const hostOf = (value: unknown) => (typeof value === 'string' && value.length <= 253 ? value : '')

// GET /api/seo/meta?host=appiah-homes.userentos.com&path=/news/rent-prices
router.get('/meta', asyncHandler(async (req, res) => {
  const host = hostOf(req.query.host)
  const path = typeof req.query.path === 'string' ? req.query.path.slice(0, 512) : '/'
  if (!host) { error(res, 'host is required'); return }
  res.set('Cache-Control', 'public, max-age=60, s-maxage=300')
  success(res, await pageMeta(host, path))
}))

// GET /api/seo/landing?purpose=rent&path=accra/east-legon/apartments — a search page's data, for the app.
router.get('/landing', asyncHandler(async (req, res) => {
  const purpose = typeof req.query.purpose === 'string' ? req.query.purpose : ''
  const path = typeof req.query.path === 'string' ? req.query.path.slice(0, 256) : ''
  const model = await landingData(purpose, path)
  if (!model) { error(res, 'Unknown search page', 404); return }
  res.set('Cache-Control', 'public, max-age=60, s-maxage=300')
  // An unknown place is still answered with its (empty) page, as a 404.
  success(res, model, undefined, model.status)
}))

// GET /api/seo/popular — the busiest search pages, for "Popular searches".
router.get('/popular', asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300, s-maxage=900')
  success(res, await popularSearches(12))
}))

// GET /api/seo/sitemap.xml?host=userentos.com
router.get('/sitemap.xml', asyncHandler(async (req, res) => {
  const host = hostOf(req.query.host)
  if (!host) { error(res, 'host is required'); return }
  res.set('Cache-Control', 'public, max-age=300, s-maxage=3600')
  res.type('application/xml').send(await sitemapXml(host))
}))

export default router
