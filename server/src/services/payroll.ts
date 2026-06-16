import { Employment } from '../models/Employment.js'
import { DeductionMandate } from '../models/DeductionMandate.js'
import { PayrollRun, type IPayrollDeductionRecord } from '../models/PayrollRun.js'
import { Wallet } from '../models/Wallet.js'
import { Agreement } from '../models/Agreement.js'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { Payment } from '../models/Payment.js'
import { applyRepayment } from './financing.js'
import { notify } from './notify.js'
import { checkAndAward } from './achievements.js'

function round2(n: number) { return Math.round(n * 100) / 100 }

/**
 * Compute deduction amount per mandate for a given employee's net salary.
 * Caps total voluntary deductions to MAX_DEDUCTION_RATIO of net salary
 * (Labour Act 2003 — voluntary deductions must keep employee with adequate take-home pay).
 */
const MAX_DEDUCTION_RATIO = 1 / 3

export async function buildPayrollRun(employerId: string, periodLabel: string, periodStart: string, periodEnd: string, scheduledPayDate: string) {
  const employments = await Employment.find({ employerId, status: 'active' })
  const deductions: IPayrollDeductionRecord[] = []
  let totalGross = 0
  let totalDeductions = 0

  for (const emp of employments) {
    totalGross += emp.netMonthlySalary
    const mandates = await DeductionMandate.find({ employmentId: emp._id.toString(), status: 'active' })

    let employeeDeductionTotal = 0
    const cap = round2(emp.netMonthlySalary * MAX_DEDUCTION_RATIO)

    for (const m of mandates) {
      const raw = m.amountType === 'percentage'
        ? round2(emp.netMonthlySalary * (m.amount / 100))
        : m.amount
      const headroom = round2(cap - employeeDeductionTotal)
      if (headroom <= 0) {
        deductions.push({
          mandateId: m._id.toString(),
          employeeId: emp.userId,
          allocationType: m.allocationType,
          targetEntityId: m.targetEntityId,
          targetEntityType: m.targetEntityType,
          amount: 0,
          status: 'skipped',
          failureReason: 'Statutory deduction cap reached',
        })
        continue
      }
      const amount = Math.min(raw, headroom)
      employeeDeductionTotal = round2(employeeDeductionTotal + amount)
      totalDeductions = round2(totalDeductions + amount)
      deductions.push({
        mandateId: m._id.toString(),
        employeeId: emp.userId,
        allocationType: m.allocationType,
        targetEntityId: m.targetEntityId,
        targetEntityType: m.targetEntityType,
        amount,
        status: 'queued',
      })
    }
  }

  const totalNet = round2(totalGross - totalDeductions)

  const run = await PayrollRun.create({
    employerId,
    periodLabel,
    periodStart,
    periodEnd,
    scheduledPayDate,
    totalGross: round2(totalGross),
    totalDeductions,
    totalNet,
    employeeCount: employments.length,
    deductions,
    status: 'pending_approval',
  })
  return run
}

/**
 * Approve a payroll run — locks the run for processing.
 */
export async function approvePayrollRun(runId: string, approvedBy: string) {
  const run = await PayrollRun.findById(runId)
  if (!run) throw new Error('Payroll run not found')
  if (run.status !== 'pending_approval' && run.status !== 'draft') {
    throw new Error(`Run is ${run.status} — cannot approve`)
  }
  run.status = 'approved'
  run.approvedBy = approvedBy
  run.approvedAt = new Date().toISOString()
  await run.save()
  return run
}

/**
 * Process an approved run — disburse each deduction to its target.
 */
export async function processPayrollRun(runId: string) {
  // Atomically claim the run (approved -> processing) so two concurrent process
  // calls (or a retry) can't disburse every deduction twice.
  const run = await PayrollRun.findOneAndUpdate(
    { _id: runId, status: 'approved' },
    { $set: { status: 'processing' } },
    { new: true },
  )
  if (!run) {
    const existing = await PayrollRun.findById(runId)
    if (!existing) throw new Error('Payroll run not found')
    throw new Error(`Run is ${existing.status} — must be approved first`)
  }

  for (const ded of run.deductions) {
    if (ded.status !== 'queued') continue
    try {
      await disburseDeduction(ded, run.employerId)
      ded.status = 'disbursed'
      ded.disbursementReference = `PAY-${runId.toString().slice(-6)}-${ded.employeeId.slice(-4)}-${ded.allocationType.slice(0, 3)}`

      // Achievements: rent paid via payroll
      if (ded.allocationType === 'rent') {
        checkAndAward(ded.employeeId, 'payroll_payment', {
          payrollRunId: runId,
          amount: ded.amount,
        }).catch((err) =>
          console.warn('[payroll/process] achievement award failed:', err),
        )
      }
    } catch (err) {
      ded.status = 'failed'
      ded.failureReason = (err as Error).message
    }
  }

  run.status = run.deductions.some((d) => d.status === 'failed')
    ? 'failed'
    : 'processed'
  run.processedAt = new Date().toISOString()
  if (run.status === 'failed') {
    run.failureReason = 'One or more deductions failed — see deduction list'
  }
  await run.save()
  return run
}

async function disburseDeduction(ded: IPayrollDeductionRecord, _employerId: string) {
  if (ded.amount <= 0) return

  switch (ded.allocationType) {
    case 'rent': {
      if (!ded.targetEntityId) throw new Error('Missing agreement target')
      const agreement = await Agreement.findById(ded.targetEntityId)
      if (!agreement) throw new Error('Agreement not found')
      const rentRef = `PAYROLL-RENT-${Date.now()}`
      const landlordWallet = await Wallet.findOneAndUpdate(
        { userId: agreement.landlordId },
        { $inc: { balance: ded.amount } },
        { new: true, upsert: true },
      )
      await Wallet.updateOne({ userId: agreement.landlordId }, { $push: { transactions: {
        type: 'deposit',
        amount: ded.amount,
        balanceAfter: landlordWallet.balance,
        reference: rentRef,
        description: `Rent (payroll deduction) from ${ded.employeeName ?? ded.employeeId}`,
        createdAt: new Date().toISOString(),
      } } })

      // Record as a Payment too
      await Payment.create({
        agreementId: agreement._id.toString(),
        tenantId: ded.employeeId,
        landlordId: agreement.landlordId,
        amount: ded.amount,
        method: 'bank_transfer',
        status: 'completed',
        reference: `PAYROLL-${Date.now()}`,
        paidAt: new Date().toISOString(),
      })

      notify({
        userId: ded.employeeId,
        title: 'Rent Paid via Payroll',
        message: `GHS ${ded.amount.toFixed(2)} rent has been paid from your salary.`,
        actionUrl: '/payments',
      })
      return
    }
    case 'savings': {
      if (!ded.targetEntityId) throw new Error('Missing savings plan target')
      const plan = await SavingsPlan.findByIdAndUpdate(ded.targetEntityId, { $inc: { currentAmount: ded.amount } }, { new: true })
      if (!plan) throw new Error('Savings plan not found')
      if (plan.status !== 'completed' && plan.currentAmount >= plan.targetAmount) {
        await SavingsPlan.updateOne({ _id: plan._id }, { $set: { status: 'completed' } })
        checkAndAward(plan.userId, 'savings_goal_hit', { planId: plan._id.toString() })
          .catch((err) => console.warn('[payroll/savings] achievement award failed:', err))
      }
      return
    }
    case 'loan_repayment': {
      if (!ded.targetEntityId) throw new Error('Missing financing contract target')
      await applyRepayment(ded.targetEntityId, ded.amount, `PAYROLL-${Date.now()}`)
      return
    }
    case 'wallet_topup': {
      const topupRef = `PAYROLL-WALLET-${Date.now()}`
      const wallet = await Wallet.findOneAndUpdate(
        { userId: ded.employeeId },
        { $inc: { balance: ded.amount } },
        { new: true, upsert: true },
      )
      await Wallet.updateOne({ userId: ded.employeeId }, { $push: { transactions: {
        type: 'deposit',
        amount: ded.amount,
        balanceAfter: wallet.balance,
        reference: topupRef,
        description: 'Salary topup via payroll',
        createdAt: new Date().toISOString(),
      } } })
      return
    }
  }
}
