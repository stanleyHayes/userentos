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

export const disputeController = {
  list: async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const roles = req.user!.roles
    const isGov = roles.includes('government') || roles.includes('admin') || roles.includes('super_admin') || roles.includes('legal_officer')

    const filter = isGov ? {} : { $or: [{ filedBy: userId }, { filedAgainst: userId }] }
    const disputes = await Dispute.find(filter).sort({ createdAt: -1 }).lean()
    const items = disputes.map((d) => ({ ...d, id: (d._id as Types.ObjectId).toString() }))
    success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
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

    // The accused must be a real user.
    const accused = await User.findById(parsed.data.filedAgainst).select('_id').lean()
    if (!accused) { error(res, 'The user this dispute is filed against does not exist', 404); return }

    const dispute = await Dispute.create({
      ...parsed.data,
      filedBy: userId,
      status: 'filed',
      evidence: [],
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

    const { status, mediationNotes, resolution, assignedTo } = req.body
    if (status) dispute.status = status
    if (mediationNotes) dispute.mediationNotes = mediationNotes
    if (resolution) dispute.resolution = resolution
    if (assignedTo) dispute.assignedTo = assignedTo
    await dispute.save()

    // Notify both parties of status change
    if (status) {
      notifyDisputeUpdate(dispute.filedBy, dispute.title, status)
      notifyDisputeUpdate(dispute.filedAgainst, dispute.title, status)
      if (status === 'resolved' || status === 'closed') {
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
