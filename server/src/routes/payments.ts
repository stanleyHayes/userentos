import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { paymentController } from '../controllers/paymentController.js'

const router = Router()

router.get('/', authenticate, asyncHandler(paymentController.list))
router.post('/', authenticate, asyncHandler(paymentController.create))
router.get('/:id', authenticate, asyncHandler(paymentController.getById))

export default router
