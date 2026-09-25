import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import { unlink } from 'node:fs/promises'
import { Types } from 'mongoose'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { disputeController } from '../controllers/disputeController.js'
import { Dispute } from '../models/Dispute.js'
import { error } from '../utils/response.js'
import { param } from '../utils/params.js'

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

// Authorize before multer touches the disk — otherwise any signed-in user
// could write 5×10MB per request against any (or a nonexistent) dispute id.
async function authorizeEvidenceUpload(req: Request, res: Response, next: NextFunction) {
  const id = param(req.params.id)
  const dispute = Types.ObjectId.isValid(id) ? await Dispute.findById(id).select('filedBy filedAgainst').lean() : null
  if (!dispute) { error(res, 'Dispute not found', 404); return }
  const userId = req.user!.userId
  if (dispute.filedBy !== userId && dispute.filedAgainst !== userId) { error(res, 'Not a party to this dispute', 403); return }
  next()
}

// Files stored for a request that still fails (validation, save error) are
// orphans nobody can reference — delete them once the response is sent.
function discardFilesOnFailure(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {
    if (res.statusCode < 400) return
    for (const file of (req.files as Express.Multer.File[] | undefined) ?? []) unlink(file.path).catch(() => {})
  })
  next()
}

const router = Router()

router.get('/', authenticate, asyncHandler(disputeController.list))
router.get('/:id', authenticate, asyncHandler(disputeController.getById))
router.post('/', authenticate, asyncHandler(disputeController.create))
// Mediation actions (status, resolution, assignment) are mediator-only — a party
// must never be able to self-resolve a dispute filed against them.
router.patch('/:id/status', authenticate, requireRole('government', 'admin', 'super_admin', 'legal_officer'), asyncHandler(disputeController.updateStatus))
router.post('/:id/evidence', authenticate, asyncHandler(authorizeEvidenceUpload), discardFilesOnFailure, upload.array('files', 5), asyncHandler(disputeController.uploadEvidence))

export default router
