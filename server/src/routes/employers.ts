import { Router } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { authenticate, requireRole, requirePermission, isSuperAdmin } from '../middleware/auth.js'
import { Employer } from '../models/Employer.js'
import { Employment } from '../models/Employment.js'
import { DeductionMandate } from '../models/DeductionMandate.js'
import { PayrollRun } from '../models/PayrollRun.js'
import { User } from '../models/User.js'
import { Agreement } from '../models/Agreement.js'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { FinancingContract } from '../models/FinancingContract.js'
import { buildPayrollRun, approvePayrollRun, processPayrollRun } from '../services/payroll.js'
import { notify } from '../services/notify.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

const idOf = <T extends { _id?: { toString(): string }; id?: string }>(doc: T) => ({ ...doc, id: (doc._id ?? doc.id)?.toString() ?? '' })

async function loadMyEmployer(userId: string) {
  return Employer.findOne({ ownerId: userId })
}

// ────────────────────────────────────────
// EMPLOYER PROFILE
// ────────────────────────────────────────

router.get('/me', authenticate, requireRole('employer'), async (req, res) => {
  const employer = await loadMyEmployer(req.user!.userId)
  if (!employer) { success(res, null); return }
  success(res, idOf(employer.toObject()))
})

router.post('/me', authenticate, requireRole('employer'), async (req, res) => {
  const schema = z.object({
    legalName: z.string().min(2),
    tradingName: z.string().optional(),
    tin: z.string().min(5),
    ssnitEmployerNumber: z.string().optional(),
    industry: z.string().optional(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      region: z.string(),
      digitalAddress: z.string().optional(),
    }),
    contactEmail: z.string().email(),
    contactPhone: z.string().min(7),
    payrollCycle: z.enum(['weekly', 'biweekly', 'monthly']).default('monthly'),
    paydayDayOfMonth: z.number().int().min(1).max(31).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const existing = await loadMyEmployer(req.user!.userId)
  if (existing) {
    Object.assign(existing, parsed.data)
    await existing.save()
    success(res, idOf(existing.toObject()))
    return
  }
  const employer = await Employer.create({ ...parsed.data, ownerId: req.user!.userId, verificationStatus: 'pending' })
  success(res, idOf(employer.toObject()), 'Employer profile created', 201)
})

// Government / admin: verify employer
router.post('/:id/verify', authenticate, requireRole('government', 'admin'), async (req, res) => {
  const employer = await Employer.findById(param(req.params.id))
  if (!employer) { error(res, 'Employer not found', 404); return }
  employer.verificationStatus = 'verified'
  employer.verifiedBy = req.user!.userId
  employer.verifiedAt = new Date().toISOString()
  await employer.save()
  success(res, idOf(employer.toObject()))
})

// ────────────────────────────────────────
// EMPLOYEES
// ────────────────────────────────────────

router.get('/employees', authenticate, requireRole('employer'), requirePermission('employer:view_employees'), async (req, res) => {
  const employer = await loadMyEmployer(req.user!.userId)
  if (!employer) { success(res, { items: [], total: 0, page: 1, pageSize: 0, totalPages: 1 }); return }
  const employments = await Employment.find({ employerId: employer._id.toString() }).lean()
  const userIds = employments.map((e) => e.userId)
  const users = await User.find({ _id: { $in: userIds } }).select('firstName lastName email phone').lean()
  const userMap = new Map(users.map((u) => [u._id.toString(), u]))
  const items = employments.map((e) => {
    const u = userMap.get(e.userId)
    return {
      ...idOf(e),
      employerId: e.employerId.toString(),
      employerName: employer.legalName,
      employeeName: u ? `${u.firstName} ${u.lastName}` : undefined,
    }
  })
  success(res, { items, total: items.length, page: 1, pageSize: items.length, totalPages: 1 })
})

// Add employee — links existing user (by email) to employer
router.post('/employees', authenticate, requireRole('employer'), requirePermission('employer:invite_employees'), async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    staffNumber: z.string().optional(),
    jobTitle: z.string().optional(),
    netMonthlySalary: z.number().min(0),
    startDate: z.string(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const employer = await loadMyEmployer(req.user!.userId)
  if (!employer) { error(res, 'Create employer profile first'); return }

  const user = await User.findOne({ email: parsed.data.email.toLowerCase() })
  if (!user) { error(res, 'User not found — they must register on RentOS first'); return }

  const existing = await Employment.findOne({ employerId: employer._id.toString(), userId: user._id.toString() })
  if (existing) { error(res, 'Employee already linked'); return }

  const employment = await Employment.create({
    employerId: employer._id.toString(),
    userId: user._id.toString(),
    staffNumber: parsed.data.staffNumber,
    jobTitle: parsed.data.jobTitle,
    netMonthlySalary: parsed.data.netMonthlySalary,
    startDate: parsed.data.startDate,
    status: 'active',
  })
  employer.totalEmployees = (employer.totalEmployees ?? 0) + 1
  await employer.save()
  success(res, { ...idOf(employment.toObject()), employeeName: `${user.firstName} ${user.lastName}` }, 'Employee added', 201)
})

// Bulk CSV import — links many existing users to employer in one request
router.post('/employees/bulk', authenticate, requireRole('employer'), requirePermission('employer:invite_employees'), async (req, res) => {
  const rowSchema = z.object({
    email: z.string().email(),
    netMonthlySalary: z.number().min(0),
    startDate: z.string(),
    staffNumber: z.string().optional(),
    jobTitle: z.string().optional(),
  })
  const schema = z.object({ rows: z.array(z.unknown()) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  if (parsed.data.rows.length > 500) {
    error(res, 'Bulk import is limited to 500 rows per request', 413)
    return
  }

  const employer = await loadMyEmployer(req.user!.userId)
  if (!employer) { error(res, 'Create employer profile first'); return }
  const employerId = employer._id.toString()

  let created = 0
  let skipped = 0
  const errors: { row: number; email?: string; reason: string }[] = []

  for (let i = 0; i < parsed.data.rows.length; i++) {
    const rowParse = rowSchema.safeParse(parsed.data.rows[i])
    if (!rowParse.success) {
      const raw = parsed.data.rows[i] as { email?: unknown }
      errors.push({ row: i + 1, email: typeof raw?.email === 'string' ? raw.email : undefined, reason: rowParse.error.issues[0].message })
      continue
    }
    const row = rowParse.data
    const email = row.email.toLowerCase()

    const user = await User.findOne({ email })
    if (!user) {
      errors.push({ row: i + 1, email, reason: 'User not found — they must register on RentOS first' })
      continue
    }

    const userIdStr = user._id.toString()
    const existing = await Employment.findOne({ employerId, userId: userIdStr })
    if (existing) {
      skipped++
      continue
    }

    try {
      await Employment.create({
        employerId,
        userId: userIdStr,
        staffNumber: row.staffNumber,
        jobTitle: row.jobTitle,
        netMonthlySalary: row.netMonthlySalary,
        startDate: row.startDate,
        status: 'active',
      })
      created++
    } catch (e) {
      errors.push({ row: i + 1, email, reason: (e as Error).message })
    }
  }

  if (created > 0) {
    employer.totalEmployees = (employer.totalEmployees ?? 0) + created
    await employer.save()
  }

  success(res, { created, skipped, errors }, `Imported ${created} employee${created === 1 ? '' : 's'}`, 201)
})

router.patch('/employees/:id', authenticate, requireRole('employer'), async (req, res) => {
  const employer = await loadMyEmployer(req.user!.userId)
  const employment = await Employment.findById(param(req.params.id))
  if (!employer || !employment || employment.employerId !== employer._id.toString()) { error(res, 'Employee not found', 404); return }
  const previousStatus = employment.status
  const allowed = ['status', 'jobTitle', 'netMonthlySalary', 'staffNumber', 'endDate'] as const
  for (const field of allowed) {
    if (req.body[field] !== undefined) employment.set(field, req.body[field])
  }
  await employment.save()

  // Cascade: when an active employee is terminated, revoke all of their active mandates
  if (previousStatus === 'active' && employment.status === 'terminated') {
    const employmentId = employment._id.toString()
    const activeMandates = await DeductionMandate.find({ employmentId, status: 'active' })
    if (activeMandates.length > 0) {
      const revokedAt = new Date().toISOString()
      const revokedReason = 'Employment terminated by employer'
      await DeductionMandate.updateMany(
        { employmentId, status: 'active' },
        { $set: { status: 'revoked', revokedAt, revokedReason } },
      )
      try {
        await notify({
          userId: employment.userId,
          title: 'Payroll Deductions Revoked',
          message: `Your employment was terminated by ${employer.legalName}. ${activeMandates.length} active mandate${activeMandates.length === 1 ? ' was' : 's were'} revoked.`,
          actionUrl: '/financing/mandates',
        })
      } catch (e) {
        console.warn('[employers] notify failed:', (e as Error).message)
      }
    }
  }

  success(res, idOf(employment.toObject()))
})

// ────────────────────────────────────────
// DEDUCTION MANDATES
// ────────────────────────────────────────

// Employee: list my mandates
router.get('/mandates/mine', authenticate, async (req, res) => {
  const items = await DeductionMandate.find({ employeeId: req.user!.userId }).sort({ createdAt: -1 }).lean()
  success(res, { items: items.map(idOf), total: items.length, page: 1, pageSize: items.length, totalPages: 1 })
})

// Employer: list mandates for my staff
router.get('/mandates', authenticate, requireRole('employer'), async (req, res) => {
  const employer = await loadMyEmployer(req.user!.userId)
  if (!employer) { success(res, { items: [], total: 0, page: 1, pageSize: 0, totalPages: 1 }); return }
  const items = await DeductionMandate.find({ employerId: employer._id.toString() }).sort({ createdAt: -1 }).lean()
  const userIds = [...new Set(items.map((m) => m.employeeId))]
  const users = await User.find({ _id: { $in: userIds } }).select('firstName lastName').lean()
  const map = new Map(users.map((u) => [u._id.toString(), u]))
  const enriched = items.map((m) => ({
    ...idOf(m),
    employeeName: map.get(m.employeeId) ? `${map.get(m.employeeId)!.firstName} ${map.get(m.employeeId)!.lastName}` : undefined,
  }))
  success(res, { items: enriched, total: enriched.length, page: 1, pageSize: enriched.length, totalPages: 1 })
})

// Employee: create + sign mandate
router.post('/mandates', authenticate, async (req, res) => {
  const schema = z.object({
    allocationType: z.enum(['rent', 'savings', 'loan_repayment', 'wallet_topup']),
    targetEntityId: z.string().optional(),
    amountType: z.enum(['fixed', 'percentage']).default('fixed'),
    amount: z.number().min(0),
    startDate: z.string(),
    endDate: z.string().optional(),
    noticePeriodDays: z.number().int().min(0).max(90).default(7),
    signature: z.string().min(3),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const employment = await Employment.findOne({ userId: req.user!.userId, status: 'active' })
  if (!employment) { error(res, 'No active employment on file — ask your employer to add you first'); return }

  let targetEntityType: 'agreement' | 'savings_plan' | 'financing_contract' | 'wallet' | undefined
  let targetLabel: string | undefined
  switch (parsed.data.allocationType) {
    case 'rent': {
      if (!parsed.data.targetEntityId) { error(res, 'Choose a rental agreement'); return }
      const a = await Agreement.findById(parsed.data.targetEntityId)
      if (!a || a.tenantId !== req.user!.userId) { error(res, 'Agreement not found'); return }
      targetEntityType = 'agreement'
      targetLabel = `Rent — agreement ${a._id.toString().slice(-6)}`
      break
    }
    case 'savings': {
      if (!parsed.data.targetEntityId) { error(res, 'Choose a savings plan'); return }
      const p = await SavingsPlan.findById(parsed.data.targetEntityId)
      if (!p || p.userId !== req.user!.userId) { error(res, 'Savings plan not found'); return }
      targetEntityType = 'savings_plan'
      targetLabel = `Savings — ${p.targetAmount.toFixed(0)} target`
      break
    }
    case 'loan_repayment': {
      if (!parsed.data.targetEntityId) { error(res, 'Choose a financing contract'); return }
      const c = await FinancingContract.findById(parsed.data.targetEntityId)
      if (!c || c.applicantId !== req.user!.userId) { error(res, 'Contract not found'); return }
      targetEntityType = 'financing_contract'
      targetLabel = `Loan — ${c._id.toString().slice(-6)}`
      break
    }
    case 'wallet_topup':
      targetEntityType = 'wallet'
      targetLabel = 'Wallet topup'
      break
  }

  const signatureHash = crypto.createHash('sha256').update(parsed.data.signature + req.user!.userId).digest('hex')

  const mandate = await DeductionMandate.create({
    employmentId: employment._id.toString(),
    employerId: employment.employerId,
    employeeId: req.user!.userId,
    allocationType: parsed.data.allocationType,
    targetEntityId: parsed.data.targetEntityId,
    targetEntityType,
    targetLabel,
    amountType: parsed.data.amountType,
    amount: parsed.data.amount,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    noticePeriodDays: parsed.data.noticePeriodDays,
    signatureHash,
    signedAt: new Date().toISOString(),
    status: 'pending',
  })
  success(res, idOf(mandate.toObject()), 'Mandate signed and pending employer approval', 201)
})

// Employer: approve mandate
router.post('/mandates/:id/approve', authenticate, requireRole('employer'), requirePermission('employer:approve_deductions'), async (req, res) => {
  const employer = await loadMyEmployer(req.user!.userId)
  const mandate = await DeductionMandate.findById(param(req.params.id))
  if (!employer || !mandate || mandate.employerId !== employer._id.toString()) { error(res, 'Mandate not found', 404); return }
  if (mandate.status !== 'pending') { error(res, `Mandate is ${mandate.status}`); return }
  mandate.status = 'active'
  mandate.approvedBy = req.user!.userId
  mandate.approvedByEmployerAt = new Date().toISOString()
  await mandate.save()
  success(res, idOf(mandate.toObject()), 'Mandate activated')
})

// Employee: revoke mandate
router.post('/mandates/:id/revoke', authenticate, async (req, res) => {
  const mandate = await DeductionMandate.findById(param(req.params.id))
  if (!mandate || mandate.employeeId !== req.user!.userId) { error(res, 'Mandate not found', 404); return }
  if (mandate.status === 'revoked') { error(res, 'Already revoked'); return }
  mandate.status = 'revoked'
  mandate.revokedAt = new Date().toISOString()
  mandate.revokedReason = req.body.reason ?? 'Revoked by employee'
  await mandate.save()
  success(res, idOf(mandate.toObject()), 'Mandate revoked')
})

// ────────────────────────────────────────
// PAYROLL RUNS
// ────────────────────────────────────────

router.get('/payroll/runs', authenticate, requireRole('employer'), requirePermission('employer:view_payroll_reports'), async (req, res) => {
  const employer = await loadMyEmployer(req.user!.userId)
  if (!employer) { success(res, { items: [], total: 0, page: 1, pageSize: 0, totalPages: 1 }); return }
  const items = await PayrollRun.find({ employerId: employer._id.toString() }).sort({ createdAt: -1 }).lean()
  success(res, { items: items.map(idOf), total: items.length, page: 1, pageSize: items.length, totalPages: 1 })
})

router.post('/payroll/runs', authenticate, requireRole('employer'), requirePermission('employer:run_payroll'), async (req, res) => {
  const schema = z.object({
    periodLabel: z.string().min(1),
    periodStart: z.string(),
    periodEnd: z.string(),
    scheduledPayDate: z.string(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const employer = await loadMyEmployer(req.user!.userId)
  if (!employer) { error(res, 'Create employer profile first'); return }
  const run = await buildPayrollRun(employer._id.toString(), parsed.data.periodLabel, parsed.data.periodStart, parsed.data.periodEnd, parsed.data.scheduledPayDate)
  success(res, idOf(run.toObject()), 'Payroll run created', 201)
})

router.get('/payroll/runs/:id', authenticate, async (req, res) => {
  const run = await PayrollRun.findById(param(req.params.id)).lean()
  if (!run) { error(res, 'Run not found', 404); return }
  if (!isSuperAdmin(req)) {
    const employer = await loadMyEmployer(req.user!.userId)
    if (!employer || run.employerId !== employer._id.toString()) { error(res, 'Not authorized', 403); return }
  }
  success(res, idOf(run))
})

router.post('/payroll/runs/:id/approve', authenticate, requireRole('employer'), requirePermission('employer:run_payroll'), async (req, res) => {
  try {
    const run = await approvePayrollRun(param(req.params.id), req.user!.userId)
    const employer = await loadMyEmployer(req.user!.userId)
    if (!employer || run.employerId !== employer._id.toString()) { error(res, 'Not authorized', 403); return }
    success(res, idOf(run.toObject()), 'Payroll approved')
  } catch (e) {
    error(res, (e as Error).message)
  }
})

router.post('/payroll/runs/:id/process', authenticate, requireRole('employer'), requirePermission('employer:disburse'), async (req, res) => {
  try {
    const employer = await loadMyEmployer(req.user!.userId)
    const existing = await PayrollRun.findById(param(req.params.id))
    if (!existing || !employer || existing.employerId !== employer._id.toString()) { error(res, 'Not authorized', 403); return }
    const run = await processPayrollRun(param(req.params.id))
    success(res, idOf(run.toObject()), 'Payroll processed')
  } catch (e) {
    error(res, (e as Error).message)
  }
})

export default router
