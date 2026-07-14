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
import { approveApplication, disburseContract, applyRepayment } from '../services/financing.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

const idOf = <T extends { _id: { toString(): string } }>(doc: T) => ({ ...doc, id: doc._id.toString() })

// ────────────────────────────────────────
// OFFERS
// ────────────────────────────────────────

// Public: list active offers (visible to applicants)
router.get('/offers', authenticate, async (_req, res) => {
  const offers = await FinancingOffer.find({ active: true }).lean()
  success(res, { items: offers.map(idOf), total: offers.length, page: 1, pageSize: offers.length, totalPages: 1 })
})

// Financier: list my offers
router.get('/offers/mine', authenticate, requireRole('financier'), async (req, res) => {
  const offers = await FinancingOffer.find({ financierId: req.user!.userId }).lean()
  success(res, { items: offers.map(idOf), total: offers.length, page: 1, pageSize: offers.length, totalPages: 1 })
})

// Financier: create offer
router.post('/offers', authenticate, requireRole('financier'), requirePermission('financing:offer'), async (req, res) => {
  const schema = z.object({
    name: z.string().min(3),
    productType: z.enum(['rent_advance', 'deposit_loan', 'rent_to_own']),
    description: z.string().default(''),
    minAmount: z.number().min(50),
    maxAmount: z.number().min(50),
    minTenureMonths: z.number().int().min(1).max(60),
    maxTenureMonths: z.number().int().min(1).max(60),
    annualInterestRate: z.number().min(0).max(100),
    processingFeePct: z.number().min(0).max(20).default(0),
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
  success(res, idOf(offer.toObject()), 'Offer created', 201)
})

// Financier: toggle offer active flag
router.patch('/offers/:id', authenticate, requireRole('financier'), async (req, res) => {
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
    tenureMonths: z.number().int().min(1).max(60),
    purpose: z.string().min(5),
    agreementId: z.string().optional(),
    propertyId: z.string().optional(),
    willUsePayrollDeduction: z.boolean().default(false),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const offer = await FinancingOffer.findById(parsed.data.offerId)
  if (!offer || !offer.active) { error(res, 'Offer not available'); return }
  if (parsed.data.amountRequested < offer.minAmount || parsed.data.amountRequested > offer.maxAmount) {
    error(res, `Amount must be between GHS ${offer.minAmount} and GHS ${offer.maxAmount}`); return
  }
  if (parsed.data.tenureMonths < offer.minTenureMonths || parsed.data.tenureMonths > offer.maxTenureMonths) {
    error(res, `Tenure must be between ${offer.minTenureMonths} and ${offer.maxTenureMonths} months`); return
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
    purpose: parsed.data.purpose,
    status: 'submitted',
    creditScoreAtApply: credit?.score,
    monthlyIncomeAtApply: employment?.netMonthlySalary ?? profile?.monthlyIncome,
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
router.post('/applications/:id/approve', authenticate, requireRole('financier'), requirePermission('financing:approve'), async (req, res) => {
  try {
    // Verify ownership BEFORE approveApplication, which persists the decision and
    // creates a contract — previously the 403 fired only after those side effects,
    // letting any financier hijack another financier's application.
    const existing = await FinancingApplication.findById(param(req.params.id)).select('financierId').lean()
    if (!existing) { error(res, 'Application not found', 404); return }
    if (existing.financierId !== req.user!.userId) { error(res, 'Not authorized', 403); return }

    const result = await approveApplication(param(req.params.id), req.user!.userId, req.body.notes)
    success(res, { application: idOf(result.application.toObject()), contract: idOf(result.contract.toObject()) })
  } catch (e) {
    error(res, (e as Error).message)
  }
})

// Financier: reject
router.post('/applications/:id/reject', authenticate, requireRole('financier'), requirePermission('financing:approve'), async (req, res) => {
  const app = await FinancingApplication.findById(param(req.params.id))
  if (!app || app.financierId !== req.user!.userId) { error(res, 'Application not found', 404); return }
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

  const signature = (req.body.signature ?? '').toString()
  if (signature.length < 3) { error(res, 'Signature required'); return }

  contract.signedByApplicant = true
  contract.signedAt = new Date().toISOString()

  // If linked to an agreement, set landlordId for disbursement target
  if (contract.agreementId && !contract.landlordId) {
    const agreement = await Agreement.findById(contract.agreementId)
    if (agreement) contract.landlordId = agreement.landlordId
  }

  await contract.save()
  success(res, idOf(contract.toObject()), 'Contract signed')
})

// Financier: disburse
router.post('/contracts/:id/disburse', authenticate, requireRole('financier'), requirePermission('financing:disburse'), async (req, res) => {
  const contract = await FinancingContract.findById(param(req.params.id))
  if (!contract || contract.financierId !== req.user!.userId) { error(res, 'Contract not found', 404); return }
  try {
    const updated = await disburseContract(contract._id.toString())
    success(res, idOf(updated.toObject()), 'Disbursed')
  } catch (e) {
    error(res, (e as Error).message)
  }
})

// Applicant: repay (manual)
router.post('/contracts/:id/repay', authenticate, async (req, res) => {
  const contract = await FinancingContract.findById(param(req.params.id))
  if (!contract) { error(res, 'Contract not found', 404); return }
  if (contract.applicantId !== req.user!.userId) { error(res, 'Not authorized', 403); return }

  // The contract must be repayable BEFORE we touch the wallet — otherwise a debit
  // followed by a thrown applyRepayment would burn the borrower's money.
  if (!['active', 'in_grace', 'in_arrears'].includes(contract.status)) {
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
    { new: true },
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
  const total = contracts.reduce((sum, c) => sum + c.principal, 0)
  const repaid = contracts.reduce((sum, c) => sum + c.amountRepaid, 0)
  const outstanding = contracts.reduce((sum, c) => sum + (c.totalRepayable - c.amountRepaid), 0)
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

router.post('/contracts/:id/remind', authenticate, requireRole('financier'), requirePermission('financing:collect'), async (req, res) => {
  const c = await FinancingContract.findById(param(req.params.id))
  if (!c || c.financierId !== req.user!.userId) { error(res, 'Contract not found', 404); return }
  const now = Date.now()
  if (c.lastReminderAt && now - new Date(c.lastReminderAt).getTime() < 24 * 60 * 60 * 1000) {
    error(res, 'Reminder already sent in the last 24 hours'); return
  }
  c.lastReminderAt = new Date().toISOString()
  c.lastContactAt = c.lastReminderAt
  await c.save()
  // Use existing notify
  const { notify } = await import('../services/notify.js')
  notify({ userId: c.applicantId, title: 'Payment Reminder', message: `Your financing contract ${c._id.toString().slice(-6)} has overdue payments. Please make a payment to avoid further fees.`, actionUrl: `/financing/contracts/${c._id}` })
  success(res, idOf(c.toObject()))
})

router.post('/contracts/:id/mark-defaulted', authenticate, requireRole('financier'), requirePermission('financing:default_manage'), async (req, res) => {
  const c = await FinancingContract.findById(param(req.params.id))
  if (!c || c.financierId !== req.user!.userId) { error(res, 'Contract not found', 404); return }
  c.status = 'defaulted'
  c.notes = c.notes ?? []
  if (req.body.reason) c.notes.push({ text: `Marked defaulted: ${req.body.reason}`, by: req.user!.userId, at: new Date().toISOString() })
  await c.save()
  const { notify } = await import('../services/notify.js')
  notify({ userId: c.applicantId, title: 'Contract Defaulted', message: 'Your financing contract has been marked as defaulted. This will affect your credit score.', actionUrl: `/financing/contracts/${c._id}` })
  notify({ userId: c.financierId, title: 'Contract Defaulted', message: `Contract ${c._id.toString().slice(-6)} marked defaulted.`, actionUrl: `/financing/contracts/${c._id}` })
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
