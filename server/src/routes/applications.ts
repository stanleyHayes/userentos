import { Router, Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { Application } from '../models/Application.js'
import { Property } from '../models/Property.js'
import { Agreement } from '../models/Agreement.js'
import { User } from '../models/User.js'
import { notifyApplicationReceived, notifyApplicationApproved, notifyApplicationRejected } from '../services/notify.js'
import { dispatchWebhook } from '../services/webhooks.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

// ─── Validation ───

const VALID_SECTIONS = ['personal', 'academic', 'professional', 'family', 'lifestyle', 'references', 'history', 'verification'] as const

const createApplicationSchema = z.object({
  propertyId: z.string(),
  message: z.string().optional().default(''),
  sharedSections: z.array(z.enum(VALID_SECTIONS)).min(1, 'Select at least one profile section to share').default(['personal', 'professional']),
  moveInDate: z.string(),
  duration: z.number().int().positive(),
  offeredRent: z.number().positive().optional(),
})

const respondSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().optional(),
})

// ─── POST /applications — tenant submits application ───

router.post('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId
  const roles = req.user!.roles

  if (!roles.includes('tenant')) {
    error(res, 'Only tenants can submit applications', 403)
    return
  }

  const parsed = createApplicationSchema.safeParse(req.body)
  if (!parsed.success) {
    error(res, parsed.error.issues[0].message)
    return
  }

  const { propertyId, message, sharedSections, moveInDate, duration, offeredRent } = parsed.data

  // Check property exists and is available
  const property = await Property.findById(propertyId)
  if (!property) { error(res, 'Property not found', 404); return }
  if (property.status !== 'available') { error(res, 'Property is not available for applications'); return }

  // Check for existing pending/approved application
  const existing = await Application.findOne({
    tenantId: userId,
    propertyId,
    status: { $in: ['pending', 'approved'] },
  })
  if (existing) {
    error(res, 'You already have an active application for this property', 409)
    return
  }

  // ─── Lease-based application restriction ───
  // Prevents tenants from using credit scores to rent for others
  const targetIsLongStay = property.stayType !== 'short_stay'

  if (targetIsLongStay) {
    const activeAgreement = await Agreement.findOne({
      tenantId: userId,
      status: 'active',
    }).lean()

    if (activeAgreement) {
      // Check if the current lease's property is also long-stay
      const currentProperty = await Property.findById(activeAgreement.propertyId).select('stayType title').lean()
      const currentIsLongStay = currentProperty?.stayType !== 'short_stay'

      if (currentIsLongStay) {
        const now = new Date()
        const endDate = new Date(activeAgreement.endDate)
        const monthsUntilExpiry = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)

        if (monthsUntilExpiry > 3) {
          // Lease has more than 3 months left — block entirely
          error(res, `You have an active lease at "${currentProperty?.title ?? 'a property'}" that doesn't expire until ${new Date(activeAgreement.endDate).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' })}. You can apply for a new long-stay property once you're within 3 months of expiry.`, 403)
          return
        }

        // Within 3 months — only allow if tenant has indicated non-renewal
        const hasIndicatedNonRenewal = activeAgreement.renewalStatus === 'tenant_declined' || activeAgreement.renewalStatus === 'landlord_declined'
        if (!hasIndicatedNonRenewal) {
          error(res, `Your lease at "${currentProperty?.title ?? 'a property'}" expires soon but you haven't indicated non-renewal. Please go to Agreements and indicate you won't be renewing before applying for a new property.`, 403)
          return
        }
      }
      // If current lease is short-stay, allow applying for long-stay freely
    }
  }
  // Short-stay properties: always allow applications regardless of existing leases

  let application
  try {
    application = await Application.create({
      tenantId: userId,
      propertyId,
      landlordId: property.landlordId,
      message,
      sharedSections,
      moveInDate: new Date(moveInDate),
      duration,
      offeredRent,
      status: 'pending',
    })
  } catch (err) {
    // Unique partial index — concurrent double-submission
    if ((err as { code?: number }).code === 11000) {
      error(res, 'You already have an active application for this property', 409)
      return
    }
    throw err
  }

  // Notify landlord (in_app + email + push)
  const tenant = await User.findById(userId).lean()
  const tenantName = tenant ? `${tenant.firstName} ${tenant.lastName}` : 'A tenant'
  notifyApplicationReceived(property.landlordId, tenantName, property.title)
  dispatchWebhook('application.created', { applicationId: application._id.toString(), tenantId: userId, propertyId, landlordId: property.landlordId }, { userId: property.landlordId })

  success(res, { ...application.toObject(), id: application._id.toString() }, 'Application submitted', 201)
}))

// ─── GET /applications — list applications ───

router.get('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId
  const roles = req.user!.roles
  const statusFilter = req.query.status as string | undefined

  const filter: Record<string, unknown> = {}
  if (roles.includes('admin') || roles.includes('super_admin') || roles.includes('government')) {
    // Admin/government see all applications
  } else if (roles.includes('landlord') || roles.includes('property_manager')) {
    filter.landlordId = userId
  } else {
    filter.tenantId = userId
  }
  if (statusFilter) filter.status = statusFilter

  const page = Math.max(1, Math.floor(Number(req.query.page) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.pageSize) || 20)))
  const skip = (page - 1) * pageSize

  const [total, applications] = await Promise.all([
    Application.countDocuments(filter),
    Application.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
  ])

  // Enrich with property titles and tenant names
  const propertyIds = [...new Set(applications.map((a) => a.propertyId))]
  const tenantIds = [...new Set(applications.map((a) => a.tenantId))]

  const [properties, tenants] = await Promise.all([
    Property.find({ _id: { $in: propertyIds } }).select('title rentAmount').lean(),
    User.find({ _id: { $in: tenantIds } }).select('firstName lastName email').lean(),
  ])

  const propertyMap = new Map(properties.map((p) => [(p._id as Types.ObjectId).toString(), p]))
  const tenantMap = new Map(tenants.map((t) => [(t._id as Types.ObjectId).toString(), t]))

  const items = applications.map((a) => {
    const prop = propertyMap.get(a.propertyId)
    const tenant = tenantMap.get(a.tenantId)
    return {
      ...a,
      id: (a._id as Types.ObjectId).toString(),
      propertyTitle: prop?.title ?? 'Unknown',
      propertyRent: prop?.rentAmount ?? 0,
      tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Unknown',
      tenantEmail: tenant?.email ?? '',
    }
  })

  success(res, { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
}))

// ─── GET /applications/:id — single application ───

router.get('/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const application = await Application.findById(param(req.params.id)).lean()
  if (!application) { error(res, 'Application not found', 404); return }

  const userId = req.user!.userId
  if (application.tenantId !== userId && application.landlordId !== userId) {
    error(res, 'Not authorized', 403)
    return
  }

  const [property, tenant] = await Promise.all([
    Property.findById(application.propertyId).select('title rentAmount address').lean(),
    User.findById(application.tenantId).select('firstName lastName email phone').lean(),
  ])

  success(res, {
    ...application,
    id: (application._id as Types.ObjectId).toString(),
    propertyTitle: property?.title ?? 'Unknown',
    propertyRent: property?.rentAmount ?? 0,
    propertyAddress: property?.address,
    tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Unknown',
    tenantEmail: tenant?.email ?? '',
    tenantPhone: tenant?.phone ?? '',
  })
}))

// ─── POST /applications/:id/respond — landlord approve/reject ───

router.post('/:id/respond', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const parsed = respondSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const application = await Application.findById(param(req.params.id))
  if (!application) { error(res, 'Application not found', 404); return }

  if (application.landlordId !== req.user!.userId) {
    error(res, 'Only the property owner can respond to applications', 403)
    return
  }

  if (application.status !== 'pending') {
    error(res, `Cannot respond to an application with status "${application.status}"`)
    return
  }

  const { action, notes } = parsed.data
  const property = await Property.findById(application.propertyId)

  if (action === 'approve') {
    // Double-booking guards: one approved application per property, and never
    // approve into an already-occupied property. The sign-time occupied
    // predicate in agreementController is the atomic backstop.
    const [alreadyApproved, prop] = await Promise.all([
      Application.findOne({ propertyId: application.propertyId, status: 'approved', _id: { $ne: application._id } }).lean(),
      Property.findById(application.propertyId).select('status').lean(),
    ])
    if (alreadyApproved) {
      error(res, 'Another application for this property has already been approved', 409)
      return
    }
    if (prop?.status === 'occupied') {
      error(res, 'This property is already occupied', 409)
      return
    }

    // Atomic claim so two concurrent responses can't both flip a pending application.
    const claimed = await Application.findOneAndUpdate(
      { _id: application._id, status: 'pending' },
      { $set: { status: 'approved', landlordNotes: notes, respondedAt: new Date() } },
      { new: true },
    )
    if (!claimed) {
      error(res, `Cannot respond to an application with status "${application.status}"`, 409)
      return
    }
    application.status = 'approved'
    application.landlordNotes = notes
    application.respondedAt = new Date()

    // Compute end date
    const startDate = new Date(application.moveInDate)
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + application.duration)

    const rentAmount = application.offeredRent ?? property?.rentAmount ?? 0

    // Auto-create draft agreement. If this fails, roll the application back to
    // pending so it isn't stranded in "approved" with no agreement.
    let agreement
    try {
      agreement = await Agreement.create({
        propertyId: application.propertyId,
        landlordId: application.landlordId,
        tenantId: application.tenantId,
        status: 'pending_signatures',
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        rentAmount,
        securityDeposit: 0,
        advanceMonths: property?.advanceMonths ?? 0,
        terms: [],
        specialConditions: [],
        complianceFlags: [],
        version: 1,
      })
    } catch (err) {
      await Application.updateOne({ _id: application._id }, { $set: { status: 'pending' }, $unset: { respondedAt: 1 } })
      throw err
    }

    notifyApplicationApproved(application.tenantId, property?.title ?? 'a property')
    dispatchWebhook('application.approved', { applicationId: application._id.toString(), agreementId: agreement._id.toString() }, { userId: application.tenantId })

    success(res, {
      ...application.toObject(),
      id: application._id.toString(),
      agreementId: agreement._id.toString(),
    })
  } else {
    // Reject
    application.status = 'rejected'
    application.landlordNotes = notes
    application.respondedAt = new Date()
    await application.save()

    notifyApplicationRejected(application.tenantId, property?.title ?? 'a property', notes)
    dispatchWebhook('application.rejected', { applicationId: application._id.toString(), notes }, { userId: application.tenantId })

    success(res, { ...application.toObject(), id: application._id.toString() })
  }
}))

// ─── POST /applications/:id/withdraw — tenant withdraws ───

router.post('/:id/withdraw', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const application = await Application.findById(param(req.params.id))
  if (!application) { error(res, 'Application not found', 404); return }

  if (application.tenantId !== req.user!.userId) {
    error(res, 'Only the applicant can withdraw', 403)
    return
  }

  if (application.status !== 'pending') {
    error(res, `Cannot withdraw an application with status "${application.status}"`)
    return
  }

  application.status = 'withdrawn'
  await application.save()

  success(res, { ...application.toObject(), id: application._id.toString() })
}))

export default router
