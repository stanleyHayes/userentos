/**
 * Admin side of the affiliate programme (spec §11).
 *
 * The seller-facing endpoints live in marketplaceCommerce.ts; this file is the
 * back office: who the affiliates are, what they have earned, and the manual
 * gate a commission passes through before it can ever be paid.
 *
 * Every roll-up here is computed by Mongo. An affiliate with a long tail of
 * commissions must not turn a list request into an unbounded find() that is
 * then summed in JS.
 */
import { Router } from 'express'
import { isValidObjectId, type PipelineStage } from 'mongoose'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { AffiliateProfile, AffiliateCommission, AffiliateAttribution } from '../models/Affiliate.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'
import { param, escapeRegex } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'
import { round2 } from '../utils/money.js'

const router = Router()

// The whole file is back office.
router.use(authenticate, requireRole('admin', 'super_admin'))

// ─── Commission state machine ───

export const COMMISSION_STATUSES = ['pending', 'approved', 'payable', 'paid', 'reversed', 'rejected'] as const
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number]

/**
 * Legal moves for a commission, mirroring the enum on AffiliateCommission.
 *
 * `paid`, `rejected` and `reversed` are terminal: money has either left, been
 * refused, or been clawed back with the source transaction, and re-opening any
 * of those would let an admin pay the same commission twice. Reversal is the
 * refund path (see reverseCommissionsFor) and is reachable from every state
 * that has not yet paid out.
 */
const COMMISSION_TRANSITIONS: Record<CommissionStatus, readonly CommissionStatus[]> = {
  pending: ['approved', 'rejected', 'reversed'],
  approved: ['payable', 'rejected', 'reversed'],
  payable: ['paid', 'rejected', 'reversed'],
  paid: [],
  rejected: [],
  reversed: [],
}

/** Whether a commission may move from `from` to `to`. Unknown states move nowhere. */
export function canTransitionCommission(from: string, to: string): boolean {
  const allowed = COMMISSION_TRANSITIONS[from as CommissionStatus]
  return allowed !== undefined && allowed.includes(to as CommissionStatus)
}

/** True when nothing can follow this state. */
export function isTerminalCommissionStatus(status: string): boolean {
  const allowed = COMMISSION_TRANSITIONS[status as CommissionStatus]
  return allowed !== undefined && allowed.length === 0
}

/**
 * The state an admin "approve" advances to. Approval is two steps — a review
 * (`approved`) and a release into the payout queue (`payable`) — so one click
 * can never take a freshly recorded commission all the way to payable.
 */
export function nextApprovalStatus(from: string): CommissionStatus | null {
  if (from === 'pending') return 'approved'
  if (from === 'approved') return 'payable'
  return null
}

// ─── Shared aggregation ───

/**
 * The single commission roll-up used by the list, the detail view and the
 * programme summary, so the three can never drift apart.
 *
 * `approved` and `payable` are summed together: both are money the platform
 * has committed to and has not yet sent.
 */
const COMMISSION_ROLLUP: PipelineStage.Group['$group'] = {
  _id: null,
  count: { $sum: 1 },
  pendingAmount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } },
  pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
  payableAmount: { $sum: { $cond: [{ $in: ['$status', ['approved', 'payable']] }, '$amount', 0] } },
  payableCount: { $sum: { $cond: [{ $in: ['$status', ['approved', 'payable']] }, 1, 0] } },
  paidAmount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
  paidCount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
}

interface CommissionRollup {
  count: number
  pendingAmount: number
  pendingCount: number
  payableAmount: number
  payableCount: number
  paidAmount: number
  paidCount: number
}

const EMPTY_ROLLUP: CommissionRollup = {
  count: 0, pendingAmount: 0, pendingCount: 0,
  payableAmount: 0, payableCount: 0, paidAmount: 0, paidCount: 0,
}

/** Money lands in the response rounded — float drift must not reach the UI. */
function roundRollup(r: CommissionRollup): CommissionRollup {
  return {
    ...r,
    pendingAmount: round2(r.pendingAmount),
    payableAmount: round2(r.payableAmount),
    paidAmount: round2(r.paidAmount),
  }
}

interface CommissionDoc {
  _id: unknown
  affiliateId: string
  event: string
  sourceRef?: string
  ruleSnapshot: { type: string; value: number }
  amount: number
  status: string
  reason?: string
  createdAt?: Date
  updatedAt?: Date
}

function commissionView(c: CommissionDoc) {
  return {
    id: String(c._id),
    affiliateId: c.affiliateId,
    event: c.event,
    sourceRef: c.sourceRef,
    ruleSnapshot: c.ruleSnapshot,
    amount: round2(c.amount),
    status: c.status,
    reason: c.reason,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }
}

interface UserDoc { _id: unknown; firstName?: string; lastName?: string; email?: string; phone?: string }

function displayName(u: UserDoc): string {
  return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || (u.email ?? 'Unknown user')
}

/**
 * A CastError from one junk id would 400 the whole request, so only well-formed
 * ids reach the query and the rest simply resolve to no user.
 */
async function loadUsers(ids: string[]): Promise<Map<string, UserDoc>> {
  const valid = [...new Set(ids.filter((id) => isValidObjectId(id)))]
  if (!valid.length) return new Map()
  const users = await User.find({ _id: { $in: valid } }).select('firstName lastName email phone').lean()
  return new Map(users.map((u) => [String(u._id), u as UserDoc]))
}

const referralLink = (code: string) => `https://userentos.com/?ref=${code}`

// ─── GET / — affiliate roster with per-affiliate earnings ───

/** Query params arrive as '' when a UI clears a filter; treat that as absent. */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

const listQuerySchema = z.object({
  status: z.preprocess(blankToUndefined, z.enum(['active', 'suspended']).optional()),
  search: z.preprocess(blankToUndefined, z.string().trim().min(1).max(120).optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

/** Ceiling on the name/email pre-search so a one-letter query cannot pull the user table. */
const MAX_SEARCH_USERS = 200

router.get('/', asyncHandler(async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const { status, search, page, limit } = parsed.data

  const filter: Record<string, unknown> = {}
  if (status) filter.status = status

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i')
    // Name and email live on the user, not on the profile. Resolving matching
    // users first keeps this a bounded two-step lookup instead of a join across
    // every affiliate profile in the collection.
    const matches = await User.find({ $or: [{ firstName: rx }, { lastName: rx }, { email: rx }] })
      .select('_id').limit(MAX_SEARCH_USERS).lean()
    filter.$or = [{ code: rx }, { userId: { $in: matches.map((u) => String(u._id)) } }]
  }

  const commissionCollection = AffiliateCommission.collection.name
  const attributionCollection = AffiliateAttribution.collection.name

  interface Row {
    _id: unknown
    userId: string
    code: string
    status: string
    suspendedReason?: string
    createdAt?: Date
    updatedAt?: Date
    totals: CommissionRollup
    referrals: { total: number; converted: number }
  }

  const pipeline: PipelineStage[] = [
    { $match: filter },
    { $sort: { createdAt: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    // affiliateId is stored as the profile's _id in string form, so the join
    // key has to be cast rather than matched with localField/foreignField.
    {
      $lookup: {
        from: commissionCollection,
        let: { affiliateKey: { $toString: '$_id' } },
        pipeline: [
          { $match: { $expr: { $eq: ['$affiliateId', '$$affiliateKey'] } } },
          { $group: COMMISSION_ROLLUP },
          { $project: { _id: 0 } },
        ],
        as: 'commissionTotals',
      },
    },
    {
      $lookup: {
        from: attributionCollection,
        let: { affiliateKey: { $toString: '$_id' } },
        pipeline: [
          { $match: { $expr: { $eq: ['$affiliateId', '$$affiliateKey'] }, rejectedReason: { $exists: false } } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              converted: { $sum: { $cond: [{ $ifNull: ['$referredUserId', false] }, 1, 0] } },
            },
          },
          { $project: { _id: 0 } },
        ],
        as: 'referralTotals',
      },
    },
    {
      $addFields: {
        totals: { $ifNull: [{ $first: '$commissionTotals' }, EMPTY_ROLLUP] },
        referrals: { $ifNull: [{ $first: '$referralTotals' }, { total: 0, converted: 0 }] },
      },
    },
    { $project: { commissionTotals: 0, referralTotals: 0 } },
  ]

  const [rows, total, summaryRows] = await Promise.all([
    AffiliateProfile.aggregate<Row>(pipeline),
    AffiliateProfile.countDocuments(filter),
    // Programme-wide figures for the header stats, grouped in Mongo.
    AffiliateCommission.aggregate<CommissionRollup>([{ $group: COMMISSION_ROLLUP }, { $project: { _id: 0 } }]),
  ])

  const userMap = await loadUsers(rows.map((r) => r.userId))

  const items = rows.map((r) => {
    const owner = userMap.get(r.userId)
    return {
      id: String(r._id),
      userId: r.userId,
      code: r.code,
      status: r.status,
      suspendedReason: r.suspendedReason,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      referralLink: referralLink(r.code),
      affiliateName: owner ? displayName(owner) : null,
      affiliateEmail: owner?.email ?? null,
      totals: roundRollup(r.totals),
      referrals: r.referrals,
    }
  })

  success(res, {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    summary: roundRollup(summaryRows[0] ?? EMPTY_ROLLUP),
  })
}))

// ─── GET /:id — one affiliate, its recent commissions and who it referred ───

router.get('/:id', asyncHandler(async (req, res) => {
  const profile = await AffiliateProfile.findById(param(req.params.id)).lean()
  if (!profile) { error(res, 'Affiliate profile not found', 404); return }

  const affiliateKey = String(profile._id)

  const [commissions, attributions, totalsRows] = await Promise.all([
    AffiliateCommission.find({ affiliateId: affiliateKey }).sort({ createdAt: -1 }).limit(50).lean(),
    AffiliateAttribution.find({ affiliateId: affiliateKey, rejectedReason: { $exists: false } })
      .sort({ createdAt: -1 }).limit(50).lean(),
    AffiliateCommission.aggregate<CommissionRollup>([
      { $match: { affiliateId: affiliateKey } },
      { $group: COMMISSION_ROLLUP },
      { $project: { _id: 0 } },
    ]),
  ])

  // One round trip for the affiliate and everyone they referred.
  const referredIds = attributions
    .map((a) => a.referredUserId)
    .filter((id): id is string => typeof id === 'string')
  const userMap = await loadUsers([profile.userId, ...referredIds])
  const owner = userMap.get(profile.userId)

  success(res, {
    id: affiliateKey,
    userId: profile.userId,
    code: profile.code,
    status: profile.status,
    suspendedReason: profile.suspendedReason,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    referralLink: referralLink(profile.code),
    affiliateName: owner ? displayName(owner) : null,
    affiliateEmail: owner?.email ?? null,
    affiliatePhone: owner?.phone ?? null,
    totals: roundRollup(totalsRows[0] ?? EMPTY_ROLLUP),
    commissions: commissions.map((c) => commissionView(c as unknown as CommissionDoc)),
    referrals: attributions.map((a) => {
      const referred = a.referredUserId ? userMap.get(a.referredUserId) : undefined
      return {
        id: String(a._id),
        referredUserId: a.referredUserId ?? null,
        // Anonymous until the referred visitor signs up.
        referredUserName: referred ? displayName(referred) : null,
        source: a.source,
        campaign: a.campaign,
        createdAt: a.createdAt,
        expiresAt: a.expiresAt,
      }
    }),
  })
}))

// ─── Commission review ───

const rejectSchema = z.object({ reason: z.string().trim().min(3).max(300) })

/**
 * Claim the transition with the current status in the filter, so two admins
 * clicking at once cannot both move the same commission.
 */
async function claimTransition(id: string, from: CommissionStatus, to: CommissionStatus, reason?: string) {
  const set: { status: CommissionStatus; reason?: string } = { status: to }
  if (reason !== undefined) set.reason = reason

  return AffiliateCommission.findOneAndUpdate(
    { _id: id, status: from },
    { $set: set },
    { returnDocument: 'after' },
  ).lean()
}

router.post('/commissions/:id/approve', asyncHandler(async (req, res) => {
  const id = param(req.params.id)
  const commission = await AffiliateCommission.findById(id).lean()
  if (!commission) { error(res, 'Commission not found', 404); return }

  const next = nextApprovalStatus(commission.status)
  if (!next || !canTransitionCommission(commission.status, next)) {
    error(res, `This commission is ${commission.status} and cannot be approved any further`, 409)
    return
  }

  const updated = await claimTransition(id, commission.status, next)
  if (!updated) { error(res, 'This commission changed while you were reviewing it — reload and try again', 409); return }

  await recordAudit(req, 'affiliate.commission_approved', 'AffiliateCommission', id, {
    from: commission.status, to: next, amount: commission.amount, affiliateId: commission.affiliateId,
  })

  success(
    res,
    commissionView(updated as unknown as CommissionDoc),
    next === 'payable' ? 'Commission released for payout' : 'Commission approved',
  )
}))

router.post('/commissions/:id/reject', asyncHandler(async (req, res) => {
  const parsed = rejectSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const id = param(req.params.id)
  const commission = await AffiliateCommission.findById(id).lean()
  if (!commission) { error(res, 'Commission not found', 404); return }

  if (!canTransitionCommission(commission.status, 'rejected')) {
    error(res, `This commission is ${commission.status} and can no longer be rejected`, 409)
    return
  }

  const updated = await claimTransition(id, commission.status, 'rejected', parsed.data.reason)
  if (!updated) { error(res, 'This commission changed while you were reviewing it — reload and try again', 409); return }

  await recordAudit(req, 'affiliate.commission_rejected', 'AffiliateCommission', id, {
    from: commission.status, reason: parsed.data.reason, amount: commission.amount, affiliateId: commission.affiliateId,
  })

  success(res, commissionView(updated as unknown as CommissionDoc), 'Commission rejected')
}))

export default router
