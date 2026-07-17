import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { Payment } from '../models/Payment.js'
import { Agreement } from '../models/Agreement.js'
import { success, error } from '../utils/response.js'
import { param, escapeRegex } from '../utils/params.js'
import { getProvider } from '../services/payments/index.js'
import type { ProviderId } from '../services/payments/types.js'
import { round2 } from '../utils/money.js'

const MOBILE_MONEY_METHODS = new Set(['mtn_momo', 'telecel_cash', 'airteltigo_money'])

const createSchema = z.object({
  agreementId: z.string().min(1),
  method: z.enum(['mtn_momo', 'telecel_cash', 'airteltigo_money', 'bank_transfer']),
  amount: z.number().positive().optional(),
  phone: z.string().min(9).max(15).optional(),
})

export const paymentController = {
  create: async (req: Request, res: Response) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
    const { agreementId, method, amount: requestedAmount, phone } = parsed.data

    // The provider collects from this number — without it every live
    // mobile-money collection is guaranteed to fail.
    if (MOBILE_MONEY_METHODS.has(method) && !phone) {
      error(res, 'phone is required for mobile money payments')
      return
    }

    // Idempotency: a retried request returns the original payment instead of
    // creating a duplicate pending one.
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined
    if (idempotencyKey) {
      const existing = await Payment.findOne({ idempotencyKey }).lean()
      if (existing) {
        success(res, { payment: { ...existing, id: (existing._id as Types.ObjectId).toString() } }, 'Payment already initiated')
        return
      }
    }

    const agreement = await Agreement.findById(agreementId)
    if (!agreement) { error(res, 'Agreement not found', 404); return }
    if (agreement.tenantId !== req.user!.userId) {
      error(res, 'Not authorized', 403)
      return
    }

    const amount = round2(requestedAmount ?? agreement.rentAmount)
    if (amount <= 0) {
      error(res, 'Amount must be greater than 0')
      return
    }
    if (amount > agreement.rentAmount * 2) {
      error(res, 'Amount exceeds the maximum allowed payment')
      return
    }

    const reference = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    try {
      const payment = await Payment.create({
        agreementId,
        tenantId: req.user!.userId,
        landlordId: agreement.landlordId,
        amount,
        method,
        status: 'pending',
        reference,
        purpose: 'rent',
        ...(idempotencyKey ? { idempotencyKey } : {}),
      })

      const provider = getProvider(method as ProviderId)
      const result = await provider.initiateCollection({
        amount,
        phone: phone ?? '',
        reference,
        narration: `Rent payment for ${agreement.propertyId}`,
      })

      payment.providerRef = result.providerRef
      payment.providerStatus = result.status
      await payment.save()

      success(
        res,
        {
          payment: { ...payment.toObject(), id: payment._id.toString() },
          instructions: result.instructions,
        },
        'Payment initiated',
        201,
      )
    } catch (err) {
      // Lost the idempotency race — another request created it first.
      if (idempotencyKey && (err as { code?: number }).code === 11000) {
        const existing = await Payment.findOne({ idempotencyKey }).lean()
        if (existing) {
          success(res, { payment: { ...existing, id: (existing._id as Types.ObjectId).toString() } }, 'Payment already initiated')
          return
        }
      }
      throw err
    }
  },

  list: async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const isAdmin = req.user!.roles.includes('admin') || req.user!.roles.includes('super_admin')
    const filter: Record<string, unknown> = isAdmin ? {} : { $or: [{ tenantId: userId }, { landlordId: userId }] }

    // Server-side filters (escaped — never raw $regex from user input)
    const { status, method, search, sort, order } = req.query
    if (typeof status === 'string' && ['pending', 'processing', 'completed', 'failed', 'refunded'].includes(status)) {
      filter.status = status
    }
    if (typeof method === 'string' && ['mtn_momo', 'telecel_cash', 'airteltigo_money', 'bank_transfer'].includes(method)) {
      filter.method = method
    }
    if (typeof search === 'string' && search.trim()) {
      filter.reference = { $regex: escapeRegex(search.trim()), $options: 'i' }
    }

    const page = Math.max(1, Math.floor(Number(req.query.page) || 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.pageSize) || 20)))
    const skip = (page - 1) * pageSize
    const sortField = sort === 'amount' ? 'amount' : 'createdAt'
    const sortDir = order === 'asc' ? 1 as const : -1 as const

    const [total, payments, summaryAgg] = await Promise.all([
      Payment.countDocuments(filter),
      Payment.find(filter).sort({ [sortField]: sortDir }).skip(skip).limit(pageSize).lean(),
      // Aggregates over the WHOLE filtered set (not the page) so summary cards stay correct
      Payment.aggregate([
        { $match: filter },
        { $group: {
          _id: null,
          totalPaid: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] } },
          completedCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          pendingAmount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          failedCount: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        } },
      ]),
    ])
    const items = payments.map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() }))
    const s = summaryAgg[0] ?? {}
    success(res, {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary: {
        totalPaid: s.totalPaid ?? 0,
        completedCount: s.completedCount ?? 0,
        avgPayment: (s.completedCount ?? 0) > 0 ? (s.totalPaid ?? 0) / s.completedCount : 0,
        pendingAmount: s.pendingAmount ?? 0,
        pendingCount: s.pendingCount ?? 0,
        failedCount: s.failedCount ?? 0,
      },
    })
  },

  getById: async (req: Request, res: Response) => {
    const payment = await Payment.findById(param(req.params.id)).lean()
    if (!payment) { error(res, 'Payment not found', 404); return }

    const userId = req.user!.userId
    const isAdmin = req.user!.roles.includes('admin') || req.user!.roles.includes('super_admin')
    if (payment.tenantId !== userId && payment.landlordId !== userId && !isAdmin) {
      error(res, 'Not authorized', 403)
      return
    }

    success(res, { ...payment, id: (payment._id as Types.ObjectId).toString() })
  },
}
