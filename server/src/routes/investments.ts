import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { Investment } from '../models/Investment.js'
import { Wallet } from '../models/Wallet.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

const PARTNERS = [
  { id: 'databank', name: 'Databank Financial Services', types: ['treasury_bill', 'government_bond'] },
  { id: 'epack', name: 'Epack Investment Fund', types: ['treasury_bill'] },
]

const RATES = {
  treasury_bill: { '91': 25.5, '182': 27.0, '364': 29.0 },
  government_bond: { '730': 30.5, '1095': 32.0, '1825': 33.5 },
} as Record<string, Record<string, number>>

// Get available investment options
router.get('/options', authenticate, (_req, res) => {
  success(res, {
    partners: PARTNERS,
    rates: RATES,
    disclaimer: 'Returns are not guaranteed by RentOS Ghana. All investments are handled by licensed institutions. Past performance does not guarantee future results.',
  })
})

// Get my investments
router.get('/', authenticate, async (req, res) => {
  const investments = await Investment.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).lean()
  const items = investments.map((i) => ({ ...i, id: (i._id as Types.ObjectId).toString() }))
  success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
})

// Create investment
router.post('/', authenticate, async (req, res) => {
  const schema = z.object({
    type: z.enum(['treasury_bill', 'government_bond']),
    amount: z.number().min(100),
    tenure: z.number().int().positive(),
    partnerId: z.string().min(1),
    riskDisclosureAccepted: z.boolean().refine((v) => v, 'You must accept the risk disclosure'),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const { type, amount, tenure, partnerId } = parsed.data

  // Validate partner
  const partner = PARTNERS.find((p) => p.id === partnerId)
  if (!partner || !partner.types.includes(type)) { error(res, 'Invalid partner for this investment type'); return }

  // Get rate
  const rate = RATES[type]?.[String(tenure)]
  if (!rate) { error(res, `Invalid tenure for ${type}. Options: ${Object.keys(RATES[type] || {}).join(', ')} days`); return }

  const expectedReturn = amount * (rate / 100) * (tenure / 365)
  const now = new Date()
  const maturityDate = new Date(now.getTime() + tenure * 24 * 60 * 60 * 1000)

  // Atomic conditional debit — prevents concurrent double-spend / negative balance.
  const wallet = await Wallet.findOneAndUpdate(
    { userId: req.user!.userId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true },
  )
  if (!wallet) {
    const exists = await Wallet.exists({ userId: req.user!.userId })
    error(res, exists ? 'Insufficient wallet balance' : 'Wallet not found', exists ? 400 : 404)
    return
  }

  // Create the investment; refund the debit if creation fails (no lost money).
  const investment = await Investment.create({
    userId: req.user!.userId,
    type,
    amount,
    interestRate: rate,
    tenure,
    startDate: now.toISOString(),
    maturityDate: maturityDate.toISOString(),
    status: 'active',
    expectedReturn: Math.round(expectedReturn * 100) / 100,
    partnerId,
  }).catch(async () => {
    await Wallet.updateOne({ userId: req.user!.userId }, { $inc: { balance: amount } })
    return null
  })
  if (!investment) { error(res, 'Could not create investment; your wallet has been refunded.', 500); return }

  await Wallet.updateOne({ userId: req.user!.userId }, { $push: { transactions: {
    type: 'withdrawal',
    amount,
    balanceAfter: wallet.balance,
    reference: `INV-${Date.now()}`,
    description: `Investment: ${type.replace('_', ' ')} via ${partner.name}`,
    createdAt: now.toISOString(),
  } } })

  success(res, { investment: { ...investment.toObject(), id: investment._id.toString() }, wallet: { balance: wallet.balance } }, 'Investment created', 201)
})

// Withdraw matured investment
router.post('/:id/withdraw', authenticate, async (req, res) => {
  const investment = await Investment.findById(param(req.params.id))
  if (!investment) { error(res, 'Investment not found', 404); return }
  if (investment.userId !== req.user!.userId) { error(res, 'Not authorized', 403); return }

  // Both 'withdrawn' and 'matured' mean the payout already happened — block re-withdrawal
  // (previously only 'withdrawn' was checked, so a matured investment could be paid twice).
  if (investment.status === 'withdrawn' || investment.status === 'matured') { error(res, 'Investment already withdrawn'); return }

  const now = new Date()
  const isMatured = now >= new Date(investment.maturityDate)

  // Calculate actual return (full if matured, partial with penalty if early)
  let returnAmount: number
  let actualReturn: number
  const newStatus = isMatured ? 'matured' : 'withdrawn'
  if (isMatured) {
    returnAmount = investment.amount + investment.expectedReturn
    actualReturn = investment.expectedReturn
  } else {
    // Early withdrawal: 50% penalty on expected return, prorated
    const elapsed = (now.getTime() - new Date(investment.startDate).getTime()) / (1000 * 60 * 60 * 24)
    const prorated = investment.expectedReturn * (elapsed / investment.tenure)
    returnAmount = investment.amount + (prorated * 0.5)
    actualReturn = Math.round((prorated * 0.5) * 100) / 100
  }

  // Atomically claim the payout so concurrent withdrawals can't double-credit.
  const claimed = await Investment.findOneAndUpdate(
    { _id: investment._id, status: { $nin: ['withdrawn', 'matured'] } },
    { $set: { status: newStatus, actualReturn } },
    { new: true },
  )
  if (!claimed) { error(res, 'Investment already withdrawn'); return }

  const credit = Math.round(returnAmount * 100) / 100
  const wallet = await Wallet.findOneAndUpdate(
    { userId: req.user!.userId },
    { $inc: { balance: credit } },
    { new: true, upsert: true },
  )
  await Wallet.updateOne({ userId: req.user!.userId }, { $push: { transactions: {
    type: 'investment_return',
    amount: credit,
    balanceAfter: wallet.balance,
    reference: `INVRET-${Date.now()}`,
    description: `${isMatured ? 'Matured' : 'Early withdrawal'}: ${investment.type.replace('_', ' ')}`,
    createdAt: now.toISOString(),
  } } })

  success(res, {
    investment: { ...claimed.toObject(), id: claimed._id.toString() },
    wallet: { balance: wallet.balance },
    returnAmount: credit,
    earlyWithdrawal: !isMatured,
  })
})

export default router
