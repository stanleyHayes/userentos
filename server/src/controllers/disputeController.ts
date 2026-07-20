import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { Dispute } from '../models/Dispute.js'
import { Property } from '../models/Property.js'
import { Agreement } from '../models/Agreement.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { notifyDisputeFiled, notifyDisputeUpdate } from '../services/notify.js'
import { dispatchWebhook } from '../services/webhooks.js'
import { param } from '../utils/params.js'

const createDisputeSchema = z.object({
  filedAgainst: z.string(),
  propertyId: z.string(),
  agreementId: z.string().optional(),
  category: z.enum(['rent_increase', 'eviction', 'maintenance', 'deposit_refund', 'illegal_clause', 'other']),
  title: z.string().min(1),
  description: z.string().min(10),
})

const updateStatusSchema = z.object({
  status: z.enum(['filed', 'under_mediation', 'escalated', 'resolved', 'closed']).optional(),
  mediationNotes: z.string().max(5000).optional(),
  resolution: z.string().max(5000).optional(),
  assignedTo: z.string().optional(),
})

// Allowed forward transitions — a dispute can't jump filed→closed, and a
// closed/resolved dispute is terminal.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  filed: ['under_mediation', 'escalated', 'resolved'],
  under_mediation: ['escalated', 'resolved', 'closed'],
  escalated: ['under_mediation', 'resolved', 'closed'],
  resolved: ['closed'],
  closed: [],
}

const MEDIATOR_ROLES = ['government', 'admin', 'super_admin', 'legal_officer']

export const disputeController = {
  list: async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles
    const isGov = roles.includes('government') || roles.includes('admin') || roles.includes('super_admin') || roles.includes('legal_officer')

    const filter = isGov ? {} : { $or: [{ filedBy: userId }, { filedAgainst: userId }] }
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.pageSize) || 20)))
    const skip = (page - 1) * pageSize

    const [total, disputes] = await Promise.all([
      Dispute.countDocuments(filter),
      Dispute.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    ])
    const items = disputes.map((d) => ({ ...d, id: (d._id as Types.ObjectId).toString() }))
    success(res, { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
  },

  getById: async (req: Request, res: Response) => {
    const dispute = await Dispute.findById(param(req.params.id)).lean()
    if (!dispute) { error(res, 'Dispute not found', 404); return }

    // Only the parties, the assigned mediator, or government/legal staff may read a dispute.
    const userId = req.user!.userId
    const roles = req.user!.roles
    const isGov = roles.includes('government') || roles.includes('admin') || roles.includes('super_admin') || roles.includes('legal_officer')
    if (!isGov && dispute.filedBy !== userId && dispute.filedAgainst !== userId && dispute.assignedTo !== userId) {
      error(res, 'Not authorized to view this dispute', 403); return
    }
    success(res, { ...dispute, id: (dispute._id as Types.ObjectId).toString() })
  },

  create: async (req: Request, res: Response) => {
    const parsed = createDisputeSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const userId = req.user!.userId

    // The property must exist and the filer must be a party to it (owner, or a
    // tenant/landlord on an agreement for it). Otherwise anyone could file a
    // dispute on any listing and knock it off the market (griefing/DoS).
    const property = await Property.findById(parsed.data.propertyId).lean()
    if (!property) { error(res, 'Property not found', 404); return }

    const onAgreement = await Agreement.exists({
      propertyId: parsed.data.propertyId,
      $or: [{ tenantId: userId }, { landlordId: userId }],
    })
    const isParty = property.landlordId === userId || !!onAgreement
    if (!isParty) { error(res, 'You can only file a dispute on a property you own or rent', 403); return }

    // The accused must be the filer's counterparty on this property — the tenant
    // when the filer is the landlord/manager, the landlord when the filer is the
    // tenant. Otherwise anyone could stack open disputes on an arbitrary victim
    // and tank their credit score (each open dispute subtracts points).
    const asLandlordOnAgreement = await Agreement.exists({ propertyId: parsed.data.propertyId, landlordId: userId })
    const filerIsLandlordSide = property.landlordId === userId || !!asLandlordOnAgreement
    const isCounterparty = filerIsLandlordSide
      ? !!(await Agreement.exists({ propertyId: parsed.data.propertyId, tenantId: parsed.data.filedAgainst }))
      : parsed.data.filedAgainst === property.landlordId
    if (!isCounterparty) {
      error(res, 'You can only file a dispute against your own landlord or tenant on this property')
      return
    }

    // The accused must be a real user.
    const accused = await User.findById(parsed.data.filedAgainst).select('_id').lean()
    if (!accused) { error(res, 'The user this dispute is filed against does not exist', 404); return }

    const dispute = await Dispute.create({
      ...parsed.data,
      filedBy: userId,
      status: 'filed',
      evidence: [],
      previousPropertyStatus: property.status,
    })

    await Property.findByIdAndUpdate(parsed.data.propertyId, { status: 'under_dispute' })

    // Notify the other party
    const filer = await User.findById(req.user!.userId).select('firstName lastName').lean()
    const filerName = filer ? `${filer.firstName} ${filer.lastName}` : 'Someone'
    notifyDisputeFiled(parsed.data.filedAgainst, parsed.data.title, filerName)
    dispatchWebhook('dispute.filed', { disputeId: dispute._id.toString(), title: dispute.title, filedAgainst: dispute.filedAgainst }, { userId: dispute.filedAgainst })

    success(res, { ...dispute.toObject(), id: dispute._id.toString() }, 'Dispute filed', 201)
  },

  updateStatus: async (req: Request, res: Response) => {
    const dispute = await Dispute.findById(param(req.params.id))
    if (!dispute) { error(res, 'Dispute not found', 404); return }

    const parsed = updateStatusSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const { status, mediationNotes, resolution, assignedTo } = parsed.data

    if (status) {
      const allowed = ALLOWED_TRANSITIONS[dispute.status] ?? []
      if (dispute.status !== status && !allowed.includes(status)) {
        error(res, `Cannot move a ${dispute.status} dispute to ${status}`, 409)
        return
      }
      dispute.status = status
    }
    if (mediationNotes) dispute.mediationNotes = mediationNotes
    if (resolution) dispute.resolution = resolution
    if (assignedTo) {
      // The assignee must be a real user who can actually mediate.
      const assignee = await User.findById(assignedTo).select('roles').lean()
      if (!assignee || !(assignee.roles ?? []).some((r) => MEDIATOR_ROLES.includes(r))) {
        error(res, 'assignedTo must be a government, legal, or admin user')
        return
      }
      dispute.assignedTo = assignedTo
    }
    await dispute.save()

    // Notify both parties of status change
    if (status) {
      notifyDisputeUpdate(dispute.filedBy, dispute.title, status)
      notifyDisputeUpdate(dispute.filedAgainst, dispute.title, status)
      if (status === 'resolved' || status === 'closed') {
        // Restore the property's market status — previously a resolved dispute
        // left the property stuck at under_dispute forever.
        const activeAgreement = await Agreement.exists({ propertyId: dispute.propertyId, status: 'active' })
        const restoreTo = activeAgreement ? 'occupied' : (dispute.previousPropertyStatus === 'under_dispute' ? 'available' : (dispute.previousPropertyStatus ?? 'available'))
        await Property.updateOne(
          { _id: dispute.propertyId, status: 'under_dispute' },
          { $set: { status: restoreTo } },
        )
        dispatchWebhook('dispute.resolved', { disputeId: dispute._id.toString(), title: dispute.title, status }, { userId: dispute.filedBy })
      }
    }

    success(res, { ...dispute.toObject(), id: dispute._id.toString() })
  },

  uploadEvidence: async (req: Request, res: Response) => {
    const dispute = await Dispute.findById(param(req.params.id))
    if (!dispute) { error(res, 'Dispute not found', 404); return }

    const userId = req.user!.userId
    if (dispute.filedBy !== userId && dispute.filedAgainst !== userId) {
      error(res, 'Not a party to this dispute', 403); return
    }

    const files = req.files as Express.Multer.File[]
    if (!files?.length) { error(res, 'No files uploaded'); return }

    const newEvidence = files.map((f) => {
      const isImage = f.mimetype.startsWith('image/')
      const isVideo = f.mimetype.startsWith('video/')
      return {
        type: isImage ? 'image' : isVideo ? 'video' : 'document',
        url: `/uploads/${f.filename}`,
        description: (req.body.description as string) || f.originalname,
        uploadedAt: new Date().toISOString(),
      }
    })

    dispute.evidence.push(...newEvidence)
    await dispute.save()

    success(res, { evidence: dispute.evidence }, `${files.length} evidence files uploaded`)
  },
}
