import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { badgeController } from '../controllers/badgeController.js'

const router = Router()

router.get('/', authenticate, asyncHandler(badgeController.counts))

export default router
