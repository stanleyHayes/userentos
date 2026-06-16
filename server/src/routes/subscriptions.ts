import { Router } from 'express'
import { authenticate, requireRole, requirePermission } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { subscriptionController } from '../controllers/subscriptionController.js'

const router = Router()

// Public: list active packages
router.get('/packages', asyncHandler(subscriptionController.list))

// Admin: list all packages (including inactive)
router.get('/packages/all', authenticate, requireRole('admin', 'super_admin'), asyncHandler(subscriptionController.listAll))

// Get single package
router.get('/packages/:id', asyncHandler(subscriptionController.getById))

// Admin: CRUD
router.post('/packages', authenticate, requirePermission('subscriptions:manage'), asyncHandler(subscriptionController.create))
router.patch('/packages/:id', authenticate, requirePermission('subscriptions:manage'), asyncHandler(subscriptionController.update))
router.delete('/packages/:id', authenticate, requirePermission('subscriptions:manage'), asyncHandler(subscriptionController.delete))

// Landlord/Manager: subscription management
router.get('/my-subscription', authenticate, asyncHandler(subscriptionController.mySubscription))
router.post('/subscribe', authenticate, asyncHandler(subscriptionController.subscribe))

// Admin: assign package to user
router.post('/assign', authenticate, requirePermission('subscriptions:manage'), asyncHandler(subscriptionController.assignPackage))

export default router
