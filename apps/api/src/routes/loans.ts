import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate, requireRole, requirePermission } from '../middleware/auth.js'
import { requireApprovedEntity } from '../middleware/entityApproval.js'
import { Loan, LOAN_LIMITS, LOAN_OPEN_STATUSES, LOAN_REVIEWABLE_STATUSES, type ILoanQuoteSnapshot } from '../models/Loan.js'
import { Agreement } from '../models/Agreement.js'
import { CreditScore } from '../models/CreditScore.js'
import { Wallet } from '../models/Wallet.js'
import { notify } from '../services/notify.js'
import { checkAndAward } from '../services/achievements.js'
import { creditWallet, debitWallet } from '../services/payments/walletLedger.js'
import { buildCreditQuote } from '../services/financing.js'
import { recordAudit } from '../utils/audit.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

const INTEREST_RATE = Number(process.env.LOAN_INTEREST_RATE || 15) // 15% annual default
const PROCESSING_FEE_PCT = Number(process.env.LOAN_PROCESSING_FEE_PCT || 0)
const MIN_CREDIT_SCORE = Number(process.env.LOAN_MIN_CREDIT_SCORE || 50)
const PREQUALIFY_SCORE = Number(process.env.LOAN_PREQUALIFY_SCORE || 70)

const idOf = <T extends { _id: unknown }>(doc: T) => ({ ...doc, id: (doc._id as Types.ObjectId).toString() })
const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000

// Lenders (approved financier institutions) and explicitly authorised admins.
const reviewer = [requireRole('financier', 'admin', 'super_admin'), requirePermission('financing:approve'), requireApprovedEntity('financier')]
const disburser = [requireRole('financier', 'admin', 'super_admin'), requirePermission('financing:disburse'), requireApprovedEntity('financier')]

function quote(amount: number, tenure: number) {
  return buildCreditQuote({ principal: amount, annualInterestRate: INTEREST_RATE, tenureMonths: tenure, processingFeePct: PROCESSING_FEE_PCT })
}

const amountSchema = z.number().min(LOAN_LIMITS.minAmount).max(LOAN_LIMITS.maxAmount)
const tenureSchema = z.number().int()
  .min(LOAN_LIMITS.minTenureMonths, `Repayment period must be at least ${LOAN_LIMITS.minTenureMonths} months`)
  .max(LOAN_LIMITS.maxTenureMonths)

// Terms the apps display — the rate is never hardcoded client-side.
router.get('/terms', authenticate, (_req, res) => {
  success(res, {
    annualInterestRate: INTEREST_RATE,
    processingFeePct: PROCESSING_FEE_PCT,
    ...LOAN_LIMITS,
    minCreditScore: MIN_CREDIT_SCORE,
  })
})

// Pre-contract disclosure: APR including fees, total cost of credit, schedule.
router.get('/quote', authenticate, (req, res) => {
  const parsed = z.object({ amount: z.coerce.number().pipe(amountSchema), tenure: z.coerce.number().pipe(tenureSchema) }).safeParse(req.query)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  success(res, quote(parsed.data.amount, parsed.data.tenure))
})

// Get my loans
router.get('/', authenticate, async (req, res) => {
  const loans = await Loan.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).lean()
  const items = loans.map(idOf)
  success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
})

// Apply for a personal loan. The borrower confirms the exact quoted terms.
router.post('/apply', authenticate, async (req, res) => {
  const schema = z.object({
    agreementId: z.string().min(1),
    amount: amountSchema,
    tenure: tenureSchema,
    reason: z.string().min(10),
    acceptTerms: z.boolean().refine((v) => v, 'You must review and accept the loan terms'),
    quotedApr: z.number(),
    quotedTotalRepayment: z.number(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const { agreementId, amount, tenure, reason, quotedApr, quotedTotalRepayment } = parsed.data
  const userId = req.user!.userId

  // Only a tenancy both parties have signed and that is in force.
  const agreement = await Agreement.findById(agreementId).select('tenantId status tenantSignature landlordSignature').lean()
  if (!agreement || agreement.tenantId !== userId || agreement.status !== 'active' || !agreement.tenantSignature || !agreement.landlordSignature) {
    error(res, 'Choose an active rental agreement that both you and your landlord have signed'); return
  }

  if (await Loan.exists({ userId, status: { $in: [...LOAN_OPEN_STATUSES] } })) {
    error(res, 'You already have an open loan or application. Repay or close it before applying again.', 409); return
  }

  const terms = quote(amount, tenure)
  // The terms may have changed since the borrower saw them; they must accept what we record.
  if (Math.abs(terms.apr - quotedApr) > 0.005 || Math.abs(terms.totalRepayable - quotedTotalRepayment) > 0.005) {
    error(res, 'The loan terms have changed. Review the updated terms before confirming.', 409); return
  }

  // Score-only screening is a pre-qualification, not a credit decision: a person
  // reviews every application, and an automated decline states its reasons and
  // can be sent to a person (Data Protection Act 2012, Act 843, s.41).
  const creditScore = await CreditScore.findOne({ userId }).lean()
  const score = creditScore?.score ?? 0
  const outcome = score >= PREQUALIFY_SCORE ? 'pre_qualified' : score >= MIN_CREDIT_SCORE ? 'manual_review' : 'declined'
  const reasons = !creditScore
    ? ['No RentOS credit score is on file yet.']
    : outcome === 'pre_qualified'
      ? [`Credit score ${score} meets the pre-qualification level of ${PREQUALIFY_SCORE}.`]
      : outcome === 'manual_review'
        ? [`Credit score ${score} is below the pre-qualification level of ${PREQUALIFY_SCORE}, so a person must assess the application.`]
        : [`Credit score ${score} is below the minimum of ${MIN_CREDIT_SCORE}.`]
  const status = outcome === 'pre_qualified' ? 'pre_qualified' : outcome === 'manual_review' ? 'pending_review' : 'rejected'

  const snapshot: ILoanQuoteSnapshot = {
    amount, tenure,
    annualInterestRate: terms.annualInterestRate,
    processingFee: terms.processingFee,
    netDisbursed: terms.netDisbursed,
    monthlyPayment: terms.monthlyPayment,
    totalRepayment: terms.totalRepayable,
    totalCostOfCredit: terms.totalCostOfCredit,
    apr: terms.apr,
    schedule: terms.schedule.map(({ installmentNumber, dueDate, principal, interest, amountDue }) => ({ installmentNumber, dueDate, principal, interest, amountDue })),
  }

  let loan
  try {
    loan = await Loan.create({
      userId,
      agreementId,
      amount,
      interestRate: terms.annualInterestRate,
      tenure,
      processingFee: terms.processingFee,
      apr: terms.apr,
      monthlyPayment: terms.monthlyPayment,
      totalRepayment: terms.totalRepayable,
      creditScoreAtApproval: creditScore?.score,
      automatedAssessment: { outcome, creditScore: score, reasons, assessedAt: new Date() },
      termsAcceptance: { acceptedAt: new Date(), snapshot },
      reason,
      status,
    })
  } catch (err) {
    // The partial unique index is the real guard against parallel applications.
    if (isDuplicateKey(err)) { error(res, 'You already have an open loan or application. Repay or close it before applying again.', 409); return }
    throw err
  }

  const message = status === 'rejected'
    ? `Your loan application was not pre-qualified: ${reasons.join(' ')} This was an automated assessment — you can ask for it to be reviewed by a person.`
    : `Your loan application for GHS ${amount.toFixed(2)} is with a lender for review. No money is paid until a lender approves and disburses it.`
  void notify({ userId, title: status === 'rejected' ? 'Loan Application Not Pre-qualified' : 'Loan Application Received', message, actionUrl: '/savings' })

  success(res, idOf(loan.toObject() as { _id: unknown }), status === 'rejected'
    ? 'Not pre-qualified — you can request a review by a person'
    : 'Application received — a lender will review it', 201)
})

// Borrower: send an automated decline to a person.
router.post('/:id/request-review', authenticate, async (req, res) => {
  try {
    const loan = await Loan.findOneAndUpdate(
      { _id: param(req.params.id), userId: req.user!.userId, status: 'rejected', 'automatedAssessment.outcome': 'declined', reviewedBy: { $exists: false }, reviewRequestedAt: { $exists: false } },
      { $set: { status: 'pending_review', reviewRequestedAt: new Date() } },
      { returnDocument: 'after' },
    )
    if (!loan) { error(res, 'Only an automated decline that has not been reviewed can be sent for review', 409); return }
    success(res, idOf(loan.toObject() as { _id: unknown }), 'Sent for review by a person')
  } catch (err) {
    if (isDuplicateKey(err)) { error(res, 'You already have an open loan or application', 409); return }
    throw err
  }
})

// Lender/admin: applications awaiting a decision or disbursement.
router.get('/review-queue', authenticate, ...reviewer, async (_req, res) => {
  const loans = await Loan.find({ status: { $in: [...LOAN_REVIEWABLE_STATUSES, 'approved'] } }).sort({ createdAt: 1 }).lean()
  const items = loans.map(idOf)
  success(res, { items, total: items.length })
})

// Lender/admin: the human credit decision.
router.post('/:id/decide', authenticate, ...reviewer, async (req, res) => {
  const parsed = z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().trim().min(5) }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const reviewerId = req.user!.userId
  const isFinancier = req.user!.roles.includes('financier')
  const loan = await Loan.findOneAndUpdate(
    { _id: param(req.params.id), userId: { $ne: reviewerId }, status: { $in: [...LOAN_REVIEWABLE_STATUSES] } },
    { $set: {
      status: parsed.data.decision,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      decisionReason: parsed.data.reason,
      // A lender approving takes the loan on; an admin's approval leaves funding open.
      ...(parsed.data.decision === 'approved' && isFinancier ? { lenderId: reviewerId } : {}),
    } },
    { returnDocument: 'after' },
  )
  if (!loan) { error(res, 'Loan is not awaiting review', 409); return }

  await recordAudit(req, `loan.${parsed.data.decision}`, 'Loan', loan._id.toString(), { reason: parsed.data.reason })
  void notify({
    userId: loan.userId,
    title: parsed.data.decision === 'approved' ? 'Loan Approved' : 'Loan Application Declined',
    message: parsed.data.decision === 'approved'
      ? `Your loan of GHS ${loan.amount.toFixed(2)} was approved after review. The lender will disburse it to your wallet.`
      : `Your loan application was declined after review. Reason: ${parsed.data.reason}`,
    actionUrl: '/savings',
  })
  success(res, idOf(loan.toObject() as { _id: unknown }), `Loan ${parsed.data.decision}`)
})

// Lender/admin: disburse. Every credit to the borrower is matched by a lender
// wallet debit or backed by an external settlement already received — never minted.
router.post('/:id/disburse', authenticate, ...disburser, async (req, res) => {
  const parsed = z.discriminatedUnion('fundingSource', [
    z.object({ fundingSource: z.literal('lender_wallet') }),
    z.object({ fundingSource: z.literal('external_settlement'), settlementReference: z.string().trim().min(6).max(120) }),
  ]).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const callerId = req.user!.userId
  const loan = await Loan.findById(param(req.params.id))
  if (!loan) { error(res, 'Loan not found', 404); return }
  if (loan.userId === callerId) { error(res, 'You cannot disburse your own loan', 403); return }
  if (loan.status !== 'approved') { error(res, 'Loan is not approved for disbursement'); return }

  const walletFunded = parsed.data.fundingSource === 'lender_wallet'
  if (walletFunded) {
    // Only the lending institution can commit its own money.
    if (!req.user!.roles.includes('financier')) { error(res, 'Only the lender can fund a loan from its wallet', 403); return }
    if (loan.lenderId && loan.lenderId !== callerId) { error(res, 'This loan belongs to another lender', 403); return }
  }
  const lenderId = walletFunded ? callerId : loan.lenderId
  const fundingReference = parsed.data.fundingSource === 'external_settlement' ? parsed.data.settlementReference : `LOAN-FUND-${loan._id.toString()}`
  const net = loan.termsAcceptance?.snapshot?.netDisbursed ?? loan.amount - (loan.processingFee ?? 0)

  let claimed
  try {
    // Atomic status claim — concurrent/retried disburse calls can't double-pay.
    claimed = await Loan.findOneAndUpdate(
      { _id: loan._id, status: 'approved' },
      { $set: { status: 'active', disbursedAt: new Date().toISOString(), disbursedBy: callerId, fundingSource: parsed.data.fundingSource, fundingReference, ...(lenderId ? { lenderId } : {}) } },
      { returnDocument: 'after' },
    )
  } catch (err) {
    if (isDuplicateKey(err)) { error(res, 'That settlement reference already funds another loan', 409); return }
    throw err
  }
  if (!claimed) { error(res, 'Loan is not approved for disbursement'); return }

  const revert = () => Loan.updateOne({ _id: loan._id }, { $set: { status: 'approved' }, $unset: { disbursedAt: 1, disbursedBy: 1, fundingSource: 1, fundingReference: 1 } })

  if (walletFunded) {
    const funded = await debitWallet(callerId, net, { type: 'loan_funding', reference: fundingReference, description: `Loan funding ${loan._id.toString().slice(-6)}` })
    if (!funded) { await revert(); error(res, 'Insufficient lender wallet balance to fund this loan'); return }
  }
  try {
    await creditWallet(loan.userId, net, { type: 'loan_disbursement', reference: fundingReference, description: 'Loan disbursement' })
  } catch (err) {
    if (walletFunded) {
      await creditWallet(callerId, net, { type: 'refund', reference: `${fundingReference}-REV`, description: 'Reversal of failed loan disbursement' })
        .catch((refundErr) => console.error(`[loans/disburse] CRITICAL: lender refund failed for ${loan._id}: ${(refundErr as Error).message}`))
    }
    await revert()
    throw err
  }

  await recordAudit(req, 'loan.disburse', 'Loan', loan._id.toString(), { fundingSource: parsed.data.fundingSource, fundingReference, amount: net })
  void notify({ userId: loan.userId, title: 'Loan Disbursed', message: `GHS ${net.toFixed(2)} has been paid into your wallet. Your first repayment is due in one month.`, actionUrl: '/savings' })
  success(res, { loan: idOf(claimed.toObject() as { _id: unknown }) }, 'Loan disbursed')
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
    { returnDocument: 'after' },
  )
  if (!wallet) { error(res, 'Insufficient wallet balance'); return }

  // Apply the loan progress atomically too, so concurrent repayments don't lose
  // an amountPaid increment via a read-modify-write on the loan document.
  const updatedLoan = await Loan.findByIdAndUpdate(loan._id, { $inc: { amountPaid: payAmount } }, { returnDocument: 'after' }) ?? loan

  const reference = `LOANPAY-${Date.now()}`
  await Wallet.updateOne(
    { userId: req.user!.userId },
    { $push: { transactions: {
      type: 'withdrawal',
      amount: payAmount,
      balanceAfter: wallet.balance,
      reference,
      description: 'Loan repayment',
      createdAt: new Date().toISOString(),
    } } },
  )

  // A lender who funded from its wallet is repaid into it; externally settled
  // loans are remitted to the lender off-platform.
  if (loan.fundingSource === 'lender_wallet' && loan.lenderId) {
    await creditWallet(loan.lenderId, payAmount, { type: 'loan_repayment_received', reference, description: `Loan repayment ${loan._id.toString().slice(-6)}` })
      .catch((err) => console.error(`[loans/repay] CRITICAL: repayment ${reference} not credited to lender ${loan.lenderId}: ${(err as Error).message}`))
  }

  if (updatedLoan.amountPaid >= updatedLoan.totalRepayment && updatedLoan.status !== 'repaid') {
    await Loan.updateOne({ _id: loan._id, status: { $ne: 'repaid' } }, { $set: { status: 'repaid' } })
    updatedLoan.status = 'repaid'
    void notify({
      userId: req.user!.userId,
      title: 'Loan Repaid',
      message: 'Congratulations! Your loan has been fully repaid.',
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
