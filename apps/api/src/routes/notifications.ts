import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { notificationController } from '../controllers/notificationController.js'

const router = Router()

router.get('/', authenticate, asyncHandler(notificationController.list))
router.patch('/:id/read', authenticate, asyncHandler(notificationController.markRead))
router.patch('/read-all', authenticate, asyncHandler(notificationController.markAllRead))

export default router
