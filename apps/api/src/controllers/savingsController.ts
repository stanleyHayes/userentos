import { recordCollectionInitiation, recordRefusedCollection, recordUncertainCollection } from '../services/payments/collectionInitiation.js'
import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { Wallet } from '../models/Wallet.js'
import { Payment, type IPayment } from '../models/Payment.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { checkAndAward } from '../services/achievements.js'
import { collectionCorrelator, getProvider, isMethodAvailable } from '../services/payments/index.js'
import { isDuplicateKey, requireIdempotencyKey, respondCollectionRefused } from '../services/payments/checkout.js'
import { withMoneyTransaction } from '../services/payments/moneyTransaction.js'
import { CollectionRefusedError, type ProviderId } from '../services/payments/types.js'
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

    const roundedAmount = round2(amount)
    if (roundedAmount <= 0 || !Number.isSafeInteger(Math.round(roundedAmount * 100))) {
      error(res, 'Enter a valid amount of at least GHS 0.01'); return
    }
    // Required: a retry after a lost response must find this deposit, not start another.
    const idempotencyKey = requireIdempotencyKey(req, res)
    if (!idempotencyKey) return
    const matches = (existing: { purpose: string; method: string; amount: number }) => existing.purpose === 'wallet_deposit' && existing.method === method && existing.amount === roundedAmount
    const existingResult = async () => {
      const existing = await Payment.findOne({ idempotencyKey, tenantId: req.user!.userId }).lean()
      if (!existing) return false
      if (!matches(existing)) { error(res, 'Idempotency-Key was already used for a different payment', 409); return true }
      success(res, { payment: { ...existing, id: existing._id.toString() }, instructions: existing.providerInstructions }, 'Payment already initiated')
      return true
    }
    if (await existingResult()) return
    if (!isMethodAvailable(method as ProviderId)) {
      error(res, 'That payment method is not available right now. Please choose another.', 422); return
    }
    const reference = `DEP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const provider = getProvider(method as ProviderId)
    // Saved before the provider is called, so an interrupted initiation is still reconcilable.
    const providerRef = collectionCorrelator(provider, reference)
    let payment: IPayment | undefined
    try {
      payment = await Payment.create({
        collectionSource: provider.source, providerRef, tenantId: req.user!.userId, amount: roundedAmount,
        method, status: 'pending', reference, purpose: 'wallet_deposit', idempotencyKey,
      })
      const result = await provider.initiateCollection({ amount: roundedAmount, phone: phone ?? '', reference, providerRef, narration: 'RentOS wallet deposit', payerEmail: req.user!.email })
      const recorded = await recordCollectionInitiation(payment._id.toString(), result)
      if (!recorded) throw new Error('Payment record unavailable after initiation')
      success(res, { payment: { ...recorded, id: recorded._id.toString() }, instructions: result.instructions }, 'Deposit initiated — your wallet is credited after confirmation', 201)
    } catch (failure) {
      if (!payment && isDuplicateKey(failure) && await existingResult()) return
      if (payment && failure instanceof CollectionRefusedError) {
        const refused = await recordRefusedCollection(payment._id.toString(), failure.reason).catch(() => null)
        if (refused) { respondCollectionRefused(res, refused, failure.reason); return }
      }
      if (payment) await recordUncertainCollection(payment._id.toString()).catch(() => undefined)
      throw failure
    }
  },

  withdraw: async (req: Request, res: Response) => {
    const parsed = amountMethodSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    // Withdrawals moved to the payout rail (POST /api/payouts), which debits
    // the wallet, sends the money through the PSP, and refunds if the transfer
    // fails. Debiting here would burn the balance with nothing behind it, so
    // this endpoint points callers at the real one instead.
    error(res, 'Use POST /api/payouts to withdraw to your mobile money or bank account', 410)
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

    // The debit and the plan credit are one transaction: neither lands alone.
    // (On a standalone Mongo the debit is compensated instead.)
    const value = round2(amount)
    const reference = `SAV-${Date.now()}`
    const updatedPlan = await withMoneyTransaction(async ({ session, onRollback }) => {
      const debited = await debitWallet(req.user!.userId, value, {
        type: 'rent_payment',
        reference,
        description: 'Savings contribution to plan',
      }, { session })
      if (!debited) return null
      onRollback(() => creditWallet(req.user!.userId, value, { type: 'refund', reference: `SAV-REV-${Date.now()}`, description: 'Reversal of failed savings contribution' }))
      const credited = await SavingsPlan.findOneAndUpdate(
        { _id: plan._id },
        [{ $set: { currentAmount: { $round: [{ $add: [{ $ifNull: ['$currentAmount', 0] }, value] }, 2] } } }],
        { session, returnDocument: 'after', updatePipeline: true },
      ) as unknown as typeof plan | null
      if (!credited) throw new Error('Savings plan disappeared during the contribution')
      return credited
    })
    if (!updatedPlan) { error(res, 'Insufficient wallet balance'); return }
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
