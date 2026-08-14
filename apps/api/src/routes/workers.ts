import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { Worker } from '../models/Worker.js'
import { ServiceBooking } from '../models/ServiceBooking.js'
import { success, error } from '../utils/response.js'
import { escapeRegex } from '../utils/params.js'

const router = Router()

/* ================================================================
   GET /api/workers — list workers with filters
   ================================================================ */
const listSchema = z.object({
  trade: z.string().optional(),
  location: z.string().optional(),
  emergency: z.coerce.boolean().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  verified: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

router.get('/', authenticate, async (req, res) => {
  const parsed = listSchema.safeParse(req.query)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const { trade, location, emergency, minRating, verified, page, limit } = parsed.data

  // Public directory lists admin-approved workers only (KYC gate).
  const filter: Record<string, unknown> = { status: { $in: ['available', 'busy'] }, approvalStatus: 'approved' }
  if (trade) filter.trades = { $in: [trade] }
  if (location) filter.location = { $regex: new RegExp(escapeRegex(location), 'i') }
  if (emergency) filter.emergencyAvailable = true
  if (minRating !== undefined) filter.rating = { $gte: minRating }
  if (verified) filter.verificationLevel = { $in: ['verified', 'premium'] }

  const allWorkers = await Worker.find(filter).lean()
  const verificationRank: Record<string, number> = { none: 0, basic: 1, verified: 2, premium: 3 }
  allWorkers.sort((a, b) => (verificationRank[b.verificationLevel] ?? 0) - (verificationRank[a.verificationLevel] ?? 0) || b.rating - a.rating || b.completedJobs - a.completedJobs)
  const total = allWorkers.length
  const skip = (page - 1) * limit
  const workers = allWorkers.slice(skip, skip + limit)
  success(res, {
    items: workers,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
})

/* ================================================================
   GET /api/workers/me — my own worker profile (or null)
   NOTE: must precede GET /:id or 'me' would be treated as an id.
   ================================================================ */
router.get('/me', authenticate, async (req, res) => {
  const worker = await Worker.findOne({ userId: req.user!.userId }).lean()
  success(res, { worker: worker ?? null })
})

/* ================================================================
   GET /api/workers/me/earnings — the service provider's earnings
   dashboard numbers, derived from their bookings.
   ================================================================ */
router.get('/me/earnings', authenticate, async (req, res) => {
  const worker = await Worker.findOne({ userId: req.user!.userId }).lean()
  if (!worker) { error(res, 'Create your worker profile first', 400); return }
  const workerUserId = req.user!.userId

  const bookings = await ServiceBooking.find({ workerUserId }).lean()
  const price = (b: (typeof bookings)[number]) => b.finalCost ?? b.quoteAmount ?? b.estimatedCost ?? 0

  const completed = bookings.filter((b) => b.status === 'completed')
  const active = bookings.filter((b) => b.status === 'confirmed' || b.status === 'in_progress')

  const totalEarned = completed.reduce((s, b) => s + price(b), 0)
  const totalPaid = completed.reduce((s, b) => s + (b.paymentAmount ?? 0), 0)
  // Pending payout: agreed price not yet marked paid (partial counts the remainder).
  const pendingPayout = completed
    .filter((b) => b.paymentStatus !== 'paid')
    .reduce((s, b) => s + Math.max(0, price(b) - (b.paymentAmount ?? 0)), 0)

  // Per-job-type breakdown (completed only)
  const byTypeMap = new Map<string, { jobs: number; total: number }>()
  for (const b of completed) {
    const entry = byTypeMap.get(b.type) ?? { jobs: 0, total: 0 }
    entry.jobs += 1
    entry.total += price(b)
    byTypeMap.set(b.type, entry)
  }

  // Last 6 months of completed jobs (count + total per month)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const byMonthMap = new Map<string, { jobs: number; total: number }>()
  for (const b of completed.filter((x) => new Date(x.createdAt) >= sixMonthsAgo)) {
    const key = new Date(b.createdAt).toISOString().slice(0, 7)
    const entry = byMonthMap.get(key) ?? { jobs: 0, total: 0 }
    entry.jobs += 1
    entry.total += price(b)
    byMonthMap.set(key, entry)
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  success(res, {
    totalEarned: round2(totalEarned),
    totalPaid: round2(totalPaid),
    pendingPayout: round2(pendingPayout),
    completedJobs: completed.length,
    activeJobs: active.length,
    rating: worker.rating,
    reviewCount: worker.reviewCount,
    byType: [...byTypeMap.entries()].map(([type, v]) => ({ type, jobs: v.jobs, total: round2(v.total) })),
    byMonth: [...byMonthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, jobs: v.jobs, total: round2(v.total) })),
  })
})

/* ================================================================
   GET /api/workers/:id — get worker details
   ================================================================ */
router.get('/:id', authenticate, async (req, res) => {
  const worker = await Worker.findById(req.params.id).lean()
  if (!worker) { error(res, 'Worker not found', 404); return }
  // Unapproved profiles are hidden from the public — only the owner and
  // admins can view them (the owner needs access to edit while pending).
  const isOwner = worker.userId === req.user?.userId
  const isAdmin = req.user?.roles?.includes('admin') || req.user?.roles?.includes('super_admin')
  if (worker.approvalStatus !== 'approved' && !isOwner && !isAdmin) {
    error(res, 'Worker not found', 404)
    return
  }
  success(res, worker)
})

/* ================================================================
   POST /api/workers — create worker profile
   ================================================================ */
const createSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().email().optional(),
  photo: z.string().optional(),
  trades: z.array(z.string()).min(1, 'Select at least one trade'),
  skills: z.array(z.string()).default([]),
  bio: z.string().default(''),
  location: z.string().min(1),
  serviceRadiusKm: z.number().min(1).default(10),
  hourlyRate: z.number().positive().optional(),
  fixedRates: z.array(z.object({ service: z.string(), price: z.number() })).default([]),
  availability: z.object({
    monday: z.array(z.string()).default([]),
    tuesday: z.array(z.string()).default([]),
    wednesday: z.array(z.string()).default([]),
    thursday: z.array(z.string()).default([]),
    friday: z.array(z.string()).default([]),
    saturday: z.array(z.string()).default([]),
    sunday: z.array(z.string()).default([]),
  }).optional(),
  emergencyAvailable: z.boolean().default(false),
})

router.post('/', authenticate, async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  // One worker profile per user — prevents unbounded duplicate/spam profiles.
  if (await Worker.exists({ userId: req.user?.userId })) {
    error(res, 'You already have a worker profile', 409)
    return
  }

  const worker = await Worker.create({
    ...parsed.data,
    userId: req.user?.userId,
  })
  success(res, worker, 'Worker profile created', 201)
})

/* ================================================================
   PATCH /api/workers/:id — update worker profile
   ================================================================ */
const updateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(5).optional(),
  email: z.string().email().optional(),
  photo: z.string().optional(),
  trades: z.array(z.string()).min(1, 'Select at least one trade').optional(),
  skills: z.array(z.string()).optional(),
  bio: z.string().optional(),
  location: z.string().min(1).optional(),
  serviceRadiusKm: z.number().min(1).optional(),
  hourlyRate: z.number().positive().optional(),
  fixedRates: z.array(z.object({ service: z.string(), price: z.number() })).optional(),
  availability: z.object({
    monday: z.array(z.string()).optional(),
    tuesday: z.array(z.string()).optional(),
    wednesday: z.array(z.string()).optional(),
    thursday: z.array(z.string()).optional(),
    friday: z.array(z.string()).optional(),
    saturday: z.array(z.string()).optional(),
    sunday: z.array(z.string()).optional(),
  }).optional(),
  status: z.enum(['available', 'busy', 'offline']).optional(),
  emergencyAvailable: z.boolean().optional(),
  portfolio: z.array(z.string()).max(20).optional(),
})

router.patch('/:id', authenticate, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const worker = await Worker.findById(req.params.id)
  if (!worker) { error(res, 'Worker not found', 404); return }

  // Only allow updating own profile or admin
  const isOwner = worker.userId === req.user?.userId
  if (!isOwner && !req.user?.roles?.includes('admin') && !req.user?.roles?.includes('super_admin')) {
    error(res, 'Unauthorized', 403); return
  }

  Object.assign(worker, parsed.data)
  // Owner self-edits to an approved profile re-queue it for admin review (same
  // pattern as financiers/insurance providers). Admin corrections don't.
  if (isOwner && worker.approvalStatus === 'approved') {
    worker.approvalStatus = 'pending'
    worker.approvedBy = undefined
    worker.approvedAt = undefined
  }
  await worker.save()
  success(res, worker)
})

/* ================================================================
   GET /api/workers/trades/list — list available trades
   ================================================================ */
router.get('/trades/list', authenticate, async (_req, res) => {
  const trades = await Worker.distinct('trades')
  success(res, { trades })
})

/* ================================================================
   GET /api/workers/:id/reviews — reviews from completed bookings
   ================================================================ */
router.get('/:id/reviews', authenticate, async (req, res) => {
  const bookings = await ServiceBooking.find({
    workerId: req.params.id,
    status: 'completed',
    rating: { $exists: true, $ne: null },
  }).sort({ createdAt: -1 }).limit(20).lean()

  const reviews = bookings.map((b) => ({
    id: (b._id as { toString(): string }).toString(),
    rating: b.rating,
    review: b.review,
    createdAt: b.createdAt,
    type: b.type,
  })).filter((r) => r.rating !== undefined)

  success(res, { reviews })
})

export default router
