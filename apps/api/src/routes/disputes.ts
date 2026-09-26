import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { Types } from 'mongoose'
import { authenticate, authenticateDownload, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { disputeController, canReadDispute } from '../controllers/disputeController.js'
import { Dispute } from '../models/Dispute.js'
import { DocumentModel } from '../models/Document.js'
import { User } from '../models/User.js'
import { error, success } from '../utils/response.js'
import { param } from '../utils/params.js'
import { signDownloadToken } from '../services/authService.js'
import { signedDownloadUrl } from '../utils/cloudinary.js'

// Evidence may only be images/video/PDF. Files are held in memory and stored
// with the file host as 'authenticated' (no public URL); the user-supplied
// filename never becomes part of a URL.
export const EVIDENCE_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/pdf',
])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (EVIDENCE_MIME_TYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      // Tagged 400 so the error handler reports the reason, not a 500.
      cb(Object.assign(new Error('Only images (jpeg/png/webp/gif), video (mp4/mov/webm) and PDF files are allowed as evidence'), { status: 400 }))
    }
  },
})

// Authorize before multer reads the body — otherwise any signed-in user
// could push 5×10MB per request against any (or a nonexistent) dispute id.
async function authorizeEvidenceUpload(req: Request, res: Response, next: NextFunction) {
  const id = param(req.params.id)
  const dispute = Types.ObjectId.isValid(id) ? await Dispute.findById(id).select('filedBy filedAgainst').lean() : null
  if (!dispute) { error(res, 'Dispute not found', 404); return }
  const userId = req.user!.userId
  if (dispute.filedBy !== userId && dispute.filedAgainst !== userId) { error(res, 'Not a party to this dispute', 403); return }
  next()
}

/** The evidence document, if the viewer may read the dispute it belongs to. */
async function readableEvidence(disputeId: string, documentId: string, userId: string, roles: string[]) {
  if (!Types.ObjectId.isValid(disputeId) || !Types.ObjectId.isValid(documentId)) return { status: 404 as const }
  const dispute = await Dispute.findById(disputeId).select('filedBy filedAgainst assignedTo').lean()
  if (!dispute) return { status: 404 as const }
  if (!canReadDispute(dispute, userId, roles)) return { status: 403 as const }
  const doc = await DocumentModel.findOne({ _id: documentId, type: 'evidence', linkedEntityType: 'dispute', linkedEntityId: disputeId }).lean()
  if (!doc?.storagePublicId) return { status: 404 as const }
  return { status: 200 as const, doc }
}

const router = Router()

router.get('/', authenticate, asyncHandler(disputeController.list))
router.get('/:id', authenticate, asyncHandler(disputeController.getById))
router.post('/', authenticate, asyncHandler(disputeController.create))
// Mediation actions (status, resolution, assignment) are mediator-only — a party
// must never be able to self-resolve a dispute filed against them.
router.patch('/:id/status', authenticate, requireRole('government', 'admin', 'super_admin', 'legal_officer'), asyncHandler(disputeController.updateStatus))
router.post('/:id/evidence', authenticate, asyncHandler(authorizeEvidenceUpload), upload.array('files', 5), asyncHandler(disputeController.uploadEvidence))

// POST /disputes/:id/evidence/:documentId/link — a 5-minute download-only
// token for one evidence file, for the parties and mediators. The session
// token never goes into a URL.
router.post('/:id/evidence/:documentId/link', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const found = await readableEvidence(param(req.params.id), param(req.params.documentId), req.user!.userId, req.user!.roles)
  if (found.status !== 200) { error(res, found.status === 403 ? 'Not authorized to view this dispute' : 'Evidence not found', found.status); return }
  success(res, { token: signDownloadToken('dispute-evidence', req.user!.userId, req.user!.sessionVersion, req.user!.sid) })
}))

// GET /disputes/:id/evidence/:documentId — the file itself, via a signed link
// that expires in a minute. Download tokens carry no roles, so the viewer's
// current roles are read from the account.
router.get('/:id/evidence/:documentId', authenticateDownload('dispute-evidence'), asyncHandler(async (req: Request, res: Response) => {
  const viewer = await User.findById(req.user!.userId).select('roles').lean()
  const found = await readableEvidence(param(req.params.id), param(req.params.documentId), req.user!.userId, viewer?.roles ?? [])
  if (found.status !== 200) { error(res, found.status === 403 ? 'Not authorized to view this dispute' : 'Evidence not found', found.status); return }
  const { doc } = found
  res.setHeader('Cache-Control', 'no-store')
  res.redirect(302, signedDownloadUrl(doc.storagePublicId!, doc.storageFormat ?? '', doc.storageResourceType ?? 'image'))
}))

export default router
