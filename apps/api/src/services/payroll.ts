import { Employment } from '../models/Employment.js'
import { Employer } from '../models/Employer.js'
import { DeductionMandate } from '../models/DeductionMandate.js'
import { PayrollRun, type IPayrollDeductionRecord } from '../models/PayrollRun.js'
import { Agreement } from '../models/Agreement.js'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { Payment } from '../models/Payment.js'
import { applyRepayment } from './financing.js'
import { notify } from './notify.js'
import { checkAndAward } from './achievements.js'
import { creditWallet, debitWallet } from './payments/walletLedger.js'
import { round2 } from '../utils/money.js'

/**
 * Compute deduction amount per mandate for a given employee's net salary.
 * Caps total voluntary deductions to MAX_DEDUCTION_RATIO of net salary
 * (Labour Act 2003 — voluntary deductions must keep employee with adequate take-home pay).
 */
const MAX_DEDUCTION_RATIO = 1 / 3

/** A mandate only deducts when the run's period overlaps its active window. */
function mandateActiveInPeriod(m: { startDate?: string; endDate?: string }, periodStart: Date, periodEnd: Date): boolean {
  if (m.startDate && new Date(m.startDate) > periodEnd) return false
  if (m.endDate && new Date(m.endDate) < periodStart) return false
  return true
}

export async function buildPayrollRun(employerId: string, periodLabel: string, periodStart: string, periodEnd: string, scheduledPayDate: string) {
  const periodStartDate = new Date(periodStart)
  const periodEndDate = new Date(periodEnd)
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
      // Skip expired / not-yet-started mandates — status:'active' alone is not enough.
      if (!mandateActiveInPeriod(m, periodStartDate, periodEndDate)) continue

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
 * The run is FUNDED from the employer's wallet up front: no employer funds,
 * no disbursement. Previously this credited destination wallets with no
 * source of funds at all — unbacked money creation.
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

  try {
    const employer = await Employer.findById(run.employerId).lean()
    if (!employer) throw new Error('Employer not found for this run')

    // Fund the deductions from the employer's wallet BEFORE paying anything out.
    const totalToFund = round2(run.deductions
      .filter((d) => d.status === 'queued')
      .reduce((sum, d) => sum + d.amount, 0))

    if (totalToFund > 0) {
      const funded = await debitWallet(employer.ownerId, totalToFund, {
        type: 'payroll_funding',
        reference: `PAYROLL-FUND-${runId.toString().slice(-8)}`,
        description: `Payroll run ${run.periodLabel} — deduction funding`,
      })
      if (!funded) {
        // The outer catch puts the run back so the employer can top up and retry.
        throw new Error(`Insufficient employer wallet balance to fund deductions (GHS ${totalToFund.toFixed(2)} required)`)
      }
    }

    for (const ded of run.deductions) {
      if (ded.status !== 'queued') continue
      try {
        await disburseDeduction(ded, employer.ownerId)
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
        // Refund the failed deduction to the employer immediately.
        try {
          await creditWallet(employer.ownerId, ded.amount, {
            type: 'refund',
            reference: `PAYROLL-REFUND-${runId.toString().slice(-8)}-${ded.mandateId.slice(-4)}`,
            description: `Refund: failed ${ded.allocationType} deduction (${run.periodLabel})`,
          })
        } catch (refundErr) {
          console.error(`[payroll/process] CRITICAL: refund of failed deduction ${ded.mandateId} failed: ${(refundErr as Error).message}`)
        }
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
  } catch (err) {
    // Any failure after the atomic claim must not wedge the run in 'processing'
    // (re-processing requires 'approved') — reset it so the run stays retryable.
    try {
      await PayrollRun.updateOne(
        { _id: runId },
        { $set: { status: 'approved', failureReason: (err as Error).message } },
      )
    } catch (resetErr) {
      console.error(`[payroll/process] CRITICAL: could not reset run ${runId} to approved: ${(resetErr as Error).message}`)
    }
    throw err
  }
}

async function disburseDeduction(ded: IPayrollDeductionRecord, employerOwnerId: string) {
  if (ded.amount <= 0) return

  switch (ded.allocationType) {
    case 'rent': {
      if (!ded.targetEntityId) throw new Error('Missing agreement target')
      const agreement = await Agreement.findById(ded.targetEntityId)
      if (!agreement) throw new Error('Agreement not found')
      const rentRef = `PAYROLL-RENT-${Date.now()}`
      await creditWallet(agreement.landlordId!, ded.amount, {
        type: 'deposit',
        reference: rentRef,
        description: `Rent (payroll deduction) from ${ded.employeeName ?? ded.employeeId}`,
      })

      // Record as a Payment too. If this fails after the credit, roll the credit
      // back — the outer catch refunds the employer, so keeping the landlord
      // credit as well would leave unbacked money on both sides.
      try {
        await Payment.create({
          agreementId: agreement._id.toString(),
          tenantId: ded.employeeId,
          landlordId: agreement.landlordId,
          amount: ded.amount,
          method: 'bank_transfer',
          status: 'completed',
          reference: `PAYROLL-${Date.now()}`,
          purpose: 'rent',
          paidAt: new Date().toISOString(),
        })
      } catch (err) {
        try {
          const reversed = await debitWallet(agreement.landlordId!, ded.amount, {
            type: 'reversal',
            reference: `${rentRef}-REV`,
            description: 'Rollback: rent payment record failed after wallet credit',
          })
          if (!reversed) throw new Error('landlord wallet rollback returned false', { cause: err })
        } catch (rollbackErr) {
          console.error(`[payroll/rent] CRITICAL: landlord credit ${rentRef} not rolled back: ${(rollbackErr as Error).message}`)
        }
        throw err
      }

      notify({
        userId: ded.employeeId,
        title: 'Rent Paid via Payroll',
        message: `GHS ${ded.amount.toFixed(2)} rent has been paid from your salary.`,
        actionUrl: '/payments',
      }).catch((err) => console.warn('[payroll/rent] notify failed:', err))
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
      const { applied } = await applyRepayment(ded.targetEntityId, ded.amount, `PAYROLL-${Date.now()}`)
      // The employer funded the full mandate amount — refund whatever the
      // contract couldn't absorb (mandate exceeds the remaining balance),
      // otherwise the overpayment vanishes.
      const excess = round2(ded.amount - applied)
      if (excess > 0) {
        try {
          await creditWallet(employerOwnerId, excess, {
            type: 'refund',
            reference: `PAYROLL-LOAN-EXCESS-${Date.now()}`,
            description: 'Refund: payroll loan repayment exceeded remaining balance',
          })
        } catch (refundErr) {
          console.error(`[payroll/loan] CRITICAL: excess refund of GHS ${excess} to employer failed: ${(refundErr as Error).message}`)
        }
      }
      return
    }
    case 'wallet_topup': {
      await creditWallet(ded.employeeId, ded.amount, {
        type: 'deposit',
        reference: `PAYROLL-WALLET-${Date.now()}`,
        description: 'Salary topup via payroll',
      })
      return
    }
  }
}
