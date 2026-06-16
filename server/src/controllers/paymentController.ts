import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { Payment } from '../models/Payment.js'
import { Agreement } from '../models/Agreement.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { getProvider } from '../services/payments/index.js'
import type { ProviderId } from '../services/payments/types.js'

export const paymentController = {
  create: async (req: Request, res: Response) => {
    const { agreementId, method, amount: requestedAmount } = req.body
    if (!agreementId || !method) {
      error(res, 'agreementId and method are required')
      return
    }

    const agreement = await Agreement.findById(agreementId)
    if (!agreement) { error(res, 'Agreement not found', 404); return }
    if (agreement.tenantId !== req.user!.userId) {
      error(res, 'Not authorized', 403)
      return
    }

    const amount = Number(requestedAmount) || agreement.rentAmount
    if (amount <= 0) {
      error(res, 'Amount must be greater than 0')
      return
    }
    if (amount > agreement.rentAmount * 2) {
      error(res, 'Amount exceeds the maximum allowed payment')
      return
    }

    const reference = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    const payment = await Payment.create({
      agreementId,
      tenantId: req.user!.userId,
      landlordId: agreement.landlordId,
      amount,
      method,
      status: 'pending',
      reference,
    })

    const provider = getProvider(method as ProviderId)
    const result = await provider.initiateCollection({
      amount,
      phone: '',
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
  },

  list: async (req: Request, res: Response) => {
    const userId = req.user!.userId
    const isAdmin = req.user!.roles.includes('admin') || req.user!.roles.includes('super_admin')
    const filter = isAdmin ? {} : { $or: [{ tenantId: userId }, { landlordId: userId }] }
    const payments = await Payment.find(filter).sort({ createdAt: -1 }).lean()
    const items = payments.map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() }))
    success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
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
