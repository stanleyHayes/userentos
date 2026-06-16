import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { Agreement } from '../models/Agreement.js'
import { Property } from '../models/Property.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { User } from '../models/User.js'
import { notifyAgreementSigned, notifyAgreementFullySigned } from '../services/notify.js'
import { checkAndAward } from '../services/achievements.js'
import { dispatchWebhook } from '../services/webhooks.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const createAgreementSchema = z.object({
  propertyId: z.string(),
  tenantId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  rentAmount: z.number().positive(),
  securityDeposit: z.number().min(0),
  advanceMonths: z.number().int().min(0),
  terms: z.array(z.string()).default([]),
  specialConditions: z.array(z.string()).default([]),
})

function checkCompliance(data: { advanceMonths: number; terms: string[] }) {
  const flags: { type: string; message: string; clause?: string; law?: string }[] = []
  if (data.advanceMonths > 6) {
    flags.push({ type: 'violation', message: 'Rent advance exceeds the legal maximum of 6 months', law: 'Rent Act, 2024 (proposed)' })
  }
  const illegalKeywords = ['forfeit deposit', 'no refund', 'waive rights']
  for (const term of data.terms) {
    const lower = term.toLowerCase()
    for (const keyword of illegalKeywords) {
      if (lower.includes(keyword)) {
        flags.push({ type: 'warning', message: `Potentially illegal clause detected: "${term}"`, clause: term })
      }
    }
  }
  return flags
}

export const agreementController = {
  list: async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles
    const User = (await import('../models/User.js')).User
    const isAdmin = roles.includes('admin') || roles.includes('super_admin') || roles.includes('government')
    const agreements = await Agreement.find(isAdmin ? {} : { $or: [{ landlordId: userId }, { tenantId: userId }] }).sort({ createdAt: -1 }).lean()

    // Collect unique user IDs to populate names
    const userIds = new Set<string>()
    for (const a of agreements) {
      userIds.add(a.tenantId)
      userIds.add(a.landlordId)
    }
    const users = await User.find({ _id: { $in: [...userIds] } }).select('firstName lastName email phone').lean()
    const userMap = new Map(users.map((u) => [(u._id as Types.ObjectId).toString(), u]))

    const items = agreements.map((a) => {
      const tenant = userMap.get(a.tenantId)
      const landlord = userMap.get(a.landlordId)
      return {
        ...a,
        id: (a._id as Types.ObjectId).toString(),
        tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : undefined,
        tenantEmail: tenant?.email,
        tenantPhone: tenant?.phone,
        landlordName: landlord ? `${landlord.firstName} ${landlord.lastName}` : undefined,
      }
    })
    success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
  },

  getById: async (req: Request, res: Response) => {
    const agreement = await Agreement.findById(param(req.params.id)).lean()
    if (!agreement) { error(res, 'Agreement not found', 404); return }

    // Only the parties or staff may read an agreement's financial terms & signatures.
    const userId = req.user!.userId
    const roles = req.user!.roles
    const isAdmin = roles.includes('admin') || roles.includes('super_admin') || roles.includes('government')
    if (!isAdmin && agreement.tenantId !== userId && agreement.landlordId !== userId) {
      error(res, 'Not authorized to view this agreement', 403); return
    }
    success(res, { ...agreement, id: (agreement._id as Types.ObjectId).toString() })
  },

  create: async (req: Request, res: Response) => {
    const parsed = createAgreementSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

    const property = await Property.findById(parsed.data.propertyId)
    if (!property) { error(res, 'Property not found', 404); return }

    const complianceFlags = checkCompliance(parsed.data)
    const agreement = await Agreement.create({
      ...parsed.data,
      landlordId: req.user!.userId,
      status: 'draft',
      complianceFlags,
    })

    success(res, { ...agreement.toObject(), id: agreement._id.toString() }, 'Agreement created', 201)
  },

  sign: async (req: Request, res: Response) => {
    const agreement = await Agreement.findById(param(req.params.id))
    if (!agreement) { error(res, 'Agreement not found', 404); return }

    const userId = req.user!.userId
    const now = new Date().toISOString()

    // Hard compliance violations (e.g. illegal rent advance) block signing so an
    // unlawful lease can never become active/binding. Warnings do not block.
    const hasViolation = (agreement.complianceFlags ?? []).some((f: { type?: string }) => f.type === 'violation')
    if (hasViolation) {
      error(res, 'This agreement violates Ghana rental law (see compliance flags) and cannot be signed until the landlord corrects it.')
      return
    }

    if (userId === agreement.landlordId) {
      agreement.landlordSignature = now
    } else if (userId === agreement.tenantId) {
      // Check tenant profile completion
      const profile = await TenantProfile.findOne({ userId })
      if (!profile || !profile.profileComplete) {
        error(res, `Your tenant profile is ${profile?.completionScore ?? 0}% complete. You need 100% to sign agreements. Complete your profile at /my-profile.`)
        return
      }
      agreement.tenantSignature = now
    } else {
      error(res, 'Not a party to this agreement', 403); return
    }

    const signer = await User.findById(userId).select('firstName lastName').lean()
    const signerName = signer ? `${signer.firstName} ${signer.lastName}` : 'A party'
    const property = await Property.findById(agreement.propertyId).select('title').lean()
    const propertyTitle = property?.title ?? 'a property'

    if (agreement.landlordSignature && agreement.tenantSignature) {
      agreement.status = 'active'
      await Property.findByIdAndUpdate(agreement.propertyId, { status: 'occupied' })
      // Notify both that agreement is now active
      notifyAgreementFullySigned(agreement.tenantId, propertyTitle)
      notifyAgreementFullySigned(agreement.landlordId, propertyTitle)
      dispatchWebhook('agreement.activated', { agreementId: agreement._id.toString(), propertyId: agreement.propertyId, tenantId: agreement.tenantId, landlordId: agreement.landlordId }, { userId: agreement.tenantId })
      // Award first_lease (idempotent)
      checkAndAward(agreement.tenantId, 'lease_signed', { agreementId: agreement._id.toString() })
        .catch((err) => console.warn('[Agreement] checkAndAward failed:', err.message))
    } else {
      agreement.status = 'pending_signatures'
      // Notify the other party that one side signed
      const otherPartyId = userId === agreement.landlordId ? agreement.tenantId : agreement.landlordId
      notifyAgreementSigned(otherPartyId, propertyTitle, signerName)
      dispatchWebhook('agreement.signed', { agreementId: agreement._id.toString(), signedBy: userId, pendingParty: otherPartyId }, { userId: otherPartyId })
    }

    await agreement.save()
    success(res, { ...agreement.toObject(), id: agreement._id.toString() })
  },

  update: async (req: Request, res: Response) => {
    const agreement = await Agreement.findById(param(req.params.id))
    if (!agreement) { error(res, 'Agreement not found', 404); return }
    if (agreement.landlordId !== req.user!.userId) { error(res, 'Not authorized', 403); return }
    if (agreement.status === 'active') { error(res, 'Cannot modify active agreement'); return }

    const { rentAmount, terms, specialConditions, startDate, endDate, advanceMonths, securityDeposit } = req.body
    if (rentAmount) agreement.rentAmount = rentAmount
    if (terms) agreement.terms = terms
    if (specialConditions) agreement.specialConditions = specialConditions
    if (startDate) agreement.startDate = startDate
    if (endDate) agreement.endDate = endDate
    if (advanceMonths !== undefined) agreement.advanceMonths = advanceMonths
    if (securityDeposit !== undefined) agreement.securityDeposit = securityDeposit

    agreement.complianceFlags = checkCompliance({ advanceMonths: agreement.advanceMonths, terms: agreement.terms })
    agreement.version += 1
    // Clear signatures on edit (requires re-signing)
    agreement.landlordSignature = undefined
    agreement.tenantSignature = undefined
    agreement.status = 'draft'

    await agreement.save()
    success(res, { ...agreement.toObject(), id: agreement._id.toString() })
  },
}
