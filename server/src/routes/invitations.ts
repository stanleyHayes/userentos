import { Router } from 'express'
import type { Types } from 'mongoose'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { authenticate, requirePermission, isSuperAdmin } from '../middleware/auth.js'
import { Invitation, hashInviteToken } from '../models/Invitation.js'
import { User } from '../models/User.js'
import { Wallet } from '../models/Wallet.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { config } from '../config/index.js'
import { notifyWelcome } from '../services/notify.js'
import { buildInviteUrl, sendInvitationEmail } from '../services/email.js'
import { checkAndAward } from '../services/achievements.js'

const router = Router()

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Mail the invite link. Best-effort: a mail failure must not lose the
 * invitation, so the caller reports `emailSent` and falls back to the link.
 */
async function mailInvite(invitation: { email: string; roles: string[]; expiresAt: Date }, rawToken: string, invitedByName?: string) {
  try {
    return await sendInvitationEmail(invitation.email, {
      inviteUrl: buildInviteUrl(rawToken),
      roles: invitation.roles,
      invitedByName,
      expiresAt: invitation.expiresAt,
    })
  } catch (err) {
    console.error('[invitations] invite email failed:', (err as Error).message)
    return false
  }
}

/** Display name of the inviter, for the email body. */
async function inviterName(userId: string): Promise<string | undefined> {
  const user = await User.findById(userId).select('firstName lastName').lean()
  if (!user) return undefined
  return `${user.firstName} ${user.lastName}`.trim() || undefined
}

/** Delegation guard: you may only hand out access you hold yourself. */
function canDelegate(req: Parameters<typeof isSuperAdmin>[0], roles: string[], permissions: string[]): string | null {
  if (isSuperAdmin(req)) return null
  if (roles.includes('super_admin') || roles.includes('admin')) {
    return 'Only a super admin can delegate admin roles'
  }
  const held = new Set(req.user!.permissions)
  const escalated = permissions.filter((p) => !held.has(p))
  if (escalated.length) {
    return `You cannot grant permissions you do not hold: ${escalated.join(', ')}`
  }
  return null
}

/** Response shape — never leaks the stored token hash. */
function inviteView(invitation: { _id: unknown; email: string; roles: string[]; permissions: string[]; status: string; expiresAt: Date; createdAt?: Date }) {
  return {
    id: (invitation._id as Types.ObjectId).toString(),
    email: invitation.email,
    roles: invitation.roles,
    permissions: invitation.permissions,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  }
}

// List all invitations
router.get('/', authenticate, requirePermission('users:invite'), async (_req, res) => {
  const invitations = await Invitation.find().sort({ createdAt: -1 }).lean()
  success(res, invitations.map((inv) => inviteView(inv as unknown as Parameters<typeof inviteView>[0])))
})

// Send an invitation
router.post('/', authenticate, requirePermission('users:invite'), async (req, res) => {
  const { email, roles, permissions } = req.body

  if (!email || !roles?.length) {
    error(res, 'Email and at least one role are required')
    return
  }

  const delegationError = canDelegate(req, roles, permissions || [])
  if (delegationError) {
    error(res, delegationError, 403)
    return
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() })
  if (existingUser) {
    error(res, 'A user with this email already exists', 409)
    return
  }

  // Check for pending invitation
  const existingInvite = await Invitation.findOne({ email: email.toLowerCase(), status: 'pending' })
  if (existingInvite) {
    error(res, 'A pending invitation already exists for this email', 409)
    return
  }

  const rawToken = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)

  const invitation = await Invitation.create({
    email: email.toLowerCase(),
    roles,
    permissions: permissions || [],
    invitedBy: req.user!.userId,
    token: hashInviteToken(rawToken),
    expiresAt,
  })

  const emailSent = await mailInvite(invitation, rawToken, await inviterName(req.user!.userId))

  // The raw token also goes back to the inviter so they can share the link by
  // hand when mail bounces — safe because the delegation guard above means it
  // can only grant access the inviter already holds. This is the only moment
  // the raw token exists outside the invitee's inbox; only its hash is stored.
  success(res, {
    ...inviteView(invitation),
    inviteUrl: buildInviteUrl(rawToken),
    emailSent,
  }, emailSent ? 'Invitation emailed' : 'Invitation created — email could not be sent, share the link instead', 201)
})

/**
 * Public invite lookup — lets the accept screen show who and what the invite is
 * for before asking for a password. Returns only the invitee's own email and
 * the roles offered; the 256-bit token makes enumeration infeasible.
 */
router.get('/verify', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : ''
  if (!token) { error(res, 'Missing invitation token', 400); return }

  const invitation = await Invitation.findOne({ token: hashInviteToken(token), status: 'pending' }).lean()
  if (!invitation) { error(res, 'This invitation is invalid, already used, or was revoked', 404); return }

  if (invitation.expiresAt < new Date()) {
    await Invitation.updateOne({ _id: invitation._id }, { status: 'expired' })
    error(res, 'This invitation has expired', 410)
    return
  }

  success(res, {
    email: invitation.email,
    roles: invitation.roles,
    expiresAt: invitation.expiresAt,
  })
})

// Accept an invitation (public — no auth required)
router.post('/accept', async (req, res) => {
  const { token, firstName, lastName, phone, password } = req.body

  if (!token || !firstName || !lastName || !phone || !password) {
    error(res, 'Missing required fields')
    return
  }

  // Same password policy as registration
  if (
    password.length < 8 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    error(res, 'Password must be 8+ characters with upper, lower, number and special character')
    return
  }

  const invitation = await Invitation.findOne({ token: hashInviteToken(token), status: 'pending' })
  if (!invitation) {
    error(res, 'Invalid or expired invitation', 404)
    return
  }

  if (invitation.expiresAt < new Date()) {
    invitation.status = 'expired'
    await invitation.save()
    error(res, 'This invitation has expired', 410)
    return
  }

  // Check if user was created in the meantime
  const existing = await User.findOne({ email: invitation.email })
  if (existing) {
    invitation.status = 'accepted'
    await invitation.save()
    error(res, 'A user with this email already exists', 409)
    return
  }

  const passwordHash = await bcrypt.hash(password, config.bcryptRounds)
  const user = await User.create({
    email: invitation.email,
    phone,
    firstName,
    lastName,
    passwordHash,
    roles: invitation.roles,
    activeRole: invitation.roles[0],
    permissions: invitation.permissions,
    isVerified: true,
    invitedBy: invitation.invitedBy,
  })

  await Wallet.create({ userId: user._id.toString(), balance: 0, transactions: [] })
  notifyWelcome(user._id.toString(), firstName)

  // User is auto-verified via invitation flow — award profile_verified badge
  checkAndAward(user._id.toString(), 'profile_verified', {})
    .catch((err) => console.warn('[invitations/accept] achievement award failed:', err))

  invitation.status = 'accepted'
  invitation.acceptedAt = new Date()
  await invitation.save()

  success(res, (user as unknown as { toSafe(): unknown }).toSafe(), 'Invitation accepted — account created', 201)
})

// Revoke an invitation
router.post('/:id/revoke', authenticate, requirePermission('users:invite'), async (req, res) => {
  const invitation = await Invitation.findById(param(req.params.id))
  if (!invitation) { error(res, 'Invitation not found', 404); return }

  if (invitation.status !== 'pending') {
    error(res, `Cannot revoke a ${invitation.status} invitation`, 400)
    return
  }

  invitation.status = 'revoked'
  await invitation.save()

  success(res, null, 'Invitation revoked')
})

// Resend / regenerate an invitation
router.post('/:id/resend', authenticate, requirePermission('users:invite'), async (req, res) => {
  const invitation = await Invitation.findById(param(req.params.id))
  if (!invitation) { error(res, 'Invitation not found', 404); return }

  if (invitation.status !== 'pending' && invitation.status !== 'expired') {
    error(res, `Cannot resend a ${invitation.status} invitation`, 400)
    return
  }

  const rawToken = crypto.randomBytes(32).toString('hex')
  invitation.token = hashInviteToken(rawToken)
  invitation.expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  invitation.status = 'pending'
  await invitation.save()

  const emailSent = await mailInvite(invitation, rawToken, await inviterName(req.user!.userId))

  success(res, {
    ...inviteView(invitation),
    inviteUrl: buildInviteUrl(rawToken),
    emailSent,
  }, emailSent ? 'Invitation emailed' : 'Invitation regenerated — email could not be sent, share the link instead')
})

export default router
