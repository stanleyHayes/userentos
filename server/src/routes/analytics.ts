import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { analyticsController } from '../controllers/analyticsController.js'

const router = Router()

router.get('/me', authenticate, asyncHandler(analyticsController.me))
router.get('/platform', authenticate, requireRole('government', 'admin', 'legal_officer'), asyncHandler(analyticsController.platform))

export default router
