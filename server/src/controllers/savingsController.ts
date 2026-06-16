import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { Wallet } from '../models/Wallet.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { checkAndAward } from '../services/achievements.js'

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

  deposit: async (req: Request, res: Response) => {
    const parsed = amountMethodSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

    // Atomic credit so concurrent deposits can't lose updates.
    const wallet = await Wallet.findOneAndUpdate(
      { userId: req.user!.userId },
      { $inc: { balance: parsed.data.amount } },
      { new: true },
    )
    if (!wallet) { error(res, 'Wallet not found', 404); return }

    const tx = {
      type: 'deposit',
      amount: parsed.data.amount,
      balanceAfter: wallet.balance,
      reference: `DEP-${Date.now()}`,
      description: `Deposit via ${parsed.data.method.replace('_', ' ')}`,
      createdAt: new Date().toISOString(),
    }
    await Wallet.updateOne({ userId: req.user!.userId }, { $push: { transactions: tx } })
    wallet.transactions.push(tx)

    success(res, { wallet: { ...wallet.toObject(), id: wallet._id.toString() }, transaction: tx })
  },

  withdraw: async (req: Request, res: Response) => {
    const parsed = amountMethodSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

    const tx = {
      type: 'withdrawal',
      amount: parsed.data.amount,
      balanceAfter: 0,
      reference: `WTH-${Date.now()}`,
      description: `Withdrawal to ${parsed.data.method.replace('_', ' ')}`,
      createdAt: new Date().toISOString(),
    }

    // Atomic conditional debit — only succeeds if the balance covers the amount,
    // preventing concurrent double-withdrawal / negative balance.
    const wallet = await Wallet.findOneAndUpdate(
      { userId: req.user!.userId, balance: { $gte: parsed.data.amount } },
      { $inc: { balance: -parsed.data.amount } },
      { new: true },
    )
    if (!wallet) {
      const exists = await Wallet.exists({ userId: req.user!.userId })
      error(res, exists ? 'Insufficient balance' : 'Wallet not found', exists ? 400 : 404)
      return
    }
    tx.balanceAfter = wallet.balance
    await Wallet.updateOne({ userId: req.user!.userId }, { $push: { transactions: tx } })
    wallet.transactions.push(tx)

    success(res, { wallet: { ...wallet.toObject(), id: wallet._id.toString() }, transaction: tx })
  },

  listPlans: async (req: Request, res: Response) => {
    const plans = await SavingsPlan.find({ userId: req.user!.userId }).lean()
    const items = plans.map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() }))
    success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
  },

  createPlan: async (req: Request, res: Response) => {
    const parsed = createPlanSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

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

    // Atomic conditional debit prevents concurrent double-spend / negative balance.
    const wallet = await Wallet.findOneAndUpdate(
      { userId: req.user!.userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true },
    )
    if (!wallet) { error(res, 'Insufficient wallet balance'); return }

    const tx = {
      type: 'rent_payment',
      amount,
      balanceAfter: wallet.balance,
      reference: `SAV-${Date.now()}`,
      description: 'Savings contribution to plan',
      createdAt: new Date().toISOString(),
    }
    await Wallet.updateOne({ userId: req.user!.userId }, { $push: { transactions: tx } })
    wallet.transactions.push(tx)

    // Atomic plan increment, then compute completion from the updated total.
    const updatedPlan = await SavingsPlan.findByIdAndUpdate(plan._id, { $inc: { currentAmount: amount } }, { new: true }) ?? plan
    const justCompleted = updatedPlan.status !== 'completed' && updatedPlan.currentAmount >= updatedPlan.targetAmount
    if (justCompleted) {
      await SavingsPlan.updateOne({ _id: plan._id }, { $set: { status: 'completed' } })
      updatedPlan.status = 'completed'
      checkAndAward(req.user!.userId, 'savings_goal_hit', { planId: plan._id.toString() })
        .catch((err) => console.warn('[savings/contribute] achievement award failed:', err))
    }

    success(res, { plan: { ...updatedPlan.toObject(), id: updatedPlan._id.toString() }, wallet: { ...wallet.toObject(), id: wallet._id.toString() } })
  },
}
