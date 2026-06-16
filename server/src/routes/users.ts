import { Router } from 'express'
import { Types } from 'mongoose'
import multer from 'multer'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { authenticate, requireRole, requirePermission, isSuperAdmin } from '../middleware/auth.js'
import { User } from '../models/User.js'
import { Wallet } from '../models/Wallet.js'
import { Agreement } from '../models/Agreement.js'
import { Payment } from '../models/Payment.js'
import { Application } from '../models/Application.js'
import { Dispute } from '../models/Dispute.js'
import { Review } from '../models/Review.js'
import { Message } from '../models/Conversation.js'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { AuditLog } from '../models/AuditLog.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { success, error } from '../utils/response.js'
import { uploadToCloudinary } from '../utils/cloudinary.js'
import { config } from '../config/index.js'
import { notifyWelcome } from '../services/notify.js'
import { checkAndAward } from '../services/achievements.js'
import { RefreshToken } from '../models/RefreshToken.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

router.get('/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user!.userId)
  if (!user) { error(res, 'User not found', 404); return }
  success(res, (user as unknown as { toSafe(): Record<string, unknown> }).toSafe())
})

// GDPR: export all personal data
router.get('/me/export', authenticate, async (req, res) => {
  const userId = req.user!.userId
  const [
    user,
    tenantProfile,
    agreements,
    payments,
    applications,
    disputes,
    reviews,
    messages,
    wallet,
    savingsPlans,
    auditLogs,
  ] = await Promise.all([
    User.findById(userId).select('-passwordHash -__v').lean(),
    TenantProfile.findOne({ userId }).lean(),
    Agreement.find({ $or: [{ tenantId: userId }, { landlordId: userId }] }).lean(),
    Payment.find({ $or: [{ tenantId: userId }, { landlordId: userId }] }).lean(),
    Application.find({ tenantId: userId }).lean(),
    Dispute.find({ $or: [{ filedBy: userId }, { filedAgainst: userId }] }).lean(),
    Review.find({ userId }).lean(),
    Message.find({ senderId: userId }).lean(),
    Wallet.findOne({ userId }).lean(),
    SavingsPlan.find({ userId }).lean(),
    AuditLog.find({ userId }).sort({ createdAt: -1 }).limit(1000).lean(),
  ])

  success(res, {
    exportedAt: new Date().toISOString(),
    user: user ? { ...user, id: (user._id as Types.ObjectId).toString() } : null,
    tenantProfile,
    agreements,
    payments,
    applications,
    disputes,
    reviews,
    messages,
    wallet,
    savingsPlans,
    auditLogs,
  })
})

// GDPR: soft delete (30-day grace period)
router.delete('/me', authenticate, async (req, res) => {
  const userId = req.user!.userId
  const user = await User.findById(userId)
  if (!user) { error(res, 'User not found', 404); return }

  // Scramble PII
  const scramble = crypto.randomBytes(8).toString('hex')
  user.email = `deleted-${scramble}@rentos.gh`
  user.phone = `000000${scramble.slice(0, 6)}`
  user.firstName = 'Deleted'
  user.lastName = 'User'
  user.passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), config.bcryptRounds)
  user.ghanaCardId = undefined
  user.profileImage = undefined
  user.deletedAt = new Date()
  await user.save()

  // Revoke all refresh tokens
  await RefreshToken.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date().toISOString(), revokedReason: 'gdpr_deletion' } },
  )

  success(res, null, 'Account scheduled for deletion. You have 30 days to contact support to restore it.')
})

router.patch('/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user!.userId)
  if (!user) { error(res, 'User not found', 404); return }

  const { firstName, lastName, phone, ghanaCardId, activeRole } = req.body
  if (firstName) user.firstName = firstName
  if (lastName) user.lastName = lastName
  if (phone) user.phone = phone
  if (ghanaCardId) user.ghanaCardId = ghanaCardId
  if (activeRole && user.roles.includes(activeRole)) user.activeRole = activeRole
  await user.save()

  success(res, (user as unknown as { toSafe(): Record<string, unknown> }).toSafe())
})

// Upload profile photo
router.post('/me/photo', authenticate, upload.single('photo'), async (req, res) => {
  if (!req.file) { error(res, 'No file uploaded'); return }
  if (!req.file.mimetype.startsWith('image/')) { error(res, 'Only image files are allowed'); return }

  const uploaded = await uploadToCloudinary(req.file.buffer, {
    folder: 'avatars',
    resourceType: 'image',
  })

  const user = await User.findById(req.user!.userId)
  if (!user) { error(res, 'User not found', 404); return }

  user.profileImage = uploaded.url
  await user.save()

  success(res, { profileImage: uploaded.url }, 'Profile photo updated')
})

router.get('/government', authenticate, async (_req, res) => {
  const users = await User.find({ roles: { $in: ['government', 'admin', 'super_admin', 'legal_officer'] } })
    .select('firstName lastName')
    .lean()
  const items = users.map((u) => ({ id: (u._id as Types.ObjectId).toString(), firstName: u.firstName, lastName: u.lastName }))
  success(res, items)
})

// Get user info by ID. Sensitive fields (email, phone, roles, permissions) are
// only returned for one's own record or to privileged staff — otherwise any
// authenticated user could enumerate every account's PII by iterating ObjectIds.
router.get('/:id', authenticate, async (req, res) => {
  const isSelf = req.params.id === req.user!.userId
  const isPrivileged = req.user!.roles.some((r) => ['government', 'admin', 'super_admin', 'legal_officer'].includes(r))
  const fields = isSelf || isPrivileged
    ? 'firstName lastName email phone profileImage isVerified activeRole roles permissions'
    : 'firstName lastName profileImage isVerified activeRole'
  const user = await User.findById(req.params.id).select(fields).lean()
  if (!user) { error(res, 'User not found', 404); return }
  success(res, { ...user, id: (user._id as Types.ObjectId).toString() })
})

// List all users (admin panel)
router.get('/', authenticate, requireRole('government', 'admin', 'super_admin', 'legal_officer'), async (_req, res) => {
  const users = await User.find().select('-passwordHash -__v').lean()
  const items = users.map((u) => ({ ...u, id: (u._id as Types.ObjectId).toString() }))
  success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
})

// Create a new user (admin action)
router.post('/', authenticate, requirePermission('users:create'), async (req, res) => {
  const { email, phone, password, firstName, lastName, roles, permissions } = req.body

  if (!email || !phone || !password || !firstName || !lastName || !roles?.length) {
    error(res, 'Missing required fields: email, phone, password, firstName, lastName, roles')
    return
  }

  const existing = await User.findOne({ email: email.toLowerCase() })
  if (existing) {
    error(res, 'A user with this email already exists', 409)
    return
  }

  // Non-super_admin cannot create super_admin users
  if (roles.includes('super_admin') && !req.user!.roles.includes('super_admin')) {
    error(res, 'Only a super admin can create another super admin', 403)
    return
  }

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds)
  const user = await User.create({
    email: email.toLowerCase(),
    phone,
    firstName,
    lastName,
    passwordHash,
    roles,
    activeRole: roles[0],
    permissions: permissions || [],
    isVerified: true, // admin-created users are pre-verified
  })

  await Wallet.create({ userId: user._id.toString(), balance: 0, transactions: [] })
  notifyWelcome(user._id.toString(), firstName)

  // Pre-verified by admin — award profile_verified badge
  checkAndAward(user._id.toString(), 'profile_verified', {})
    .catch((err) => console.warn('[users/create] achievement award failed:', err))

  success(res, (user as unknown as { toSafe(): Record<string, unknown> }).toSafe(), 'User created successfully', 201)
})

// Update a user's roles and permissions
router.patch('/:id/permissions', authenticate, requirePermission('users:manage_permissions'), async (req, res) => {
  const { permissions, roles } = req.body
  const callerIsSuper = isSuperAdmin(req)
  const user = await User.findById(req.params.id)
  if (!user) { error(res, 'User not found', 404); return }

  // Prevent self-escalation: a non-super_admin cannot edit their own roles/permissions.
  if (user._id.toString() === req.user!.userId && !callerIsSuper) {
    error(res, 'You cannot modify your own roles or permissions', 403)
    return
  }

  // Protect super_admin — only another super_admin can modify
  if (user.roles.includes('super_admin') && !callerIsSuper) {
    error(res, 'Only a super admin can modify another super admin', 403)
    return
  }

  // Delegation guard: a non-super_admin may only assign roles/permissions they
  // themselves hold, and may never grant the highly-privileged super_admin/admin
  // roles. This blocks vertical privilege escalation via this endpoint.
  if (!callerIsSuper) {
    const callerRoles = req.user!.roles ?? []
    const callerPerms = req.user!.permissions ?? []

    if (roles !== undefined) {
      if (!Array.isArray(roles)) { error(res, 'roles must be an array'); return }
      const forbidden = roles.filter((r: string) => r === 'super_admin' || r === 'admin' || !callerRoles.includes(r))
      if (forbidden.length) {
        error(res, `You cannot grant the following role(s): ${forbidden.join(', ')}`, 403)
        return
      }
    }
    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) { error(res, 'permissions must be an array'); return }
      const forbidden = permissions.filter((p: string) => !callerPerms.includes(p))
      if (forbidden.length) {
        error(res, `You cannot grant permission(s) you do not hold: ${forbidden.join(', ')}`, 403)
        return
      }
    }
  }

  if (permissions !== undefined) user.permissions = permissions
  if (roles !== undefined) {
    user.roles = roles
    if (!roles.includes(user.activeRole)) user.activeRole = roles[0]
  }
  await user.save()

  // Audit trail for this privileged action.
  await AuditLog.create({
    userId: req.user!.userId,
    action: 'users.permissions.update',
    entityType: 'User',
    entityId: user._id.toString(),
    details: JSON.stringify({ roles: user.roles, permissions: user.permissions }),
    ipAddress: req.ip,
  }).catch((err) => console.warn('[users/permissions] audit log failed:', (err as Error).message))

  success(res, (user as unknown as { toSafe(): Record<string, unknown> }).toSafe(), 'Permissions updated')
})

// Delete a user
router.delete('/:id', authenticate, requirePermission('users:delete'), async (req, res) => {
  const user = await User.findById(req.params.id)
  if (!user) { error(res, 'User not found', 404); return }

  if (user.roles.includes('super_admin')) {
    error(res, 'Cannot delete a super admin', 403)
    return
  }

  if (user._id.toString() === req.user!.userId) {
    error(res, 'Cannot delete yourself', 400)
    return
  }

  await User.findByIdAndDelete(req.params.id)
  success(res, null, 'User deleted')
})

export default router
