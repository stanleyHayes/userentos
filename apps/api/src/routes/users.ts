import { Favorite } from '../models/Favorite.js'
import { Notification } from '../models/Notification.js'
import { Achievement } from '../models/Achievement.js'
import { PaymentStreak } from '../models/PaymentStreak.js'
import { Investment } from '../models/Investment.js'
import { InsurancePolicy } from '../models/InsurancePolicy.js'
import { FinancingApplication } from '../models/FinancingApplication.js'
import { FinancingContract } from '../models/FinancingContract.js'
import { Loan } from '../models/Loan.js'
import { CreditScore } from '../models/CreditScore.js'
import { ApplePurchase } from '../models/ApplePurchase.js'
import { StorePurchase } from '../models/StorePurchase.js'
import { UserBlock } from '../models/UserBlock.js'
import { Router } from 'express'
import { Types } from 'mongoose'
import multer from 'multer'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { z } from 'zod'
import { authenticate, requireRole, requirePermission, isSuperAdmin } from '../middleware/auth.js'
import { User } from '../models/User.js'
import { Wallet } from '../models/Wallet.js'
import { WalletCredit } from '../models/WalletCredit.js'
import { Agreement } from '../models/Agreement.js'
import { Payment } from '../models/Payment.js'
import { Application } from '../models/Application.js'
import { Dispute } from '../models/Dispute.js'
import { Review } from '../models/Review.js'
import { Message } from '../models/Conversation.js'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { AuditLog } from '../models/AuditLog.js'
import { recordAudit } from '../utils/audit.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { success, error } from '../utils/response.js'
import { uploadAvatar, rememberLegacyAvatar } from '../services/avatarStorage.js'
import { config } from '../config/index.js'
import { notifyWelcome } from '../services/notify.js'
import { checkAndAward } from '../services/achievements.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { disconnectUser } from '../services/socket.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { escapeRegex } from '../utils/params.js'
import { normalizeGhanaCardId } from '../utils/ghanaCard.js'
import { decryptPii, PII_FIELDS } from '../utils/piiCrypto.js'
import { ownProfileView } from '../services/tenantProfileViews.js'
import { revokeAccountSessions } from '../services/sessionRevocation.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

router.get('/me', authenticate, async (req, res) => {
  const user = await User.findById(req.user!.userId)
  if (!user) { error(res, 'User not found', 404); return }
  success(res, (user as unknown as { toSafe(): Record<string, unknown> }).toSafe())
})

// Export the supported personal-data groups.
router.get('/me/export', authenticate, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
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
    blockedUsers,
    storePurchases,
    applePurchases,
    walletCredits,
    financingApplications,
    financingContracts,
    loans,
    creditScore,
    investments,
    insurancePolicies,
    favorites,
    notifications,
    achievements,
    paymentStreak,
  ] = await Promise.all([
    // Never export credential material — mfaSecret also carries schema-level
    // select:false, this is defense-in-depth.
    User.findById(userId).select('+storeAccountToken -passwordHash -mfaSecret -__v').lean(),
    TenantProfile.findOne({ userId }).lean(),
    Agreement.find({ $or: [{ tenantId: userId }, { landlordId: userId }] }).lean(),
    Payment.find({ $or: [{ tenantId: userId }, { landlordId: userId }] }).lean(),
    Application.find({ tenantId: userId }).lean(),
    Dispute.find({ $or: [{ filedBy: userId }, { filedAgainst: userId }] }).lean(),
    Review.find({ userId }).lean(),
    Message.find({ senderId: userId }).lean(),
    Wallet.findOne({ userId }).lean(),
    SavingsPlan.find({ userId }).lean(),
    AuditLog.find({ userId }).sort({ createdAt: -1, _id: -1 }).lean(),
    UserBlock.find({ blockerId: userId }).select('blockedId createdAt').lean(),
    StorePurchase.find({ userId }).select('platform applicationId providerState environment acknowledged voidedOrderIds startedAt verifiedAt entitlementState createdAt updatedAt items.productId items.basePlanId items.offerId items.expiresAt items.autoRenewing items.latestOrderId items.accessEligible').lean(),
    // Explicit public fields prevent recovery metadata and encrypted identifiers
    // from becoming export data when the purchase journal gains new fields.
    ApplePurchase.find({ userId }).select('applicationId environment productId subscriptionGroupId providerStatus purchasedAt originalPurchasedAt expiresAt verifiedAt revokedAt upgraded autoRenewing graceExpiresAt accessExpiresAt accessEligible entitlementState createdAt updatedAt').lean(),
    WalletCredit.find({ userId }).select('operationKey amount type reference state appliedAt createdAt updatedAt').lean(),
    // Personal export follows borrower identity, not privileged portfolio access.
    FinancingApplication.find({ applicantId: userId }).select('-__v').lean(),
    FinancingContract.find({ applicantId: userId }).select('-__v').lean(),
    Loan.find({ userId }).select('-__v').lean(),
    CreditScore.findOne({ userId }).select('-__v').lean(),
    Investment.find({ userId }).select('-__v').lean(),
    InsurancePolicy.find({ userId }).select('-__v').lean(),
    Favorite.find({ userId }).select('-__v').lean(),
    Notification.find({ userId }).select('-__v').lean(),
    Achievement.find({ userId }).select('-__v').lean(),
    PaymentStreak.findOne({ userId }).select('-__v').lean(),
  ])

  success(res, {
    exportedAt: new Date().toISOString(),
    walletCredits,
    financingApplications,
    financingContracts,
    loans,
    creditScore,
    investments,
    insurancePolicies,
    favorites,
    notifications,
    achievements,
    paymentStreak,
    storePurchases,
    applePurchases,
    // The subject's own export carries their national ID in the clear.
    user: user ? { ...user, ghanaCardId: decryptPii(user.ghanaCardId, PII_FIELDS.userGhanaCard), id: (user._id as Types.ObjectId).toString() } : null,
    tenantProfile: tenantProfile ? ownProfileView(tenantProfile) : null,
    agreements,
    payments,
    applications,
    disputes,
    reviews,
    messages,
    wallet,
    savingsPlans,
    auditLogs,
    blockedUsers,
  })
})

// Erase core identity now; scheduled cleanup removes related personal records after 30 days.
router.delete('/me', authenticate, async (req, res) => {
  const userId = req.user!.userId
  const user = await User.findById(userId)
  if (!user) { error(res, 'User not found', 404); return }

  await rememberLegacyAvatar(userId, user.profileImage)

  // Scramble PII
  const scramble = crypto.randomBytes(8).toString('hex')
  user.email = `deleted-${scramble}@userentos.com`
  user.phone = `000000${scramble.slice(0, 6)}`
  user.firstName = 'Deleted'
  user.lastName = 'User'
  user.passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), config.bcryptRounds)
  user.ghanaCardId = undefined
  user.profileImage = undefined
  user.mfaSecret = undefined
  user.markModified('mfaSecret')
  user.mfaEnabled = false
  user.deletedAt = new Date()
  await user.save()
  disconnectUser(userId)

  // Revoke all refresh tokens
  await RefreshToken.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date().toISOString(), revokedReason: 'gdpr_deletion' } },
  )

  await Promise.all([BiometricToken.deleteMany({ userId }), DeviceToken.deleteMany({ userId })])
  success(res, null, 'Account closed and core profile erased. Related personal records are scheduled for deletion after 30 days. Records needed for legal obligations or disputes may be retained. This action cannot be undone.')
})

const profilePatchSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60).optional(),
  lastName: z.string().trim().min(1, 'Last name is required').max(60).optional(),
  phone: z.string().trim().max(20).optional(),
  // '' or null clears the card on file; anything else must be a Ghana Card PIN.
  ghanaCardId: z.union([z.null(), z.string()]).optional()
    .refine((v) => v == null || v.trim() === '' || normalizeGhanaCardId(v) !== null, 'Ghana Card ID must look like GHA-123456789-0'),
  activeRole: z.string().max(40).optional(),
})

router.patch('/me', authenticate, async (req, res) => {
  const parsed = profilePatchSchema.safeParse(req.body ?? {})
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const user = await User.findById(req.user!.userId)
  if (!user) { error(res, 'User not found', 404); return }

  const { firstName, lastName, phone, ghanaCardId, activeRole } = parsed.data
  const cardOnFile = () => decryptPii(user.ghanaCardId, PII_FIELDS.userGhanaCard) ?? null
  const before = { firstName: user.firstName, lastName: user.lastName, ghanaCardId: cardOnFile() }
  if (firstName !== undefined) user.firstName = firstName
  if (lastName !== undefined) user.lastName = lastName
  if (phone) user.phone = phone
  if (ghanaCardId !== undefined) user.ghanaCardId = ghanaCardId && ghanaCardId.trim() ? normalizeGhanaCardId(ghanaCardId)! : undefined
  if (activeRole && user.roles.includes(activeRole)) user.activeRole = activeRole

  // Verification attests to a specific name + Ghana Card. Changing either
  // after approval must not keep the badge (or a pending review) attached
  // to an identity that was never checked.
  const identityChanged = before.firstName !== user.firstName || before.lastName !== user.lastName || before.ghanaCardId !== cardOnFile()
  if (identityChanged && (user.isVerified || user.verificationStatus !== 'none')) {
    user.isVerified = false
    user.verificationStatus = 'none'
  }
  await user.save()

  success(res, (user as unknown as { toSafe(): Record<string, unknown> }).toSafe())
})

// Upload profile photo
router.post('/me/photo', authenticate, upload.single('photo'), async (req, res) => {
  if (!req.file) { error(res, 'No file uploaded'); return }
  if (!req.file.mimetype.startsWith('image/')) { error(res, 'Only image files are allowed'); return }

  const user = await User.findById(req.user!.userId)
  if (!user) { error(res, 'User not found', 404); return }
  await rememberLegacyAvatar(req.user!.userId, user.profileImage)
  const uploaded = await uploadAvatar(req.user!.userId, req.file.buffer)
  // An upload must not resurrect the profile of an account deleted mid-request.
  const updated = await User.findOneAndUpdate(
    { _id: req.user!.userId, deletedAt: { $exists: false } },
    { $set: { profileImage: uploaded.url } },
  )
  if (!updated) { error(res, 'Account no longer available', 404); return }

  success(res, { profileImage: uploaded.url }, 'Profile photo updated')
})

// Staff directory — privileged roles only; previously any authenticated user
// could enumerate government/admin/legal accounts.
router.get('/government', authenticate, requireRole('government', 'admin', 'super_admin', 'legal_officer'), async (_req, res) => {
  const users = await User.find({ roles: { $in: ['government', 'admin', 'super_admin', 'legal_officer'] } })
    .select('firstName lastName')
    .lean()
  const items = users.map((u) => ({ id: (u._id as Types.ObjectId).toString(), firstName: u.firstName, lastName: u.lastName }))
  success(res, items)
})

// Get user info by ID. Sensitive fields (email, phone, roles, permissions) are
// only returned for one's own record or to privileged staff — otherwise any
// authenticated user could enumerate every account's PII by iterating ObjectIds.
// Admin/government: list pending identity-verification requests.
// NOTE: must precede GET /:id or 'verification-requests' is treated as an id.
router.get('/verification-requests', authenticate, requireRole('government', 'admin', 'super_admin'), async (_req, res) => {
  const users = await User.find({ verificationStatus: 'pending', deletedAt: null })
    .select('firstName lastName email phone ghanaCardId roles createdAt')
    .sort({ createdAt: 1 })
    .limit(100)
    .lean()
  // Reviewers must compare the card itself, so this staff-only queue decrypts it.
  success(res, { items: users.map((u) => ({ ...u, ghanaCardId: decryptPii(u.ghanaCardId, PII_FIELDS.userGhanaCard), id: (u._id as unknown as { toString(): string }).toString() })) })
})

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

// List all users (admin panel) — paginated
router.get('/', authenticate, requireRole('government', 'admin', 'super_admin', 'legal_officer'), async (req, res) => {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.pageSize) || 20)))
  const skip = (page - 1) * pageSize

  /*
   * Search and role filtering happen HERE, not in the browser.
   *
   * The admin page fetched page one (20 rows) and filtered that in JavaScript,
   * so on a 102-user database 82 users were invisible AND unsearchable — the
   * search box silently only ever searched the 20 most recent accounts.
   */
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const role = typeof req.query.role === 'string' ? req.query.role.trim() : ''

  const filter: Record<string, unknown> = {}
  if (search) {
    const safe = escapeRegex(search)
    filter.$or = [
      { firstName: new RegExp(safe, 'i') },
      { lastName: new RegExp(safe, 'i') },
      { email: new RegExp(safe, 'i') },
    ]
  }
  if (role) filter.roles = role

  const [total, users] = await Promise.all([
    // countDocuments doesn't fire the pre(/^find/) soft-delete hook — filter explicitly
    User.countDocuments({ ...filter, deletedAt: { $exists: false } }),
    /*
     * _id is the tiebreaker, and it is not optional.
     *
     * createdAt alone is not a total order — bulk-created users share a
     * timestamp to the millisecond — and MongoDB is free to order ties
     * differently per query. With .skip() that means a row can appear on two
     * pages while another is never returned at all. Observed directly: pages 1
     * and 2 both contained the same two accounts. _id is unique, so appending
     * it makes the order total and the paging exact.
     */
    // National IDs stay out of the directory; the verification queue is the one place staff see them.
    User.find(filter).select('-passwordHash -__v -ghanaCardId').sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean(),
  ])
  const items = users.map((u) => ({ ...u, id: (u._id as Types.ObjectId).toString() }))
  success(res, { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
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

  // Delegation guard (same rule as PATCH /:id/permissions): a non-super_admin
  // may only grant roles they themselves hold — never super_admin/admin — and
  // may never grant permissions they do not hold. Blocks vertical privilege
  // escalation via user creation.
  if (!isSuperAdmin(req)) {
    const callerRoles = req.user!.roles ?? []
    const callerPerms = req.user!.permissions ?? []

    if (!Array.isArray(roles)) { error(res, 'roles must be an array'); return }
    const forbiddenRoles = roles.filter((r: string) => r === 'super_admin' || r === 'admin' || !callerRoles.includes(r))
    if (forbiddenRoles.length) {
      error(res, `You cannot grant the following role(s): ${forbiddenRoles.join(', ')}`, 403)
      return
    }
    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) { error(res, 'permissions must be an array'); return }
      const forbiddenPerms = permissions.filter((p: string) => !callerPerms.includes(p))
      if (forbiddenPerms.length) {
        error(res, `You cannot grant permission(s) you do not hold: ${forbiddenPerms.join(', ')}`, 403)
        return
      }
    }
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
  void notifyWelcome(user._id.toString(), firstName)

  // Pre-verified by admin — award profile_verified badge
  checkAndAward(user._id.toString(), 'profile_verified', {})
    .catch((err) => console.warn('[users/create] achievement award failed:', err))

  success(res, (user as unknown as { toSafe(): Record<string, unknown> }).toSafe(), 'User created successfully', 201)
})

// Request identity verification — user must have a Ghana Card on file first.
router.post('/me/request-verification', authenticate, async (req, res) => {
  const user = await User.findById(req.user!.userId)
  if (!user) { error(res, 'User not found', 404); return }
  if (!user.ghanaCardId) { error(res, 'Add your Ghana Card ID to your profile first', 400); return }
  if (user.verificationStatus === 'verified' || user.isVerified) { error(res, 'Already verified', 409); return }
  if (user.verificationStatus === 'pending') { error(res, 'Verification already requested', 409); return }

  user.verificationStatus = 'pending'
  await user.save()
  success(res, { verificationStatus: 'pending' }, 'Verification requested — our team will review your Ghana Card')
})

router.patch('/me/tax-reporting-consent', authenticate, requireRole('landlord'), async (req, res) => {
  const parsed = z.object({ consent: z.boolean() }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  await User.findByIdAndUpdate(req.user!.userId, { taxReportingConsent: parsed.data.consent })
  success(res, { taxReportingConsent: parsed.data.consent }, 'Tax reporting preference updated')
})

// Admin/government: approve identity verification → the verified badge shows
router.post('/:id/verify-identity', authenticate, requireRole('government', 'admin', 'super_admin'), async (req, res) => {
  const user = await User.findById(req.params.id)
  if (!user) { error(res, 'User not found', 404); return }
  if (user.verificationStatus !== 'pending') { error(res, 'No pending verification for this user', 409); return }

  user.verificationStatus = 'verified'
  user.isVerified = true
  await user.save()
  await recordAudit(req, 'users.verify_identity', 'User', user._id.toString())
  success(res, { verificationStatus: 'verified', isVerified: true }, 'User verified')
})

// Admin/government: reject a verification request
router.post('/:id/reject-verification', authenticate, requireRole('government', 'admin', 'super_admin'), async (req, res) => {
  const user = await User.findById(req.params.id)
  if (!user) { error(res, 'User not found', 404); return }
  if (user.verificationStatus !== 'pending') { error(res, 'No pending verification for this user', 409); return }

  user.verificationStatus = 'none'
  await user.save()
  await recordAudit(req, 'users.reject_verification', 'User', user._id.toString(), { reason: req.body?.reason })
  success(res, { verificationStatus: 'none' }, 'Verification rejected')
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

  const before = JSON.stringify({ roles: [...user.roles].sort(), permissions: [...(user.permissions ?? [])].sort() })
  if (permissions !== undefined) user.permissions = permissions
  if (roles !== undefined) {
    user.roles = roles
    if (!roles.includes(user.activeRole)) user.activeRole = roles[0]
  }
  await user.save()
  // Roles/permissions ride inside access tokens — revoke every session so a
  // demoted account cannot keep acting on its old claims until expiry.
  if (JSON.stringify({ roles: [...user.roles].sort(), permissions: [...(user.permissions ?? [])].sort() }) !== before) {
    await revokeAccountSessions(user._id.toString(), 'permissions_changed')
  }

  // Audit trail for this privileged action.
  await AuditLog.create({
    userId: req.user!.userId,
    action: 'users.permissions.update',
    entityType: 'User',
    entityId: user._id.toString(),
    details: JSON.stringify({ roles: user.roles, permissions: user.permissions }),
    ipAddress: req.ip,
  }).catch((err) => console.warn('[users/permissions] audit log failed:', (err as Error).message))

  const { ghanaCardId: _card, ...safe } = (user as unknown as { toSafe(): Record<string, unknown> }).toSafe()
  success(res, safe, 'Permissions updated')
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
