import { Router } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { authenticate, requireRole, requirePermission } from '../middleware/auth.js'
import { FinancingOffer } from '../models/FinancingOffer.js'
import { FinancingApplication } from '../models/FinancingApplication.js'
import { FinancingContract } from '../models/FinancingContract.js'
import { Agreement } from '../models/Agreement.js'
import { CreditScore } from '../models/CreditScore.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { Employment } from '../models/Employment.js'
import { User } from '../models/User.js'
import { Wallet } from '../models/Wallet.js'
import { verifiedFinancierIds } from '../models/FinancierProfile.js'
import { approveApplication, disburseContract, applyRepayment, buildCreditQuote, FinancingError } from '../services/financing.js'
import { maxAdvanceMonthsFor } from '../services/legal/agreementCompliance.js'
import { RENT_LAW } from '../services/legal/rentLaw.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { requireApprovedEntity } from '../middleware/entityApproval.js'
import { requireVerifiedFinancierLicence } from '../middleware/financierLicence.js'

const router = Router()

const idOf = <T extends { _id: { toString(): string } }>(doc: T) => ({ ...doc, id: doc._id.toString() })

// Offer bounds. Google Play's personal-loan policy bars terms of 60 days or less,
// so every term is at least three months; the rate, fee and size caps are
// configurable so a licensed partner's regulator-approved pricing can be set.
const MIN_TENURE_MONTHS = 3
const MAX_ANNUAL_RATE = Number(process.env.FINANCING_MAX_ANNUAL_RATE || 60)
const MAX_PROCESSING_FEE_PCT = Number(process.env.FINANCING_MAX_PROCESSING_FEE_PCT || 10)
const MAX_OFFER_AMOUNT = Number(process.env.FINANCING_MAX_OFFER_AMOUNT || 200000)

/** APR including the processing fee, across the offer's tenure range (a % fee makes it independent of amount). */
function withApr<T extends { minAmount: number; minTenureMonths: number; maxTenureMonths: number; annualInterestRate: number; processingFeePct: number }>(offer: T) {
  const apr = (tenureMonths: number) => buildCreditQuote({ principal: offer.minAmount, annualInterestRate: offer.annualInterestRate, tenureMonths, processingFeePct: offer.processingFeePct }).apr
  return { ...offer, aprRange: { min: apr(offer.maxTenureMonths), max: apr(offer.minTenureMonths) } }
}

const lender = [requireApprovedEntity('financier'), requireVerifiedFinancierLicence]

function signedActive(agreement: { status?: string; tenantSignature?: string; landlordSignature?: string } | null) {
  return !!agreement && agreement.status === 'active' && !!agreement.tenantSignature && !!agreement.landlordSignature
}

function termsHash(c: { _id: { toString(): string }; principal: number; annualInterestRate: number; tenureMonths: number; processingFee: number; apr?: number; totalRepayable: number; schedule: { installmentNumber: number; dueDate: string; amountDue: number }[] }) {
  const terms = { id: c._id.toString(), principal: c.principal, annualInterestRate: c.annualInterestRate, tenureMonths: c.tenureMonths, processingFee: c.processingFee, apr: c.apr, totalRepayable: c.totalRepayable, schedule: c.schedule.map((s) => [s.installmentNumber, s.dueDate, s.amountDue]) }
  return crypto.createHash('sha256').update(JSON.stringify(terms)).digest('hex')
}

// ────────────────────────────────────────
// OFFERS
// ────────────────────────────────────────

// Public: list live offers — only from financiers whose licence is verified.
router.get('/offers', authenticate, async (_req, res) => {
  const financiers = [...await verifiedFinancierIds()]
  const offers = await FinancingOffer.find({ active: true, financierId: { $in: financiers } }).lean()
  success(res, { items: offers.map((o) => withApr(idOf(o))), total: offers.length, page: 1, pageSize: offers.length, totalPages: 1 })
})

// Financier: list my offers
router.get('/offers/mine', authenticate, requireRole('financier'), async (req, res) => {
  const offers = await FinancingOffer.find({ financierId: req.user!.userId }).lean()
  success(res, { items: offers.map((o) => withApr(idOf(o))), total: offers.length, page: 1, pageSize: offers.length, totalPages: 1 })
})

// Pre-application disclosure for a specific amount and term.
router.get('/offers/:id/quote', authenticate, async (req, res) => {
  const offer = await FinancingOffer.findById(param(req.params.id)).lean()
  if (!offer) { error(res, 'Offer not found', 404); return }
  const parsed = z.object({
    amount: z.coerce.number().min(offer.minAmount).max(offer.maxAmount),
    tenure: z.coerce.number().int().min(offer.minTenureMonths).max(offer.maxTenureMonths),
  }).safeParse(req.query)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  success(res, buildCreditQuote({ principal: parsed.data.amount, annualInterestRate: offer.annualInterestRate, tenureMonths: parsed.data.tenure, processingFeePct: offer.processingFeePct }))
})

// Financier: create offer (requires an approved profile with a verified licence)
router.post('/offers', authenticate, requireRole('financier'), requirePermission('financing:offer'), ...lender, async (req, res) => {
  const schema = z.object({
    name: z.string().min(3),
    productType: z.enum(['rent_advance', 'deposit_loan', 'rent_to_own']),
    description: z.string().default(''),
    minAmount: z.number().min(50),
    maxAmount: z.number().min(50).max(MAX_OFFER_AMOUNT, `Offers are capped at GHS ${MAX_OFFER_AMOUNT}`),
    minTenureMonths: z.number().int().min(MIN_TENURE_MONTHS, `Terms must be at least ${MIN_TENURE_MONTHS} months`).max(60),
    maxTenureMonths: z.number().int().min(MIN_TENURE_MONTHS, `Terms must be at least ${MIN_TENURE_MONTHS} months`).max(60),
    annualInterestRate: z.number().min(0).max(MAX_ANNUAL_RATE, `The interest rate cannot exceed ${MAX_ANNUAL_RATE}% a year`),
    processingFeePct: z.number().min(0).max(MAX_PROCESSING_FEE_PCT, `The processing fee cannot exceed ${MAX_PROCESSING_FEE_PCT}%`).default(0),
    lateFeePct: z.number().min(0).max(50).default(0),
    minCreditScore: z.number().min(0).max(100).default(0),
    requiresEmployment: z.boolean().default(true),
    requiresPayrollDeduction: z.boolean().default(false),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  if (parsed.data.maxAmount < parsed.data.minAmount) { error(res, 'maxAmount must be ≥ minAmount'); return }
  if (parsed.data.maxTenureMonths < parsed.data.minTenureMonths) { error(res, 'maxTenureMonths must be ≥ minTenureMonths'); return }

  const offer = await FinancingOffer.create({ ...parsed.data, financierId: req.user!.userId, active: true })
  success(res, withApr(idOf(offer.toObject())), 'Offer created', 201)
})

// Financier: toggle offer active flag (requires a verified licence)
router.patch('/offers/:id', authenticate, requireRole('financier'), ...lender, async (req, res) => {
  const offer = await FinancingOffer.findById(param(req.params.id))
  if (!offer || offer.financierId !== req.user!.userId) { error(res, 'Offer not found', 404); return }
  if (typeof req.body.active === 'boolean') offer.active = req.body.active
  await offer.save()
  success(res, idOf(offer.toObject()))
})

// ────────────────────────────────────────
// APPLICATIONS
// ────────────────────────────────────────

// Tenant: apply for financing
router.post('/applications', authenticate, async (req, res) => {
  const schema = z.object({
    offerId: z.string(),
    amountRequested: z.number().min(50),
    tenureMonths: z.number().int().min(MIN_TENURE_MONTHS, `Repayment must be over at least ${MIN_TENURE_MONTHS} months`).max(60),
    purpose: z.string().min(5),
    agreementId: z.string().optional(),
    advanceMonths: z.number().int().min(1).optional(),
    propertyId: z.string().optional(),
    willUsePayrollDeduction: z.boolean().default(false),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const offer = await FinancingOffer.findById(parsed.data.offerId)
  if (!offer || !offer.active || !(await verifiedFinancierIds()).has(offer.financierId)) { error(res, 'Offer not available'); return }
  if (offer.financierId === req.user!.userId) { error(res, 'You cannot apply to your own offer', 403); return }
  if (parsed.data.amountRequested < offer.minAmount || parsed.data.amountRequested > offer.maxAmount) {
    error(res, `Amount must be between GHS ${offer.minAmount} and GHS ${offer.maxAmount}`); return
  }
  if (parsed.data.tenureMonths < offer.minTenureMonths || parsed.data.tenureMonths > offer.maxTenureMonths) {
    error(res, `Tenure must be between ${offer.minTenureMonths} and ${offer.maxTenureMonths} months`); return
  }

  // A linked agreement must exist and belong to the applicant as tenant — at
  // sign time the contract's disbursement target (landlordId) comes from this
  // agreement, so an arbitrary id could redirect the payout to someone else.
  const isRentAdvance = offer.productType === 'rent_advance'
  if (isRentAdvance && !parsed.data.agreementId) { error(res, 'A rent advance must be linked to your signed rental agreement'); return }
  if (parsed.data.agreementId) {
    const agreement = await Agreement.findById(parsed.data.agreementId).select('tenantId status tenantSignature landlordSignature rentAmount startDate endDate').lean()
    if (!agreement) { error(res, 'Linked agreement not found', 404); return }
    if (agreement.tenantId !== req.user!.userId) { error(res, 'You can only link an agreement where you are the tenant'); return }
    if (isRentAdvance) {
      if (!signedActive(agreement)) { error(res, 'A rent advance needs an active agreement that you and your landlord have signed'); return }
      // Rent Act 1963 (Act 220) s.25: never advance more rent than the law allows the landlord to take.
      const legalMonths = maxAdvanceMonthsFor(agreement.startDate, agreement.endDate)
      const months = parsed.data.advanceMonths
      if (!months) { error(res, 'State how many months of rent the advance covers'); return }
      if (months > legalMonths) {
        error(res, `The advance cannot cover more than ${legalMonths} month${legalMonths === 1 ? '' : 's'} of rent for this tenancy (${legalMonths === 1 ? RENT_LAW.monthlyAdvanceCitation : RENT_LAW.advanceCitation})`); return
      }
      const cap = agreement.rentAmount * months
      if (parsed.data.amountRequested > cap) { error(res, `A ${months}-month advance on GHS ${agreement.rentAmount} rent is at most GHS ${cap}`); return }
    }
  }

  const credit = await CreditScore.findOne({ userId: req.user!.userId })
  if (offer.minCreditScore > 0 && (!credit || credit.score < offer.minCreditScore)) {
    error(res, `Your credit score (${credit?.score ?? 0}) is below the minimum required (${offer.minCreditScore})`); return
  }

  const profile = await TenantProfile.findOne({ userId: req.user!.userId })
  const employment = await Employment.findOne({ userId: req.user!.userId, status: 'active' })
  if (offer.requiresEmployment && !employment && !profile?.monthlyIncome) {
    error(res, 'This offer requires verified employment'); return
  }

  const me = await User.findById(req.user!.userId)
  const application = await FinancingApplication.create({
    applicantId: req.user!.userId,
    applicantName: me ? `${me.firstName} ${me.lastName}` : undefined,
    financierId: offer.financierId,
    offerId: offer._id.toString(),
    agreementId: parsed.data.agreementId,
    propertyId: parsed.data.propertyId,
    amountRequested: parsed.data.amountRequested,
    tenureMonths: parsed.data.tenureMonths,
    advanceMonths: isRentAdvance ? parsed.data.advanceMonths : undefined,
    purpose: parsed.data.purpose,
    status: 'submitted',
    creditScoreAtApply: credit?.score,
    monthlyIncomeAtApply: employment?.netMonthlySalary ?? profile?.monthlyIncome,
    monthlyIncomeCurrency: employment?.netMonthlySalary != null ? 'GHS' : profile?.primaryCurrency ?? 'GHS',
    employerId: employment?.employerId,
    willUsePayrollDeduction: parsed.data.willUsePayrollDeduction,
  })
  success(res, idOf(application.toObject()), 'Application submitted', 201)
})

// List applications — applicant sees own, financier sees inbound
router.get('/applications', authenticate, async (req, res) => {
  const isFinancier = req.user!.roles.includes('financier')
  const filter = isFinancier
    ? { financierId: req.user!.userId }
    : { applicantId: req.user!.userId }
  const items = await FinancingApplication.find(filter).sort({ createdAt: -1 }).lean()
  success(res, { items: items.map(idOf), total: items.length, page: 1, pageSize: items.length, totalPages: 1 })
})

router.get('/applications/:id', authenticate, async (req, res) => {
  const app = await FinancingApplication.findById(param(req.params.id)).lean()
  if (!app) { error(res, 'Application not found', 404); return }
  if (app.applicantId !== req.user!.userId && app.financierId !== req.user!.userId) {
    error(res, 'Not authorized', 403); return
  }
  success(res, idOf(app))
})

// Financier: approve
router.post('/applications/:id/approve', authenticate, requireRole('financier'), requirePermission('financing:approve'), ...lender, async (req, res) => {
  try {
    // Verify ownership BEFORE approveApplication, which persists the decision and
    // creates a contract — previously the 403 fired only after those side effects,
    // letting any financier hijack another financier's application.
    const existing = await FinancingApplication.findById(param(req.params.id)).select('financierId').lean()
    if (!existing) { error(res, 'Application not found', 404); return }
    if (existing.financierId !== req.user!.userId) { error(res, 'Not authorized', 403); return }

    const result = await approveApplication(param(req.params.id), req.user!.userId, req.body.notes, req.user!.userId)
    success(res, { application: idOf(result.application.toObject()), contract: idOf(result.contract.toObject()) })
  } catch (e) {
    if (e instanceof FinancingError) { error(res, e.message, e.status); return }
    throw e
  }
})

// Financier: reject
router.post('/applications/:id/reject', authenticate, requireRole('financier'), requirePermission('financing:approve'), ...lender, async (req, res) => {
  const app = await FinancingApplication.findById(param(req.params.id))
  if (!app || app.financierId !== req.user!.userId) { error(res, 'Application not found', 404); return }
  // State guard: only an undecided application can be rejected — "rejecting" an
  // already-approved application would orphan its live contract.
  if (app.status === 'approved' || app.status === 'rejected' || app.status === 'withdrawn') {
    error(res, `Application is already ${app.status}`, 409)
    return
  }
  app.status = 'rejected'
  app.decidedBy = req.user!.userId
  app.decidedAt = new Date().toISOString()
  app.decisionNotes = req.body.notes ?? 'Application rejected'
  await app.save()
  success(res, idOf(app.toObject()))
})

// ────────────────────────────────────────
// CONTRACTS
// ────────────────────────────────────────

router.get('/contracts', authenticate, async (req, res) => {
  const isFinancier = req.user!.roles.includes('financier')
  const filter = isFinancier
    ? { financierId: req.user!.userId }
    : { applicantId: req.user!.userId }
  const items = await FinancingContract.find(filter).sort({ createdAt: -1 }).lean()
  success(res, { items: items.map(idOf), total: items.length, page: 1, pageSize: items.length, totalPages: 1 })
})

router.get('/contracts/:id', authenticate, async (req, res) => {
  const contract = await FinancingContract.findById(param(req.params.id)).lean()
  if (!contract) { error(res, 'Contract not found', 404); return }
  if (contract.applicantId !== req.user!.userId && contract.financierId !== req.user!.userId) {
    error(res, 'Not authorized', 403); return
  }
  success(res, idOf(contract))
})

// Applicant: sign contract
router.post('/contracts/:id/sign', authenticate, async (req, res) => {
  const contract = await FinancingContract.findById(param(req.params.id))
  if (!contract) { error(res, 'Contract not found', 404); return }
  if (contract.applicantId !== req.user!.userId) { error(res, 'Not authorized', 403); return }
  if (contract.status !== 'pending_disbursement') { error(res, 'Contract not in signable state'); return }

  const parsed = z.object({
    signature: z.string().trim().min(3, 'Type your full name to sign'),
    acceptTerms: z.boolean().refine((v) => v, 'You must accept the contract terms'),
  }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  // If linked to an agreement, set landlordId for disbursement target
  if (contract.agreementId && !contract.landlordId) {
    const agreement = await Agreement.findById(contract.agreementId)
    if (contract.productType === 'rent_advance' && !signedActive(agreement)) { error(res, 'The linked rental agreement is no longer active and signed'); return }
    if (agreement) contract.landlordId = agreement.landlordId
  }

  // Keep what was signed, not just that it was: the typed name, when, from where,
  // and a hash binding the signature to these exact terms.
  const signedAt = new Date()
  contract.signedByApplicant = true
  contract.signedAt = signedAt.toISOString()
  contract.applicantSignature = {
    name: parsed.data.signature,
    signedAt,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 300),
    termsHash: termsHash(contract),
  }

  await contract.save()
  success(res, idOf(contract.toObject()), 'Contract signed')
})

// Financier: disburse
router.post('/contracts/:id/disburse', authenticate, requireRole('financier'), requirePermission('financing:disburse'), ...lender, async (req, res) => {
  // Funding defaults to the financier's own wallet; an external settlement must name its reference.
  const parsed = z.discriminatedUnion('fundingSource', [
    z.object({ fundingSource: z.literal('financier_wallet') }),
    z.object({ fundingSource: z.literal('external_settlement'), settlementReference: z.string().trim().min(6).max(120) }),
  ]).safeParse({ fundingSource: 'financier_wallet', ...req.body })
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const contract = await FinancingContract.findById(param(req.params.id))
  if (!contract || contract.financierId !== req.user!.userId) { error(res, 'Contract not found', 404); return }
  try {
    const updated = await disburseContract(contract._id.toString(), parsed.data.fundingSource === 'external_settlement'
      ? { kind: 'external_settlement', settlementReference: parsed.data.settlementReference }
      : { kind: 'financier_wallet' })
    success(res, idOf(updated.toObject()), 'Disbursed')
  } catch (e) {
    if (e instanceof FinancingError) { error(res, e.message, e.status); return }
    throw e
  }
})

// Applicant: repay (manual)
router.post('/contracts/:id/repay', authenticate, async (req, res) => {
  const contract = await FinancingContract.findById(param(req.params.id))
  if (!contract) { error(res, 'Contract not found', 404); return }
  if (contract.applicantId !== req.user!.userId) { error(res, 'Not authorized', 403); return }

  // The contract must be repayable BEFORE we touch the wallet — otherwise a debit
  // followed by a thrown applyRepayment would burn the borrower's money.
  // 'defaulted' accepts repayment. Refusing money from a borrower trying to
  // cure their own default is indefensible on its own, and combined with the
  // arrears cron — which was the only thing setting 'defaulted' — it left an
  // automated job able to lock someone out of ever repaying their loan.
  if (!['active', 'in_grace', 'in_arrears', 'defaulted'].includes(contract.status)) {
    error(res, `Contract is ${contract.status} — cannot accept repayment`); return
  }

  const amount = Number(req.body.amount)
  if (!Number.isFinite(amount) || amount <= 0) { error(res, 'Invalid amount'); return }

  // Never debit more than is actually outstanding (overpayment was silently lost).
  const round2 = (n: number) => Math.round(n * 100) / 100
  const outstanding = round2(contract.totalRepayable - contract.amountRepaid)
  if (outstanding <= 0) { error(res, 'This contract is already fully repaid'); return }
  const payAmount = Math.min(round2(amount), outstanding)

  // Atomic conditional debit FIRST (no concurrent double-spend). If applying the
  // repayment then fails, refund; if less than payAmount was applied, refund the rest.
  const ref = `REPAY-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  const wallet = await Wallet.findOneAndUpdate(
    { userId: req.user!.userId, balance: { $gte: payAmount } },
    { $inc: { balance: -payAmount } },
    { returnDocument: 'after' },
  )
  if (!wallet) { error(res, 'Insufficient wallet balance'); return }

  let result
  try {
    result = await applyRepayment(contract._id.toString(), payAmount, ref)
  } catch (e) {
    await Wallet.updateOne({ userId: req.user!.userId }, { $inc: { balance: payAmount } })
    error(res, (e as Error).message || 'Repayment failed'); return
  }

  // Refund any amount that couldn't be applied (e.g. rounding remainder).
  const unused = round2(payAmount - result.applied)
  if (unused > 0) {
    await Wallet.updateOne({ userId: req.user!.userId }, { $inc: { balance: unused } })
  }
  const finalBalance = round2(wallet.balance + unused)

  await Wallet.updateOne({ userId: req.user!.userId }, { $push: { transactions: {
    type: 'withdrawal',
    amount: result.applied,
    balanceAfter: finalBalance,
    reference: ref,
    description: `Financing repayment ${contract._id.toString().slice(-6)}`,
    createdAt: new Date().toISOString(),
  } } })

  success(res, { contract: idOf(result.contract.toObject()), applied: result.applied, walletBalance: finalBalance })
})

// ────────────────────────────────────────
// PORTFOLIO ANALYTICS (financier)
// ────────────────────────────────────────

router.get('/portfolio', authenticate, requireRole('financier'), async (req, res) => {
  const financierId = req.user!.userId
  const [contracts, applications] = await Promise.all([
    FinancingContract.find({ financierId }).lean(),
    FinancingApplication.find({ financierId }).lean(),
  ])
  // A contract starts as 'pending_disbursement' when the application is
  // approved: nothing has been paid out and nothing is owed yet.
  const total = contracts.filter((c) => c.status !== 'pending_disbursement').reduce((sum, c) => sum + c.principal, 0)
  const repaid = contracts.reduce((sum, c) => sum + c.amountRepaid, 0)
  const outstanding = contracts
    .filter((c) => ['active', 'in_grace', 'in_arrears', 'defaulted'].includes(c.status))
    .reduce((sum, c) => sum + Math.max(0, c.totalRepayable - c.amountRepaid), 0)
  const active = contracts.filter((c) => c.status === 'active').length
  const settled = contracts.filter((c) => c.status === 'settled').length
  const defaults = contracts.filter((c) => c.status === 'defaulted').length
  const inArrears = contracts.filter((c) => c.status === 'in_arrears').length
  const pendingApplications = applications.filter((a) => a.status === 'submitted' || a.status === 'under_review').length

  success(res, {
    totalDisbursed: Math.round(total * 100) / 100,
    totalRepaid: Math.round(repaid * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
    activeContracts: active,
    settledContracts: settled,
    defaultedContracts: defaults,
    inArrearsContracts: inArrears,
    pendingApplications,
    contractCount: contracts.length,
    defaultRate: contracts.length ? Math.round((defaults / contracts.length) * 1000) / 10 : 0,
  })
})

// ────────────────────────────────────────
// COLLECTIONS (financier defaults management)
// ────────────────────────────────────────

router.get('/collections', authenticate, requireRole('financier'), requirePermission('financing:default_manage'), async (req, res) => {
  const status = req.query.status as string | undefined
  const filter: Record<string, unknown> = { financierId: req.user!.userId }
  if (status === 'in_grace' || status === 'in_arrears' || status === 'defaulted') {
    filter.status = status
  } else {
    filter.status = { $in: ['in_grace', 'in_arrears', 'defaulted'] }
  }
  const contracts = await FinancingContract.find(filter).lean()
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const items = contracts.map((c) => {
    const overdueItems = (c.schedule ?? []).filter((s) => s.status !== 'paid' && s.status !== 'waived' && new Date(s.dueDate) < today && s.amountPaid < s.amountDue)
    const oldest = overdueItems.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0]
    const daysOverdue = oldest ? Math.ceil((today.getTime() - new Date(oldest.dueDate).getTime()) / (1000 * 60 * 60 * 24)) : 0
    return {
      id: c._id.toString(),
      applicantId: c.applicantId,
      applicantName: c.applicantName,
      agreementId: c.agreementId,
      status: c.status,
      principal: c.principal,
      totalRepayable: c.totalRepayable,
      amountRepaid: c.amountRepaid,
      monthlyPayment: c.monthlyPayment,
      daysOverdue,
      oldestUnpaidDueDate: oldest?.dueDate,
      outstanding: Math.max(0, c.totalRepayable - c.amountRepaid),
      lastReminderAt: c.lastReminderAt,
      lastContactAt: c.lastContactAt,
    }
  })
  success(res, { items, total: items.length })
})

router.post('/contracts/:id/remind', authenticate, requireRole('financier'), requirePermission('financing:collect'), requireApprovedEntity('financier'), async (req, res) => {
  const c = await FinancingContract.findById(param(req.params.id))
  if (!c || c.financierId !== req.user!.userId) { error(res, 'Contract not found', 404); return }
  const now = Date.now()
  if (c.lastReminderAt && now - new Date(c.lastReminderAt).getTime() < 24 * 60 * 60 * 1000) {
    error(res, 'Reminder already sent in the last 24 hours'); return
  }
  c.lastReminderAt = new Date().toISOString()
  c.lastContactAt = c.lastReminderAt
  await c.save()
  // A reminder, so the borrower's payment-reminder preference applies.
  const { notify } = await import('../services/notify.js')
  void notify({ userId: c.applicantId, title: 'Payment Reminder', message: `Your financing contract ${c._id.toString().slice(-6)} has overdue payments. Please make a payment to avoid further fees.`, actionUrl: `/financing/contracts/${c._id}`, category: 'payment' })
  success(res, idOf(c.toObject()))
})

router.post('/contracts/:id/mark-defaulted', authenticate, requireRole('financier'), requirePermission('financing:default_manage'), requireApprovedEntity('financier'), async (req, res) => {
  const c = await FinancingContract.findById(param(req.params.id))
  if (!c || c.financierId !== req.user!.userId) { error(res, 'Contract not found', 404); return }
  // State guard: only an active contract can default — flipping a settled or
  // pending contract to 'defaulted' corrupts the state machine.
  if (c.status !== 'active') {
    error(res, `Contract is ${c.status} — only active contracts can be marked defaulted`, 409)
    return
  }
  c.status = 'defaulted'
  c.notes = c.notes ?? []
  if (req.body.reason) c.notes.push({ text: `Marked defaulted: ${req.body.reason}`, by: req.user!.userId, at: new Date().toISOString() })
  await c.save()
  const { notify } = await import('../services/notify.js')
  void notify({ userId: c.applicantId, title: 'Contract Defaulted', message: 'Your financing contract has been marked as defaulted. This will affect your credit score.', actionUrl: `/financing/contracts/${c._id}` })
  void notify({ userId: c.financierId, title: 'Contract Defaulted', message: `Contract ${c._id.toString().slice(-6)} marked defaulted.`, actionUrl: `/financing/contracts/${c._id}` })
  success(res, idOf(c.toObject()))
})

router.post('/contracts/:id/notes', authenticate, async (req, res) => {
  const c = await FinancingContract.findById(param(req.params.id))
  if (!c) { error(res, 'Contract not found', 404); return }
  if (c.applicantId !== req.user!.userId && c.financierId !== req.user!.userId) { error(res, 'Not authorized', 403); return }
  const text = (req.body.text ?? '').toString().trim()
  if (text.length < 1) { error(res, 'Note text required'); return }
  c.notes = c.notes ?? []
  c.notes.push({ text, by: req.user!.userId, at: new Date().toISOString() })
  await c.save()
  success(res, idOf(c.toObject()))
})

export default router
