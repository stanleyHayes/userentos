import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { savingsController } from '../controllers/savingsController.js'

const router = Router()

router.get('/wallet', authenticate, asyncHandler(savingsController.getWallet))
router.post('/wallet/deposit', authenticate, asyncHandler(savingsController.deposit))
router.post('/wallet/withdraw', authenticate, asyncHandler(savingsController.withdraw))
router.get('/plans', authenticate, asyncHandler(savingsController.listPlans))
router.post('/plans', authenticate, asyncHandler(savingsController.createPlan))
router.post('/plans/:id/contribute', authenticate, asyncHandler(savingsController.contribute))

export default router
