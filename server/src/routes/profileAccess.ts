import { Router } from 'express'
import type { Types } from 'mongoose'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { ProfileAccess } from '../models/ProfileAccess.js'
import { notify } from '../services/notify.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

// Request access to a tenant's profile
router.post('/request', authenticate, asyncHandler(async (req, res) => {
  const roles = req.user!.roles
  if (!roles.includes('landlord') && !roles.includes('property_manager') && !roles.includes('government') && !roles.includes('admin') && !roles.includes('super_admin') && !roles.includes('legal_officer')) {
    error(res, 'Only landlords, managers, and government officials can request profile access', 403); return
  }

  const { tenantId, propertyId, message } = req.body
  if (!tenantId) { error(res, 'tenantId is required'); return }

  // Verify tenant exists
  const tenant = await User.findById(tenantId)
  if (!tenant) { error(res, 'Tenant not found', 404); return }

  // Prevent requesting access to your own profile
  if (req.user!.userId === tenantId) { error(res, 'Cannot request access to your own profile'); return }

  // Check for existing pending request
  const existing = await ProfileAccess.findOne({
    requesterId: req.user!.userId,
    tenantId,
    status: 'pending',
  })
  if (existing) { error(res, 'You already have a pending request for this tenant'); return }

  // A denied/revoked request can be re-asked by flipping it back to pending —
  // prevents notification-spam via unlimited fresh requests.
  const prior = await ProfileAccess.findOne({
    requesterId: req.user!.userId,
    tenantId,
    status: { $in: ['denied', 'revoked'] },
  })
  if (prior) {
    prior.status = 'pending'
    prior.requestedAt = new Date()
    prior.respondedAt = undefined
    if (message) prior.message = message
    await prior.save()

    notify({
      userId: tenantId,
      title: 'Profile Access Request',
      message: `Someone has re-requested access to view your tenant profile.${message ? ` Message: "${message}"` : ''}`,
      actionUrl: '/profile-access',
    }).catch((err) => console.warn('[profileAccess] notify failed:', (err as Error).message))

    success(res, { ...prior.toObject(), id: prior._id.toString() }, 'Access request sent', 201)
    return
  }

  const access = await ProfileAccess.create({
    requesterId: req.user!.userId,
    tenantId,
    propertyId: propertyId || undefined,
    status: 'pending',
    requestedAt: new Date(),
    message: message || undefined,
  })

  // Get requester name for notification
  const requester = await User.findById(req.user!.userId)
  const requesterName = requester ? `${requester.firstName} ${requester.lastName}` : 'Someone'

  // Notify the tenant
  notify({
    userId: tenantId,
    title: 'Profile Access Request',
    message: `${requesterName} has requested access to view your tenant profile.${message ? ` Message: "${message}"` : ''}`,
    actionUrl: '/profile-access',
  }).catch((err) => console.warn('[profileAccess] notify failed:', (err as Error).message))

  success(res, { ...access.toObject(), id: access._id.toString() }, 'Access request sent', 201)
}))

// List access requests
router.get('/requests', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const roles = req.user!.roles
  const isTenant = roles.includes('tenant')

  const isAdmin = roles.includes('admin') || roles.includes('super_admin')
  let requests
  if (isAdmin) {
    // Admins see all profile access requests
    requests = await ProfileAccess.find().sort({ requestedAt: -1 }).lean()
  } else if (isTenant) {
    // Tenant sees requests others have made to view their profile
    requests = await ProfileAccess.find({ tenantId: userId }).sort({ requestedAt: -1 }).lean()
  } else {
    // Landlords/managers/gov see their own outgoing requests
    requests = await ProfileAccess.find({ requesterId: userId }).sort({ requestedAt: -1 }).lean()
  }

  // Enrich with user names
  const userIds = [...new Set(requests.map((r) => isTenant ? r.requesterId : r.tenantId))]
  const users = await User.find({ _id: { $in: userIds } }).lean()
  const userMap = new Map(users.map((u) => [u._id.toString(), { firstName: u.firstName, lastName: u.lastName, email: u.email }]))

  const enriched = requests.map((r) => {
    const otherId = isTenant ? r.requesterId : r.tenantId
    const other = userMap.get(otherId)
    return {
      ...r,
      id: (r._id as Types.ObjectId).toString(),
      requesterName: isTenant && other ? `${other.firstName} ${other.lastName}` : undefined,
      requesterEmail: isTenant && other ? other.email : undefined,
      tenantName: !isTenant && other ? `${other.firstName} ${other.lastName}` : undefined,
      tenantEmail: !isTenant && other ? other.email : undefined,
    }
  })

  success(res, enriched)
}))

// Respond to an access request (approve/deny)
router.post('/:id/respond', authenticate, asyncHandler(async (req, res) => {
  const access = await ProfileAccess.findById(param(req.params.id))
  if (!access) { error(res, 'Request not found', 404); return }

  // Only the tenant can respond
  if (access.tenantId !== req.user!.userId) {
    error(res, 'Only the tenant can respond to this request', 403); return
  }

  if (access.status !== 'pending') {
    error(res, 'This request has already been responded to'); return
  }

  const { action } = req.body
  if (action !== 'approve' && action !== 'deny') {
    error(res, 'Action must be "approve" or "deny"'); return
  }

  access.status = action === 'approve' ? 'approved' : 'denied'
  access.respondedAt = new Date()
  await access.save()

  // Get tenant name for notification
  const tenant = await User.findById(req.user!.userId)
  const tenantName = tenant ? `${tenant.firstName} ${tenant.lastName}` : 'A tenant'

  // Notify the requester
  notify({
    userId: access.requesterId,
    title: action === 'approve' ? 'Profile Access Granted' : 'Profile Access Denied',
    message: action === 'approve'
      ? `${tenantName} has approved your request to view their profile.`
      : `${tenantName} has denied your request to view their profile.`,
    actionUrl: '/profile-access',
  }).catch((err) => console.warn('[profileAccess] notify failed:', (err as Error).message))

  success(res, { ...access.toObject(), id: access._id.toString() })
}))

// Revoke access
router.post('/:id/revoke', authenticate, asyncHandler(async (req, res) => {
  const access = await ProfileAccess.findById(param(req.params.id))
  if (!access) { error(res, 'Request not found', 404); return }

  // Only the tenant can revoke
  if (access.tenantId !== req.user!.userId) {
    error(res, 'Only the tenant can revoke access', 403); return
  }

  if (access.status !== 'approved') {
    error(res, 'Can only revoke approved access'); return
  }

  access.status = 'revoked'
  access.respondedAt = new Date()
  await access.save()

  // Get tenant name for notification
  const tenant = await User.findById(req.user!.userId)
  const tenantName = tenant ? `${tenant.firstName} ${tenant.lastName}` : 'A tenant'

  // Notify the requester
  notify({
    userId: access.requesterId,
    title: 'Profile Access Revoked',
    message: `${tenantName} has revoked your access to view their profile.`,
    actionUrl: '/profile-access',
  }).catch((err) => console.warn('[profileAccess] notify failed:', (err as Error).message))

  success(res, { ...access.toObject(), id: access._id.toString() })
}))

// Check if current user has access to a tenant's profile
router.get('/check/:tenantId', authenticate, asyncHandler(async (req, res) => {
  const tenantId = param(req.params.tenantId)

  // If checking your own profile, always has access
  if (req.user!.userId === tenantId) {
    success(res, { hasAccess: true, status: 'self' }); return
  }

  const access = await ProfileAccess.findOne({
    requesterId: req.user!.userId,
    tenantId,
    status: 'approved',
  })

  if (access) {
    success(res, { hasAccess: true, status: 'approved' })
  } else {
    // Check if there's a pending request
    const pending = await ProfileAccess.findOne({
      requesterId: req.user!.userId,
      tenantId,
      status: 'pending',
    })
    success(res, { hasAccess: false, status: pending ? 'pending' : 'none' })
  }
}))

export default router
