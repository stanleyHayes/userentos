import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { ServiceBooking } from '../models/ServiceBooking.js'
import { Worker } from '../models/Worker.js'
import { success, error } from '../utils/response.js'
import { emitBookingCreated, emitBookingUpdated } from '../services/bookingEvents.js'

const router = Router()

/** Admin override — super_admin included (requireRole bypasses for it, so
 * in-route checks must too, or the highest-privileged role gets 403s). */
function isAdminUser(roles?: string[]): boolean {
  return !!roles && (roles.includes('admin') || roles.includes('super_admin'))
}

/* ================================================================
   GET /api/service-bookings — list bookings for current user
   ================================================================ */
const listSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'disputed']).optional(),
  asWorker: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

router.get('/', authenticate, async (req, res) => {
  const parsed = listSchema.safeParse(req.query)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const { status, asWorker, page, limit } = parsed.data
  const userId = req.user?.userId

  // Worker-side queries must match the worker's USER id, not the Worker doc id.
  const filter: Record<string, unknown> = asWorker
    ? { workerUserId: userId }
    : { requesterId: userId }

  if (status) filter.status = status

  const skip = (page - 1) * limit
  const [bookings, total] = await Promise.all([
    ServiceBooking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ServiceBooking.countDocuments(filter),
  ])

  // Enrich with worker names
  const workerIds = [...new Set(bookings.map(b => b.workerId))]
  const workers = await Worker.find({ _id: { $in: workerIds } }).select('name phone photo trades').lean()
  const workerMap = new Map(workers.map(w => [String(w._id), w]))

  const enriched = bookings.map(b => ({
    ...b,
    worker: workerMap.get(b.workerId) || null,
  }))

  success(res, {
    items: enriched,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
})

/* ================================================================
   POST /api/service-bookings — create a booking
   ================================================================ */
const createSchema = z.object({
  workerId: z.string(),
  propertyId: z.string().optional(),
  maintenanceRequestId: z.string().optional(),
  type: z.enum(['maintenance', 'cleaning', 'repair', 'installation', 'inspection', 'emergency', 'other']).default('maintenance'),
  description: z.string().min(5),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
  estimatedCost: z.number().positive().optional(),
})

router.post('/', authenticate, async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const worker = await Worker.findById(parsed.data.workerId)
  if (!worker) { error(res, 'Worker not found', 404); return }

  // No self-dealing: booking your own worker profile lets you self-confirm →
  // self-complete → self-rate, inflating the marketplace ranking stats.
  if (worker.userId === req.user!.userId) {
    error(res, 'You cannot book yourself', 403)
    return
  }

  const booking = await ServiceBooking.create({
    ...parsed.data,
    // Round the budget estimate to 2 dp (GHS pesewas) so float noise can't persist.
    estimatedCost: parsed.data.estimatedCost === undefined
      ? undefined
      : Math.round(parsed.data.estimatedCost * 100) / 100,
    // Link the worker's platform user id so worker-side listing, authorization,
    // and real-time/push notifications actually reach the worker.
    workerUserId: worker.userId,
    requesterId: req.user?.userId,
    requesterRole: (req.user?.activeRole || 'tenant') as 'tenant' | 'landlord' | 'property_manager',
  })

  // Notify worker in real-time
  await emitBookingCreated(booking)

  success(res, booking, 'Booking created', 201)
})

/* ================================================================
   GET /api/service-bookings/:id — get booking details
   ================================================================ */
router.get('/:id', authenticate, async (req, res) => {
  const booking = await ServiceBooking.findById(req.params.id).lean()
  if (!booking) { error(res, 'Booking not found', 404); return }

  // Check access (worker matched by their USER id, not the Worker doc id).
  if (booking.requesterId !== req.user?.userId && booking.workerUserId !== req.user?.userId && !isAdminUser(req.user?.roles)) {
    error(res, 'Unauthorized', 403); return
  }

  const worker = await Worker.findById(booking.workerId).select('name phone photo trades rating').lean()
  success(res, { ...booking, worker })
})

/* ================================================================
   PATCH /api/service-bookings/:id — update booking status
   ================================================================ */
const updateSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'disputed']).optional(),
  scheduledDate: z.string().optional(),
  scheduledTime: z.string().optional(),
  quoteAmount: z.number().positive().optional(),
  quoteAccepted: z.boolean().optional(),
  finalCost: z.number().nonnegative().optional(),
  paymentStatus: z.enum(['pending', 'partial', 'paid']).optional(),
  paymentAmount: z.number().nonnegative().optional(),
  rating: z.number().min(1).max(5).optional(),
  review: z.string().min(3).max(500).optional(),
  note: z.string().optional(),
})

router.patch('/:id', authenticate, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const booking = await ServiceBooking.findById(req.params.id)
  if (!booking) { error(res, 'Booking not found', 404); return }

  const isRequester = booking.requesterId === req.user?.userId
  const isWorker = !!booking.workerUserId && booking.workerUserId === req.user?.userId
  const isAdmin = isAdminUser(req.user?.roles)

  if (!isRequester && !isWorker && !isAdmin) {
    error(res, 'Unauthorized', 403); return
  }

  // Enforce a valid status state machine so neither party can jump a booking to an
  // illegitimate state (pending -> completed, reopening a cancelled job, etc.).
  // Admins may override to resolve disputes.
  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    pending:     ['confirmed', 'cancelled'],
    confirmed:   ['in_progress', 'cancelled'],
    in_progress: ['completed', 'disputed'],
    completed:   ['disputed'],
    cancelled:   [],
    disputed:    [],
  }
  const nextStatus = parsed.data.status
  if (nextStatus !== undefined && nextStatus !== booking.status && !isAdmin) {
    if (!(ALLOWED_TRANSITIONS[booking.status] ?? []).includes(nextStatus)) {
      error(res, `Cannot change booking from '${booking.status}' to '${nextStatus}'`, 409); return
    }
    // Match the UI: only the requester cancels; only the worker confirms/starts work.
    // Completion and disputes may be raised by either participant.
    if (nextStatus === 'cancelled' && !isRequester) {
      error(res, 'Only the requester can cancel this booking', 403); return
    }
    if ((nextStatus === 'confirmed' || nextStatus === 'in_progress') && !isWorker) {
      error(res, 'Only the worker can update job progress', 403); return
    }
  }

  // Capture prior status BEFORE Object.assign overwrites it (needed for idempotency).
  const wasCompleted = booking.status === 'completed'

  const updates = { ...parsed.data }
  delete (updates as { note?: string }).note

  // Normalize money to 2 dp (GHS pesewas) so float quotes/costs can't persist noise.
  const round2 = (n?: number) => (n === undefined ? n : Math.round(n * 100) / 100)
  if (updates.quoteAmount !== undefined) updates.quoteAmount = round2(updates.quoteAmount)
  if (updates.finalCost !== undefined) updates.finalCost = round2(updates.finalCost)
  if (updates.paymentAmount !== undefined) updates.paymentAmount = round2(updates.paymentAmount)

  // Quote can only be provided by worker
  if (parsed.data.quoteAmount !== undefined && !isWorker && !isAdmin) {
    error(res, 'Only the worker can provide a quote', 403); return
  }
  // Keep quoteProvided consistent with quoteAmount so consumers don't read a stale flag.
  if (parsed.data.quoteAmount !== undefined) {
    booking.quoteProvided = true
  }

  // Cost/payment fields: the final price is the worker's to set, and only the
  // worker (payee) can confirm money arrived — a requester must never mark
  // their own booking 'paid' without paying.
  if (parsed.data.finalCost !== undefined && !isWorker && !isAdmin) {
    error(res, 'Only the worker can set the final cost', 403); return
  }
  if (parsed.data.paymentStatus !== undefined && !isWorker && !isAdmin) {
    error(res, 'Only the worker can update payment status', 403); return
  }
  if (parsed.data.paymentAmount !== undefined && parsed.data.paymentAmount > (booking.finalCost ?? booking.quoteAmount ?? Infinity) + 0.009) {
    error(res, 'paymentAmount exceeds the agreed cost'); return
  }

  // Rating/review only by requester, and only once the job is actually completed
  // — ratings on pending bookings would let anyone farm the marketplace ranking.
  if ((parsed.data.rating !== undefined || parsed.data.review !== undefined) && !isRequester) {
    error(res, 'Only the requester can rate', 403); return
  }
  if ((parsed.data.rating !== undefined || parsed.data.review !== undefined) && booking.status !== 'completed') {
    error(res, 'You can only rate a completed booking', 409); return
  }

  // Apply updates
  Object.assign(booking, updates)

  if (parsed.data.note) {
    booking.notes.push({
      text: parsed.data.note,
      by: req.user?.userId || 'unknown',
      at: new Date().toISOString(),
    })
  }

  // Increment completed jobs only on the real transition into 'completed' —
  // previously any PATCH with status:'completed' re-incremented, letting a worker
  // inflate their stats (which drive search ranking) by repeating the request.
  if (parsed.data.status === 'completed' && !wasCompleted) {
    await Worker.findByIdAndUpdate(booking.workerId, { $inc: { completedJobs: 1 } })
  }

  await booking.save()

  // Recompute the worker's rating + reviewCount from all rated bookings so the
  // marketplace minRating filter and rating sort actually work (never updated before).
  if (parsed.data.rating !== undefined) {
    const rated = await ServiceBooking.find({ workerId: booking.workerId, rating: { $gt: 0 } }).select('rating').lean()
    const count = rated.length
    const avg = count ? rated.reduce((s, b) => s + (b.rating || 0), 0) / count : 0
    await Worker.findByIdAndUpdate(booking.workerId, { $set: { rating: Math.round(avg * 10) / 10, reviewCount: count } })
  }

  // Determine what changed for notifications
  const changedFields = Object.keys(parsed.data).filter((k) => k !== 'note')
  if (parsed.data.note) changedFields.push('note')
  if (changedFields.length > 0) {
    await emitBookingUpdated(booking, changedFields)
  }

  success(res, booking)
})

/* ================================================================
   GET /api/service-bookings/:id/notes — get notes
   ================================================================ */
router.get('/:id/notes', authenticate, async (req, res) => {
  const booking = await ServiceBooking.findById(req.params.id).lean()
  if (!booking) { error(res, 'Booking not found', 404); return }

  if (booking.requesterId !== req.user?.userId && booking.workerUserId !== req.user?.userId && !isAdminUser(req.user?.roles)) {
    error(res, 'Unauthorized', 403); return
  }

  success(res, { notes: booking.notes })
})

export default router
