import { Router, Request, Response } from 'express'
import { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { MaintenanceRequest } from '../models/MaintenanceRequest.js'
import { Property } from '../models/Property.js'
import { Agreement } from '../models/Agreement.js'
import { User } from '../models/User.js'
import { notify } from '../services/notify.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

// ─── Validation ───

const CATEGORIES = [
  'plumbing',
  'electrical',
  'structural',
  'pest',
  'appliance',
  'security',
  'other',
] as const

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

const STATUSES = [
  'requested',
  'acknowledged',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
] as const

const createSchema = z.object({
  propertyId: z.string().min(1),
  agreementId: z.string().optional(),
  title: z.string().min(2).max(200),
  description: z.string().min(2),
  category: z.enum(CATEGORIES).default('other'),
  priority: z.enum(PRIORITIES).default('medium'),
  images: z.array(z.string()).optional().default([]),
})

const updateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  vendorId: z.string().optional(),
  vendorName: z.string().optional(),
  vendorPhone: z.string().optional(),
  scheduledDate: z.string().optional(),
  cost: z.number().nonnegative().optional(),
  priority: z.enum(PRIORITIES).optional(),
})

const noteSchema = z.object({ text: z.string().min(1) })
const completeSchema = z.object({
  cost: z.number().nonnegative().optional(),
  notes: z.string().optional(),
})

// ─── Helpers ───

function isLandlordRole(roles: string[]): boolean {
  return roles.includes('landlord') || roles.includes('property_manager')
}

function isAdminRole(roles: string[]): boolean {
  return roles.includes('admin') || roles.includes('super_admin') || roles.includes('government')
}

function statusLabel(s: string): string {
  return s.replace('_', ' ')
}

// ─── GET /api/maintenance ───
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles
    const statusFilter = req.query.status as string | undefined
    const propertyFilter = req.query.propertyId as string | undefined
    const priorityFilter = req.query.priority as string | undefined

    const filter: Record<string, unknown> = {}

    if (isAdminRole(roles)) {
      // admin/government see all
    } else if (isLandlordRole(roles)) {
      // landlord sees requests for properties they own/manage
      const owned = await Property.find({ landlordId: userId.toString() }).select('_id').lean()
      const ownedIds = owned.map((p) => (p._id as Types.ObjectId).toString())
      // include both: assigned landlordId OR property owned
      filter.$or = [{ landlordId: userId.toString() }, { propertyId: { $in: ownedIds } }]
    } else {
      filter.tenantId = userId.toString()
    }

    if (statusFilter) filter.status = statusFilter
    if (propertyFilter) filter.propertyId = propertyFilter
    if (priorityFilter) filter.priority = priorityFilter

    const items = await MaintenanceRequest.find(filter).sort({ createdAt: -1 }).limit(200).lean()

    // enrich with property/tenant
    const propertyIds = [...new Set(items.map((i) => i.propertyId))]
    const tenantIds = [...new Set(items.map((i) => i.tenantId))]
    const [properties, tenants] = await Promise.all([
      Property.find({ _id: { $in: propertyIds } }).select('title address').lean(),
      User.find({ _id: { $in: tenantIds } }).select('firstName lastName email phone').lean(),
    ])
    const propertyMap = new Map(properties.map((p) => [(p._id as Types.ObjectId).toString(), p]))
    const tenantMap = new Map(tenants.map((t) => [(t._id as Types.ObjectId).toString(), t]))

    const enriched = items.map((item) => {
      const prop = propertyMap.get(item.propertyId)
      const tenant = tenantMap.get(item.tenantId)
      return {
        ...item,
        id: (item._id as Types.ObjectId).toString(),
        propertyTitle: prop?.title ?? 'Unknown property',
        propertyAddress: prop?.address,
        tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Unknown',
        tenantPhone: (tenant as { phone?: string } | undefined)?.phone ?? '',
      }
    })

    success(res, {
      items: enriched,
      total: enriched.length,
      page: 1,
      pageSize: enriched.length,
      totalPages: 1,
    })
  })
)

// ─── GET /api/maintenance/:id ───
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles
    const id = req.params.id

    const item = await MaintenanceRequest.findById(id).lean()
    if (!item) {
      error(res, 'Maintenance request not found', 404)
      return
    }

    // Authorization check
    const itemTenantId = item.tenantId?.toString()
    const itemLandlordId = item.landlordId?.toString()
    const isOwner = itemTenantId === userId.toString() || itemLandlordId === userId.toString()
    const isAdmin = isAdminRole(roles)
    if (!isOwner && !isAdmin) {
      error(res, 'Not authorized to view this maintenance request', 403)
      return
    }

    const [property, tenant] = await Promise.all([
      Property.findById(item.propertyId).select('title address').lean(),
      User.findById(item.tenantId).select('firstName lastName email phone').lean(),
    ])

    success(res, {
      id: (item._id as Types.ObjectId).toString(),
      ...item,
      propertyTitle: property?.title ?? 'Unknown property',
      propertyAddress: property?.address,
      tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Unknown',
      tenantPhone: (tenant as { phone?: string } | undefined)?.phone ?? '',
    })
  })
)

// ─── POST /api/maintenance ───
router.post(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles

    if (!roles.includes('tenant')) {
      error(res, 'Only tenants can submit maintenance requests', 403)
      return
    }

    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      error(res, parsed.error.issues[0].message)
      return
    }
    const data = parsed.data

    const property = await Property.findById(data.propertyId).lean()
    if (!property) {
      error(res, 'Property not found', 404)
      return
    }

    // Tenancy check: the requester must live (or have lived) at this property
    // under an agreement — otherwise any tenant can spam arbitrary landlords.
    const tenancy = await Agreement.exists({
      propertyId: data.propertyId,
      tenantId: userId.toString(),
    })
    if (!tenancy) {
      error(res, 'You can only file maintenance requests for properties you rent', 403)
      return
    }
    if (data.agreementId) {
      const agreement = await Agreement.findById(data.agreementId).select('propertyId').lean()
      if (!agreement || agreement.propertyId !== data.propertyId) {
        error(res, 'agreementId does not belong to this property')
        return
      }
    }

    const request = await MaintenanceRequest.create({
      propertyId: data.propertyId,
      agreementId: data.agreementId,
      tenantId: userId.toString(),
      landlordId: property.landlordId,
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      status: 'requested',
      images: data.images ?? [],
      notes: [],
    })

    // notify landlord
    const tenant = await User.findById(userId).select('firstName lastName').lean()
    const tenantName = tenant ? `${tenant.firstName} ${tenant.lastName}` : 'A tenant'
    notify({
      userId: property.landlordId,
      title: 'New Maintenance Request',
      message: `${tenantName} reported "${data.title}" at "${property.title}".`,
      actionUrl: '/maintenance',
    })

    success(
      res,
      { ...request.toObject(), id: (request._id as Types.ObjectId).toString() },
      'Maintenance request submitted',
      201
    )
  })
)

// ─── PATCH /api/maintenance/:id ───
router.patch(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles

    const request = await MaintenanceRequest.findById(param(req.params.id))
    if (!request) {
      error(res, 'Maintenance request not found', 404)
      return
    }

    const isLandlord =
      request.landlordId === userId.toString() || isAdminRole(roles)
    const isTenant = request.tenantId === userId.toString()

    if (!isLandlord && !isTenant) {
      error(res, 'Not authorized', 403)
      return
    }

    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      error(res, parsed.error.issues[0].message)
      return
    }
    const data = parsed.data

    if (!isLandlord && Object.keys(data).length > 0) {
      error(res, 'Tenants can only append notes; cannot modify status/vendor/cost', 403)
      return
    }

    const previousStatus = request.status
    let statusChanged = false

    if (data.status && data.status !== request.status) {
      request.status = data.status
      statusChanged = true
      if (data.status === 'completed' && !request.completedAt) {
        request.completedAt = new Date().toISOString()
      }
    }
    if (data.vendorId !== undefined) request.vendorId = data.vendorId
    if (data.vendorName !== undefined) request.vendorName = data.vendorName
    if (data.vendorPhone !== undefined) request.vendorPhone = data.vendorPhone
    if (data.scheduledDate !== undefined) request.scheduledDate = data.scheduledDate
    if (data.cost !== undefined) request.cost = data.cost
    if (data.priority !== undefined) request.priority = data.priority

    await request.save()

    // notify on status change → notify tenant
    if (statusChanged) {
      const property = await Property.findById(request.propertyId).select('title').lean()
      notify({
        userId: request.tenantId,
        title: 'Maintenance Update',
        message: `Your request "${request.title}" at "${property?.title ?? 'your property'}" is now ${statusLabel(request.status)} (was ${statusLabel(previousStatus)}).`,
        actionUrl: '/maintenance',
      })
    }

    success(res, { ...request.toObject(), id: (request._id as Types.ObjectId).toString() })
  })
)

// ─── POST /api/maintenance/:id/notes ───
router.post(
  '/:id/notes',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles

    const request = await MaintenanceRequest.findById(param(req.params.id))
    if (!request) {
      error(res, 'Maintenance request not found', 404)
      return
    }

    const isParticipant =
      request.tenantId === userId.toString() ||
      request.landlordId === userId.toString() ||
      isAdminRole(roles)

    if (!isParticipant) {
      error(res, 'Not authorized', 403)
      return
    }

    const parsed = noteSchema.safeParse(req.body)
    if (!parsed.success) {
      error(res, parsed.error.issues[0].message)
      return
    }

    const note = { text: parsed.data.text, by: userId.toString(), at: new Date().toISOString() }
    request.notes.push(note)
    await request.save()

    // notify the other party
    const otherPartyId =
      request.tenantId === userId.toString() ? request.landlordId : request.tenantId
    const property = await Property.findById(request.propertyId).select('title').lean()
    notify({
      userId: otherPartyId,
      title: 'New Note on Maintenance Request',
      message: `New note added to "${request.title}" at "${property?.title ?? 'your property'}".`,
      actionUrl: '/maintenance',
    })

    success(res, { ...request.toObject(), id: (request._id as Types.ObjectId).toString() })
  })
)

// ─── POST /api/maintenance/:id/complete ───
router.post(
  '/:id/complete',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles

    const request = await MaintenanceRequest.findById(param(req.params.id))
    if (!request) {
      error(res, 'Maintenance request not found', 404)
      return
    }

    const isLandlord =
      request.landlordId === userId.toString() || isAdminRole(roles)
    if (!isLandlord) {
      error(res, 'Only the landlord can mark a request completed', 403)
      return
    }

    const parsed = completeSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      error(res, parsed.error.issues[0].message)
      return
    }

    request.status = 'completed'
    request.completedAt = new Date().toISOString()
    if (parsed.data.cost !== undefined) request.cost = parsed.data.cost
    if (parsed.data.notes) {
      request.notes.push({
        text: parsed.data.notes,
        by: userId.toString(),
        at: new Date().toISOString(),
      })
    }
    await request.save()

    const property = await Property.findById(request.propertyId).select('title').lean()
    notify({
      userId: request.tenantId,
      title: 'Maintenance Completed',
      message: `"${request.title}" at "${property?.title ?? 'your property'}" has been marked completed.`,
      actionUrl: '/maintenance',
    })

    success(res, { ...request.toObject(), id: (request._id as Types.ObjectId).toString() })
  })
)

export default router
