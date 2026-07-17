import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { Wallet } from '../models/Wallet.js'
import { Payment } from '../models/Payment.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { checkAndAward } from '../services/achievements.js'
import { getProvider } from '../services/payments/index.js'
import type { ProviderId } from '../services/payments/types.js'
import { creditWallet, debitWallet } from '../services/payments/walletLedger.js'
import { round2 } from '../utils/money.js'

const createPlanSchema = z.object({
  targetAmount: z.number().positive(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  contributionAmount: z.number().positive(),
  targetDate: z.string(),
  linkedPropertyId: z.string().optional(),
  linkedAgreementId: z.string().optional(),
  autoDebit: z.boolean().default(false),
})

const amountMethodSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['mtn_momo', 'telecel_cash', 'airteltigo_money', 'bank_transfer']),
})

const depositSchema = amountMethodSchema.extend({
  // Payer MSISDN — required for mobile-money rails, unused for bank_transfer.
  phone: z.string().min(9).max(15).optional(),
})

const MOBILE_MONEY_METHODS = new Set(['mtn_momo', 'telecel_cash', 'airteltigo_money'])

export const savingsController = {
  getWallet: async (req: Request, res: Response) => {
    const wallet = await Wallet.findOne({ userId: req.user!.userId }).lean()
    if (!wallet) { error(res, 'Wallet not found', 404); return }
    const mapped = {
      ...wallet,
      id: (wallet._id as Types.ObjectId).toString(),
      transactions: (wallet.transactions ?? []).map((tx) => ({ ...tx, id: (tx as unknown as { _id?: { toString(): string } })._id?.toString() })),
    }
    success(res, mapped)
  },

  /**
   * Deposit = a real payment collection. The wallet is credited ONLY in the
   * verified finalize path (provider webhook / simulator bridge) — never here.
   * This endpoint previously credited any requested amount immediately, which
   * let anyone mint unbacked balance.
   */
  deposit: async (req: Request, res: Response) => {
    const parsed = depositSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
    const { amount, method, phone } = parsed.data

    if (MOBILE_MONEY_METHODS.has(method) && !phone) {
      error(res, 'phone is required for mobile money deposits')
      return
    }

    const reference = `DEP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const payment = await Payment.create({
      tenantId: req.user!.userId,
      amount: round2(amount),
      method,
      status: 'pending',
      reference,
      purpose: 'wallet_deposit',
    })

    const provider = getProvider(method as ProviderId)
    const result = await provider.initiateCollection({
      amount: round2(amount),
      phone: phone ?? '',
      reference,
      narration: 'RentOS wallet deposit',
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
      'Deposit initiated — your wallet is credited once the payment is confirmed',
      201,
    )
  },

  withdraw: async (req: Request, res: Response) => {
    const parsed = amountMethodSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const debited = await debitWallet(req.user!.userId, parsed.data.amount, {
      type: 'withdrawal',
      reference: `WTH-${Date.now()}`,
      description: `Withdrawal to ${parsed.data.method.replace('_', ' ')}`,
    })
    if (!debited) {
      const exists = await Wallet.exists({ userId: req.user!.userId })
      error(res, exists ? 'Insufficient balance' : 'Wallet not found', exists ? 400 : 404)
      return
    }

    const wallet = await Wallet.findOne({ userId: req.user!.userId }).lean()
    success(res, { wallet: { ...wallet, id: (wallet!._id as Types.ObjectId).toString() } })
  },

  listPlans: async (req: Request, res: Response) => {
    const plans = await SavingsPlan.find({ userId: req.user!.userId }).lean()
    const items = plans.map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() }))
    success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
  },

  createPlan: async (req: Request, res: Response) => {
    const parsed = createPlanSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    const plan = await SavingsPlan.create({
      ...parsed.data,
      userId: req.user!.userId,
      currentAmount: 0,
      startDate: new Date().toISOString(),
      status: 'active',
    })

    // Best-effort: award first_savings_goal achievement if this is the user's first plan
    checkAndAward(req.user!.userId, 'savings_plan_created', { savingsPlanId: plan._id.toString() })
      .catch((err) => console.warn('[savings/create] achievement award failed:', err))

    success(res, { ...plan.toObject(), id: plan._id.toString() }, 'Savings plan created', 201)
  },

  contribute: async (req: Request, res: Response) => {
    const plan = await SavingsPlan.findById(param(req.params.id))
    if (!plan) { error(res, 'Savings plan not found', 404); return }
    if (plan.userId !== req.user!.userId) { error(res, 'Not authorized', 403); return }

    const amount = Number(req.body.amount)
    if (!Number.isFinite(amount) || amount <= 0) { error(res, 'Invalid amount'); return }

    // Debit first; if the plan update fails the debit is compensated below.
    const debited = await debitWallet(req.user!.userId, amount, {
      type: 'rent_payment',
      reference: `SAV-${Date.now()}`,
      description: 'Savings contribution to plan',
    })
    if (!debited) { error(res, 'Insufficient wallet balance'); return }

    let updatedPlan
    try {
      updatedPlan = await SavingsPlan.findByIdAndUpdate(plan._id, { $inc: { currentAmount: round2(amount) } }, { new: true }) ?? plan
    } catch (err) {
      // Plan write failed — refund the debit so the user's money isn't burned.
      await creditWallet(req.user!.userId, amount, {
        type: 'refund',
        reference: `SAV-REV-${Date.now()}`,
        description: 'Reversal of failed savings contribution',
      })
      throw err
    }
    const justCompleted = updatedPlan.status !== 'completed' && updatedPlan.currentAmount >= updatedPlan.targetAmount
    if (justCompleted) {
      await SavingsPlan.updateOne({ _id: plan._id }, { $set: { status: 'completed' } })
      updatedPlan.status = 'completed'
      checkAndAward(req.user!.userId, 'savings_goal_hit', { planId: plan._id.toString() })
        .catch((err) => console.warn('[savings/contribute] achievement award failed:', err))
    }

    const wallet = await Wallet.findOne({ userId: req.user!.userId }).lean()
    success(res, { plan: { ...updatedPlan.toObject(), id: updatedPlan._id.toString() }, wallet: wallet ? { ...wallet, id: (wallet._id as Types.ObjectId).toString() } : undefined })
  },
}
