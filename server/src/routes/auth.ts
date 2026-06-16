import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authController } from '../controllers/authController.js'
import { loginLimiter } from '../middleware/rateLimit.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.post('/register', asyncHandler(authController.register))
router.post('/login', loginLimiter, asyncHandler(authController.login))
router.post('/refresh', asyncHandler(authController.refresh))
router.post('/logout', asyncHandler(authController.logout))
router.post('/logout-all', authenticate, asyncHandler(authController.logoutAll))
router.post('/change-password', loginLimiter, authenticate, asyncHandler(authController.changePassword))
router.post('/forgot-password', loginLimiter, asyncHandler(authController.forgotPassword))
router.post('/reset-password', loginLimiter, asyncHandler(authController.resetPassword))

export default router
