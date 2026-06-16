import { Router } from 'express'
import type { Types } from 'mongoose'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { authenticate, requirePermission, isSuperAdmin } from '../middleware/auth.js'
import { Invitation } from '../models/Invitation.js'
import { User } from '../models/User.js'
import { Wallet } from '../models/Wallet.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { config } from '../config/index.js'
import { notifyWelcome } from '../services/notify.js'
import { checkAndAward } from '../services/achievements.js'

const router = Router()

// List all invitations
router.get('/', authenticate, requirePermission('users:invite'), async (_req, res) => {
  const invitations = await Invitation.find().sort({ createdAt: -1 }).lean()
  const items = invitations.map((inv) => ({ ...inv, id: (inv._id as Types.ObjectId).toString() }))
  success(res, items)
})

// Send an invitation
router.post('/', authenticate, requirePermission('users:invite'), async (req, res) => {
  const { email, roles, permissions } = req.body

  if (!email || !roles?.length) {
    error(res, 'Email and at least one role are required')
    return
  }

  // Cannot invite as super_admin unless you are one
  if (roles.includes('super_admin') && !isSuperAdmin(req)) {
    error(res, 'Only a super admin can invite another super admin', 403)
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

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const invitation = await Invitation.create({
    email: email.toLowerCase(),
    roles,
    permissions: permissions || [],
    invitedBy: req.user!.userId,
    token,
    expiresAt,
  })

  // In production, send an email with the invitation link
  // For now, return the token directly
  success(res, {
    ...(invitation as unknown as { toObject(): Record<string, unknown> }).toObject(),
    id: invitation._id.toString(),
    inviteUrl: `/register?invite=${token}`,
  }, 'Invitation sent', 201)
})

// Accept an invitation (public — no auth required)
router.post('/accept', async (req, res) => {
  const { token, firstName, lastName, phone, password } = req.body

  if (!token || !firstName || !lastName || !phone || !password) {
    error(res, 'Missing required fields')
    return
  }

  const invitation = await Invitation.findOne({ token, status: 'pending' })
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

  invitation.token = crypto.randomBytes(32).toString('hex')
  invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  invitation.status = 'pending'
  await invitation.save()

  success(res, {
    ...(invitation as unknown as { toObject(): Record<string, unknown> }).toObject(),
    id: invitation._id.toString(),
    inviteUrl: `/register?invite=${invitation.token}`,
  }, 'Invitation resent')
})

export default router
