import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authController } from '../controllers/authController.js'
import { loginLimiter, registerLimiter } from '../middleware/rateLimit.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.post('/register', registerLimiter, asyncHandler(authController.register))
router.post('/login', loginLimiter, asyncHandler(authController.login))
router.post('/refresh', loginLimiter, asyncHandler(authController.refresh))
router.post('/logout', asyncHandler(authController.logout))
router.post('/logout-all', authenticate, asyncHandler(authController.logoutAll))
router.post('/change-password', loginLimiter, authenticate, asyncHandler(authController.changePassword))
router.post('/forgot-password', loginLimiter, asyncHandler(authController.forgotPassword))
router.post('/reset-password', loginLimiter, asyncHandler(authController.resetPassword))

// MFA (TOTP two-factor authentication)
router.post('/login/mfa', loginLimiter, asyncHandler(authController.verifyMfaLogin))
router.post('/mfa/setup', authenticate, asyncHandler(authController.mfaSetup))
router.post('/mfa/enable', authenticate, asyncHandler(authController.mfaEnable))
router.post('/mfa/disable', authenticate, asyncHandler(authController.mfaDisable))

export default router
