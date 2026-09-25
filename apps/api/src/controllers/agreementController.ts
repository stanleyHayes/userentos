import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { Agreement } from '../models/Agreement.js'
import { Property } from '../models/Property.js'
import { attachObservedRent } from '../services/ml/valuationLog.js'
import { TenantProfile, calcScore } from '../models/TenantProfile.js'
import { User } from '../models/User.js'
import { Business } from '../models/Business.js'
import { notify, notifyAgreementSigned, notifyAgreementFullySigned } from '../services/notify.js'
import { checkAndAward } from '../services/achievements.js'
import { dispatchWebhook } from '../services/webhooks.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { checkAgreementCompliance } from '../services/legal/agreementCompliance.js'
import { tenantHasSigned } from '../services/tenancyRelationship.js'
import { agreementTermsHash, evidenceForViewer, SIGNATURE_CONSENT_STATEMENT, SIGNATURE_CONSENT_VERSION, type AgreementTerms } from '../services/agreementEvidence.js'

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

const updateAgreementSchema = createAgreementSchema.partial().omit({ propertyId: true, tenantId: true })

const signSchema = z.object({
  // The typed legal name is the e-signature — required so the record shows WHO signed.
  signatureName: z.string().trim().min(2).max(100),
  // Fingerprint of the exact terms the signer reviewed (termsHash from GET).
  termsHash: z.string().regex(/^[a-f0-9]{64}$/i, 'termsHash is required — reload the agreement and sign again'),
  consent: z.literal(true, { error: 'You must agree to sign electronically' }),
})

const SIGNABLE = ['draft', 'pending_signatures']

function isStaff(req: Request): boolean {
  const roles = req.user!.roles
  return !req.user!.suspended && (roles.includes('admin') || roles.includes('super_admin') || roles.includes('government'))
}

/** API view: adds the terms fingerprint signers must echo back, and hides the
 *  counterparty's signing IP/device from the other party. */
function agreementView<T extends AgreementTerms & { signatureEvidence?: { userId?: string }[] }>(agreement: T, req: Request, extra: Record<string, unknown> = {}) {
  return {
    ...agreement,
    id: String(agreement._id),
    termsHash: agreementTermsHash(agreement),
    signatureEvidence: evidenceForViewer(agreement.signatureEvidence, req.user!.userId, isStaff(req)),
    ...extra,
  }
}

async function notifyBusinessesOfNewMover(agreementId: string, propertyId: string) {
  const claimed = await Agreement.findOneAndUpdate(
    { _id: agreementId, moverBusinessesNotifiedAt: { $exists: false } },
    { $set: { moverBusinessesNotifiedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean()
  if (!claimed) return
  const property = await Property.findById(propertyId).select('address.city').lean()
  const city = property?.address?.city
  if (!city) return
  const businesses = await Business.find({ city: new RegExp(`^${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('ownerId').lean()
  await Promise.allSettled(businesses.map((business) => notify({
    userId: business.ownerId,
    title: `New mover in ${city}`,
    message: 'A tenant just activated a lease nearby. Create a new-mover offer to reach them while they settle in.',
    actionUrl: '/role-capabilities',
  })))
}

export const agreementController = {
  list: async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles
    const User = (await import('../models/User.js')).User
    const isAdmin = !req.user!.suspended && (roles.includes('admin') || roles.includes('super_admin') || roles.includes('government'))
    const filter = isAdmin ? {} : { $or: [{ landlordId: userId }, { tenantId: userId }] }

    const page = Math.max(1, Math.floor(Number(req.query.page) || 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.pageSize) || 20)))
    const skip = (page - 1) * pageSize

    const [total, agreements] = await Promise.all([
      Agreement.countDocuments(filter),
      Agreement.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean(),
    ])

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
      // A landlord can draft a lease naming anyone; the tenant's contact
      // details are only disclosed once the tenant has signed it.
      const showContact = isAdmin || a.tenantId === userId || tenantHasSigned(a)
      return agreementView(a, req, {
        tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : undefined,
        tenantEmail: showContact ? tenant?.email : undefined,
        tenantPhone: showContact ? tenant?.phone : undefined,
        landlordName: landlord ? `${landlord.firstName} ${landlord.lastName}` : undefined,
      })
    })
    success(res, { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
  },

  getById: async (req: Request, res: Response) => {
    const agreement = await Agreement.findById(param(req.params.id)).lean()
    if (!agreement) { error(res, 'Agreement not found', 404); return }

    // Only the parties or staff may read an agreement's financial terms & signatures.
    const userId = req.user!.userId
    if (!isStaff(req) && agreement.tenantId !== userId && agreement.landlordId !== userId) {
      error(res, 'Not authorized to view this agreement', 403); return
    }
    success(res, agreementView(agreement, req, { signatureConsentStatement: SIGNATURE_CONSENT_STATEMENT }))
  },

  create: async (req: Request, res: Response) => {
    const parsed = createAgreementSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const property = await Property.findById(parsed.data.propertyId)
    if (!property) { error(res, 'Property not found', 404); return }

    // IDOR fix: only the property's landlord may create an agreement for it —
    // previously anyone could fabricate a lease over someone else's property.
    const roles = req.user!.roles
    const isAdmin = roles.includes('admin') || roles.includes('super_admin')
    if (property.landlordId !== req.user!.userId && !isAdmin) {
      error(res, 'You can only create agreements for your own properties', 403)
      return
    }

    // The tenant must be a real user, and never the landlord themselves.
    if (parsed.data.tenantId === req.user!.userId) {
      error(res, 'You cannot create an agreement with yourself as tenant')
      return
    }
    const tenant = await User.findById(parsed.data.tenantId).select('_id roles').lean()
    if (!tenant || !(tenant.roles ?? []).includes('tenant')) { error(res, 'Tenant not found', 404); return }

    const complianceFlags = checkAgreementCompliance(parsed.data)
    const agreement = await Agreement.create({
      ...parsed.data,
      landlordId: req.user!.userId,
      status: 'draft',
      complianceFlags,
    })

    success(res, agreementView(agreement.toObject(), req, { signatureConsentStatement: SIGNATURE_CONSENT_STATEMENT }), 'Agreement created', 201)
  },

  sign: async (req: Request, res: Response) => {
    const parsed = signSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
    const { signatureName, termsHash } = parsed.data

    const agreement = await Agreement.findById(param(req.params.id))
    if (!agreement) { error(res, 'Agreement not found', 404); return }

    // State guard: only an unsigned/partially-signed agreement can be signed.
    // Without this, a terminated or expired lease can be "re-signed" back to
    // active, reviving a dead contract and re-occupying the property.
    if (!SIGNABLE.includes(agreement.status)) {
      error(res, `Agreement is ${agreement.status} and cannot be signed`, 409)
      return
    }

    const userId = req.user!.userId

    // Hard compliance violations (e.g. illegal rent advance) block signing so an
    // unlawful lease can never become active/binding. Warnings do not block.
    const complianceFlags = checkAgreementCompliance(agreement)
    const violations = complianceFlags.filter((f: { type?: string }) => f.type === 'violation')
    if (violations.length) {
      error(res, `Agreement cannot be signed: ${violations.map(f => f.message).join(' ')}`)
      return
    }

    const role = userId === agreement.landlordId ? 'landlord' : userId === agreement.tenantId ? 'tenant' : null
    if (!role) { error(res, 'Not a party to this agreement', 403); return }
    if (role === 'tenant') {
      const profile = await TenantProfile.findOne({ userId })
      const completionScore = profile ? calcScore(profile) : 0
      if (completionScore < 100) {
        error(res, `Your tenant profile is ${completionScore}% complete. You need 100% to sign agreements. Complete your profile at /my-profile.`)
        return
      }
    }
    const signatureField = role === 'landlord' ? 'landlordSignature' : 'tenantSignature'
    if (agreement[signatureField]) { error(res, 'You have already signed this version of the agreement', 409); return }

    // The signature must attach to exactly the terms the signer reviewed. If
    // the landlord edited them in the meantime, the signer has to look again.
    const currentHash = agreementTermsHash(agreement)
    if (termsHash.toLowerCase() !== currentHash) {
      error(res, 'This agreement changed after you opened it. Review the latest version and sign again.', 409)
      return
    }

    // A signature that completes the pair activates the lease — refuse before
    // recording it if the property is already let under another agreement.
    const completesPair = role === 'landlord' ? !!agreement.tenantSignature : !!agreement.landlordSignature
    if (completesPair && await Property.exists({ _id: agreement.propertyId, status: 'occupied' })) {
      error(res, 'This property is already occupied under another agreement', 409)
      return
    }

    const signedAt = new Date()
    const evidence = {
      role,
      userId,
      signatureName,
      signedAt,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')?.slice(0, 512),
      termsHash: currentHash,
      agreementVersion: agreement.version,
      consentStatement: SIGNATURE_CONSENT_STATEMENT,
      consentVersion: SIGNATURE_CONSENT_VERSION,
    }
    // Atomic: lands only if the terms are still the version the signer saw
    // and this party has not signed yet. Concurrent signers each $push their
    // own evidence; exactly one of them observes both signatures below.
    const signed = await Agreement.findOneAndUpdate(
      { _id: agreement._id, version: agreement.version, status: { $in: SIGNABLE }, [signatureField]: { $in: [null, ''] } },
      {
        $push: { signatureEvidence: evidence },
        $set: { [signatureField]: signedAt.toISOString(), [`${role}SignatureName`]: signatureName, complianceFlags },
      },
      { returnDocument: 'after' },
    )
    if (!signed) {
      error(res, 'This agreement changed while you were signing. Review the latest version and sign again.', 409)
      return
    }

    const signer = await User.findById(userId).select('firstName lastName').lean()
    const signerName = signer ? `${signer.firstName} ${signer.lastName}` : 'A party'
    const property = await Property.findById(signed.propertyId).select('title').lean()
    const propertyTitle = property?.title ?? 'a property'
    const agreementId = signed._id.toString()

    if (!(signed.landlordSignature && signed.tenantSignature)) {
      const pending = await Agreement.findOneAndUpdate({ _id: signed._id, status: 'draft' }, { $set: { status: 'pending_signatures' } }, { returnDocument: 'after' })
      // Notify the other party that one side signed
      const otherPartyId = role === 'landlord' ? signed.tenantId : signed.landlordId
      notifyAgreementSigned(otherPartyId, propertyTitle, signerName)
        .catch((err) => console.warn('[Agreement] notify failed:', err))
      dispatchWebhook('agreement.signed', { agreementId, signedBy: userId, pendingParty: otherPartyId }, { userId: otherPartyId })
      success(res, agreementView((pending ?? signed).toObject(), req))
      return
    }

    // Atomic predicate: only flip a non-occupied property. If another fully-signed
    // agreement already occupies it, that's a double-booking — block it.
    const occupied = await Property.findOneAndUpdate(
      { _id: signed.propertyId, status: { $ne: 'occupied' } },
      { $set: { status: 'occupied' } },
      { returnDocument: 'after' },
    )
    if (!occupied) {
      error(res, 'This property is already occupied under another agreement', 409)
      return
    }
    const activated = await Agreement.findOneAndUpdate({ _id: signed._id, status: { $in: SIGNABLE } }, { $set: { status: 'active' } }, { returnDocument: 'after' })
    if (activated) {
      /*
       * The strongest ground truth the platform has for the pricing model: a
       * signed agreement is what the property actually let for, not what it
       * was advertised at. Overwrites nothing — attachObservedRent only fills
       * valuations that have no outcome yet (roadmap checklist item 7).
       */
      void attachObservedRent(activated.propertyId, Number(activated.rentAmount), 'agreement_signed')
      notifyAgreementFullySigned(activated.tenantId, propertyTitle)
        .catch((err) => console.warn('[Agreement] notify failed:', err))
      notifyAgreementFullySigned(activated.landlordId, propertyTitle)
        .catch((err) => console.warn('[Agreement] notify failed:', err))
      dispatchWebhook('agreement.activated', { agreementId, propertyId: activated.propertyId, tenantId: activated.tenantId, landlordId: activated.landlordId }, { userId: activated.tenantId })
      // Award first_lease (idempotent)
      checkAndAward(activated.tenantId, 'lease_signed', { agreementId })
        .catch((err) => console.warn('[Agreement] checkAndAward failed:', err.message))
      void notifyBusinessesOfNewMover(agreementId, activated.propertyId)
    }
    success(res, agreementView((activated ?? signed).toObject(), req))
  },

  update: async (req: Request, res: Response) => {
    const agreement = await Agreement.findById(param(req.params.id))
    if (!agreement) { error(res, 'Agreement not found', 404); return }
    if (agreement.landlordId !== req.user!.userId) { error(res, 'Not authorized', 403); return }
    if (!['draft', 'pending_signatures'].includes(agreement.status)) { error(res, 'Only draft or pending agreements can be modified', 409); return }

    const parsed = updateAgreementSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
    const { rentAmount, terms, specialConditions, startDate, endDate, advanceMonths, securityDeposit } = parsed.data

    if (rentAmount !== undefined) agreement.rentAmount = rentAmount
    if (terms !== undefined) agreement.terms = terms
    if (specialConditions !== undefined) agreement.specialConditions = specialConditions
    if (startDate !== undefined) agreement.startDate = startDate
    if (endDate !== undefined) agreement.endDate = endDate
    if (advanceMonths !== undefined) agreement.advanceMonths = advanceMonths
    if (securityDeposit !== undefined) agreement.securityDeposit = securityDeposit

    agreement.complianceFlags = checkAgreementCompliance(agreement)
    agreement.version += 1
    // Clear signatures on edit (requires re-signing)
    agreement.landlordSignature = undefined
    agreement.tenantSignature = undefined
    agreement.landlordSignatureName = undefined
    agreement.tenantSignatureName = undefined
    agreement.status = 'draft'

    await agreement.save()
    success(res, agreementView(agreement.toObject(), req, { signatureConsentStatement: SIGNATURE_CONSENT_STATEMENT }))
  },
}
