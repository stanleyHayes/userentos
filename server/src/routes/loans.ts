import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { Loan } from '../models/Loan.js'
import { Agreement } from '../models/Agreement.js'
import { CreditScore } from '../models/CreditScore.js'
import { Wallet } from '../models/Wallet.js'
import { notify } from '../services/notify.js'
import { checkAndAward } from '../services/achievements.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

const INTEREST_RATE = Number(process.env.LOAN_INTEREST_RATE || 15) // 15% annual default
const MIN_CREDIT_SCORE = Number(process.env.LOAN_MIN_CREDIT_SCORE || 50)

// Get my loans
router.get('/', authenticate, async (req, res) => {
  const loans = await Loan.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).lean()
  const items = loans.map((l) => ({ ...l, id: (l._id as Types.ObjectId).toString() }))
  success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
})

// Apply for micro-loan (rent shortfall protection)
router.post('/apply', authenticate, async (req, res) => {
  const schema = z.object({
    agreementId: z.string(),
    amount: z.number().min(50).max(10000),
    tenure: z.number().int().min(1).max(12),
    reason: z.string().min(10),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

  const { agreementId, amount, tenure, reason } = parsed.data

  // Verify agreement
  const agreement = await Agreement.findById(agreementId)
  if (!agreement || agreement.tenantId !== req.user!.userId) {
    error(res, 'Invalid agreement'); return
  }

  // Check credit score
  const creditScore = await CreditScore.findOne({ userId: req.user!.userId })
  if (!creditScore || creditScore.score < MIN_CREDIT_SCORE) {
    error(res, `Your credit score (${creditScore?.score ?? 0}) is below the minimum required (${MIN_CREDIT_SCORE}). Improve your score by making on-time payments and saving consistently.`)
    return
  }

  // Check existing active loans
  const activeLoan = await Loan.findOne({ userId: req.user!.userId, status: { $in: ['pending', 'approved', 'active'] } })
  if (activeLoan) {
    error(res, 'You already have an active loan. Please repay it before applying for a new one.')
    return
  }

  // Calculate repayment
  const monthlyRate = INTEREST_RATE / 100 / 12
  const monthlyPayment = (amount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / (Math.pow(1 + monthlyRate, tenure) - 1)
  const totalRepayment = monthlyPayment * tenure

  const loan = await Loan.create({
    userId: req.user!.userId,
    agreementId,
    amount,
    interestRate: INTEREST_RATE,
    tenure,
    monthlyPayment: Math.round(monthlyPayment * 100) / 100,
    totalRepayment: Math.round(totalRepayment * 100) / 100,
    creditScoreAtApproval: creditScore.score,
    reason,
    status: 'pending',
  })

  // Auto-approve if credit score is good enough (in production, would go through review)
  if (creditScore.score >= 70) {
    loan.status = 'approved'
    await loan.save()

    notify({
      userId: req.user!.userId,
      title: 'Loan Approved',
      message: `Your micro-loan of GHS ${amount.toFixed(2)} has been approved. It will be disbursed to your wallet shortly.`,
      actionUrl: '/savings',
    })
  }

  success(res, { ...loan.toObject(), id: loan._id.toString() }, 'Loan application submitted', 201)
})

// Disburse approved loan
router.post('/:id/disburse', authenticate, async (req, res) => {
  const loan = await Loan.findById(param(req.params.id))
  if (!loan) { error(res, 'Loan not found', 404); return }
  if (loan.userId !== req.user!.userId) { error(res, 'Not authorized', 403); return }
  if (loan.status !== 'approved') { error(res, 'Loan is not approved'); return }

  const wallet = await Wallet.findOne({ userId: req.user!.userId })
  if (!wallet) { error(res, 'Wallet not found', 404); return }

  wallet.balance += loan.amount
  wallet.transactions.push({
    type: 'deposit',
    amount: loan.amount,
    balanceAfter: wallet.balance,
    reference: `LOAN-${Date.now()}`,
    description: `Micro-loan disbursement`,
    createdAt: new Date().toISOString(),
  })

  loan.status = 'active'
  loan.disbursedAt = new Date().toISOString()

  await Promise.all([wallet.save(), loan.save()])

  success(res, { loan: { ...loan.toObject(), id: loan._id.toString() }, wallet: { balance: wallet.balance } })
})

// Make loan repayment
router.post('/:id/repay', authenticate, async (req, res) => {
  const loan = await Loan.findById(param(req.params.id))
  if (!loan) { error(res, 'Loan not found', 404); return }
  if (loan.userId !== req.user!.userId) { error(res, 'Not authorized', 403); return }
  if (loan.status !== 'active') { error(res, 'Loan is not active'); return }

  const amount = Number(req.body.amount)
  if (!Number.isFinite(amount) || amount <= 0) { error(res, 'Invalid amount'); return }

  const outstanding = loan.totalRepayment - loan.amountPaid
  if (outstanding <= 0) { error(res, 'Loan is already fully repaid'); return }
  const payAmount = Math.min(amount, outstanding)

  // Atomic conditional debit — single op that only succeeds when the balance
  // covers the payment, preventing concurrent double-spend / lost updates.
  const wallet = await Wallet.findOneAndUpdate(
    { userId: req.user!.userId, balance: { $gte: payAmount } },
    { $inc: { balance: -payAmount } },
    { new: true },
  )
  if (!wallet) { error(res, 'Insufficient wallet balance'); return }

  // Apply the loan progress atomically too, so concurrent repayments don't lose
  // an amountPaid increment via a read-modify-write on the loan document.
  const updatedLoan = await Loan.findByIdAndUpdate(loan._id, { $inc: { amountPaid: payAmount } }, { new: true }) ?? loan

  await Wallet.updateOne(
    { userId: req.user!.userId },
    { $push: { transactions: {
      type: 'withdrawal',
      amount: payAmount,
      balanceAfter: wallet.balance,
      reference: `LOANPAY-${Date.now()}`,
      description: 'Loan repayment',
      createdAt: new Date().toISOString(),
    } } },
  )

  if (updatedLoan.amountPaid >= updatedLoan.totalRepayment && updatedLoan.status !== 'repaid') {
    await Loan.updateOne({ _id: loan._id, status: { $ne: 'repaid' } }, { $set: { status: 'repaid' } })
    updatedLoan.status = 'repaid'
    notify({
      userId: req.user!.userId,
      title: 'Loan Repaid',
      message: 'Congratulations! Your micro-loan has been fully repaid.',
      actionUrl: '/savings',
    })
    checkAndAward(req.user!.userId, 'loan_settled', { loanId: loan._id.toString() })
      .catch((err) => console.warn('[Loan] checkAndAward failed:', err.message))
  }

  success(res, {
    loan: { ...updatedLoan.toObject(), id: updatedLoan._id.toString() },
    wallet: { balance: wallet.balance },
    remaining: Math.round((updatedLoan.totalRepayment - updatedLoan.amountPaid) * 100) / 100,
  })
})

export default router
