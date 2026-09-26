import { Router } from 'express'
import { authenticate, authenticateDownload } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { signDownloadToken } from '../services/authService.js'
import { success } from '../utils/response.js'
import { buildAccountExport } from './users.js'

/**
 * The personal-data export as a file. The mobile app opens this in the
 * browser: sharing the whole export as message text fails on Android once
 * it passes the ~1 MB binder limit, and never gives the user a file.
 * Mounted at /api/users, ahead of the users router.
 */
const router = Router()

// Mint a short-lived, download-only token (5 min), so the session JWT never
// goes into a URL. The same pattern as agreement and passport PDFs.
router.post('/me/export-link', authenticate, asyncHandler(async (req, res) => {
  success(res, { token: signDownloadToken(req.user!.userId, req.user!.sessionVersion, req.user!.sid) })
}))

// Download-purpose token only (Bearer or ?token=); a session token is refused.
router.get('/me/export.json', authenticateDownload, asyncHandler(async (req, res) => {
  const data = await buildAccountExport(req.user!.userId)
  const day = new Date().toISOString().slice(0, 10)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="rentos-personal-data-${day}.json"`)
  res.send(JSON.stringify(data, null, 2))
}))

export default router
