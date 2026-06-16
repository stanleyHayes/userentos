import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { disputeController } from '../controllers/disputeController.js'

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, file, cb) => cb(null, `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`),
})
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } })

const router = Router()

router.get('/', authenticate, asyncHandler(disputeController.list))
router.get('/:id', authenticate, asyncHandler(disputeController.getById))
router.post('/', authenticate, asyncHandler(disputeController.create))
// Mediation actions (status, resolution, assignment) are mediator-only — a party
// must never be able to self-resolve a dispute filed against them.
router.patch('/:id/status', authenticate, requireRole('government', 'admin', 'super_admin', 'legal_officer'), asyncHandler(disputeController.updateStatus))
router.post('/:id/evidence', authenticate, upload.array('files', 5), asyncHandler(disputeController.uploadEvidence))

export default router
