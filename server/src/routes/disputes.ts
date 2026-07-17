import { Router } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { disputeController } from '../controllers/disputeController.js'

// Evidence may only be images/video/PDF. Extension comes from a whitelist, never
// from the user-supplied filename, and the stored name is crypto-random — so an
// .html/.svg upload can't become a same-origin stored-XSS URL.
const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'application/pdf': '.pdf',
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, file, cb) => cb(null, `evidence-${crypto.randomBytes(16).toString('hex')}${ALLOWED_MIME_TO_EXT[file.mimetype]}`),
})
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TO_EXT[file.mimetype]) {
      cb(null, true)
    } else {
      cb(new Error('Only images (jpeg/png/webp/gif), video (mp4/mov/webm) and PDF files are allowed as evidence'))
    }
  },
})

const router = Router()

router.get('/', authenticate, asyncHandler(disputeController.list))
router.get('/:id', authenticate, asyncHandler(disputeController.getById))
router.post('/', authenticate, asyncHandler(disputeController.create))
// Mediation actions (status, resolution, assignment) are mediator-only — a party
// must never be able to self-resolve a dispute filed against them.
router.patch('/:id/status', authenticate, requireRole('government', 'admin', 'super_admin', 'legal_officer'), asyncHandler(disputeController.updateStatus))
router.post('/:id/evidence', authenticate, upload.array('files', 5), asyncHandler(disputeController.uploadEvidence))

export default router
