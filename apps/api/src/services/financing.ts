import { FinancingContract, type IRepaymentScheduleItem } from '../models/FinancingContract.js'
import { FinancingApplication } from '../models/FinancingApplication.js'
import { FinancingOffer } from '../models/FinancingOffer.js'
import { creditWallet } from './payments/walletLedger.js'
import { round2 } from '../utils/money.js'
import { notify } from './notify.js'

export interface AmortizationParams {
  principal: number
  annualInterestRate: number
  tenureMonths: number
  startDate?: Date
}

export interface AmortizationResult {
  monthlyPayment: number
  totalRepayable: number
  schedule: IRepaymentScheduleItem[]
}

/**
 * Compute fixed-payment amortization (standard reducing-balance loan).
 * If interest rate is 0, returns flat installments.
 */
export function buildAmortizationSchedule({ principal, annualInterestRate, tenureMonths, startDate = new Date() }: AmortizationParams): AmortizationResult {
  const r = annualInterestRate / 100 / 12
  const n = tenureMonths
  const monthlyPayment = r === 0
    ? principal / n
    : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)

  let balance = principal
  const schedule: IRepaymentScheduleItem[] = []
  for (let i = 1; i <= n; i++) {
    const interest = round2(balance * r)
    const principalDue = round2(monthlyPayment - interest)
    balance = round2(balance - principalDue)
    if (i === n) {
      // absorb rounding into final installment
      const remaining = balance
      balance = 0
      schedule.push({
        installmentNumber: i,
        dueDate: addMonths(startDate, i).toISOString().slice(0, 10),
        principal: round2(principalDue + remaining),
        interest,
        amountDue: round2(monthlyPayment + remaining),
        amountPaid: 0,
        status: 'scheduled',
      })
    } else {
      schedule.push({
        installmentNumber: i,
        dueDate: addMonths(startDate, i).toISOString().slice(0, 10),
        principal: principalDue,
        interest,
        amountDue: round2(monthlyPayment),
        amountPaid: 0,
        status: 'scheduled',
      })
    }
  }

  const totalRepayable = round2(schedule.reduce((sum, s) => sum + s.amountDue, 0))
  return { monthlyPayment: round2(monthlyPayment), totalRepayable, schedule }
}

function addMonths(d: Date, m: number) {
  const out = new Date(d)
  out.setMonth(out.getMonth() + m)
  return out
}

/**
 * Nominal APR (%): the monthly rate that discounts the payments back to what the
 * borrower actually receives, times twelve. Fees deducted up front raise it above
 * the headline interest rate, which is the point of disclosing it.
 */
export function computeApr(netDisbursed: number, payments: number[]): number {
  const total = payments.reduce((sum, p) => sum + p, 0)
  if (netDisbursed <= 0 || total <= netDisbursed) return 0
  const presentValue = (i: number) => payments.reduce((sum, p, k) => sum + p / Math.pow(1 + i, k + 1), 0)
  let lo = 0
  let hi = 1
  while (presentValue(hi) > netDisbursed) hi *= 2
  for (let n = 0; n < 200; n++) {
    const mid = (lo + hi) / 2
    if (presentValue(mid) > netDisbursed) lo = mid
    else hi = mid
  }
  return round2(((lo + hi) / 2) * 12 * 100)
}

export interface CreditQuote {
  principal: number
  tenureMonths: number
  annualInterestRate: number
  processingFee: number
  netDisbursed: number
  monthlyPayment: number
  totalRepayable: number
  /** Everything paid beyond what is received: interest plus fees. */
  totalCostOfCredit: number
  apr: number
  schedule: IRepaymentScheduleItem[]
}

/** The full pre-contract disclosure: what is received, what is repaid, when, and the all-in APR. */
export function buildCreditQuote({ principal, annualInterestRate, tenureMonths, processingFeePct = 0, startDate = new Date() }: AmortizationParams & { processingFeePct?: number }): CreditQuote {
  const { monthlyPayment, totalRepayable, schedule } = buildAmortizationSchedule({ principal, annualInterestRate, tenureMonths, startDate })
  const processingFee = round2(principal * (processingFeePct / 100))
  const netDisbursed = round2(principal - processingFee)
  return {
    principal,
    tenureMonths,
    annualInterestRate,
    processingFee,
    netDisbursed,
    monthlyPayment,
    totalRepayable,
    totalCostOfCredit: round2(totalRepayable - netDisbursed),
    apr: computeApr(netDisbursed, schedule.map((s) => s.amountDue)),
    schedule,
  }
}

/**
 * Approve an application — creates a contract with a full amortization schedule.
 */
export async function approveApplication(applicationId: string, decidedBy: string, notes?: string) {
  const application = await FinancingApplication.findById(applicationId)
  if (!application) throw new Error('Application not found')
  if (application.status !== 'submitted' && application.status !== 'under_review') {
    throw new Error(`Application is ${application.status} — cannot approve`)
  }

  const offer = await FinancingOffer.findById(application.offerId)
  if (!offer) throw new Error('Offer not found')

  const processingFee = round2(application.amountRequested * (offer.processingFeePct / 100))
  const { monthlyPayment, totalRepayable, schedule } = buildAmortizationSchedule({
    principal: application.amountRequested,
    annualInterestRate: offer.annualInterestRate,
    tenureMonths: application.tenureMonths,
    startDate: new Date(),
  })

  application.status = 'approved'
  application.decidedBy = decidedBy
  application.decidedAt = new Date().toISOString()
  application.decisionNotes = notes
  await application.save()

  const contract = await FinancingContract.create({
    applicationId: application._id.toString(),
    financierId: application.financierId,
    applicantId: application.applicantId,
    applicantName: application.applicantName,
    agreementId: application.agreementId,
    productType: offer.productType,
    principal: application.amountRequested,
    annualInterestRate: offer.annualInterestRate,
    tenureMonths: application.tenureMonths,
    processingFee,
    monthlyPayment,
    totalRepayable,
    amountRepaid: 0,
    status: 'pending_disbursement',
    schedule,
    signedByApplicant: false,
    signedByFinancier: true,
  })

  notify({
    userId: application.applicantId,
    title: 'Financing Approved',
    message: `Your ${offer.name} application for GHS ${application.amountRequested.toFixed(2)} has been approved. Sign the contract to proceed with disbursement.`,
    actionUrl: `/financing/contracts/${contract._id}`,
  }).catch((err) => console.warn('[financing] notify failed:', err))

  return { application, contract }
}

/**
 * Disburse an approved + signed contract to landlord wallet (or applicant wallet for non-rent products).
 */
export async function disburseContract(contractId: string) {
  const ref = `FIN-${Date.now().toString(36).toUpperCase()}`

  // Atomically claim the disbursement: only one caller can flip a signed,
  // pending_disbursement contract to active, so the principal can never be
  // disbursed twice (previously a concurrent/retried call double-paid).
  const contract = await FinancingContract.findOneAndUpdate(
    { _id: contractId, status: 'pending_disbursement', signedByApplicant: true },
    { $set: { status: 'active', disbursedAt: new Date().toISOString(), disbursementReference: ref } },
    { returnDocument: 'after' },
  )
  if (!contract) {
    const existing = await FinancingContract.findById(contractId)
    if (!existing) throw new Error('Contract not found')
    if (!existing.signedByApplicant) throw new Error('Applicant must sign contract before disbursement')
    throw new Error(`Contract is ${existing.status} — cannot disburse`)
  }

  // Disburse to landlord if linked to agreement; else to applicant wallet
  const recipientUserId = contract.landlordId ?? contract.applicantId
  const netAmount = round2(contract.principal - contract.processingFee)
  try {
    await creditWallet(recipientUserId, netAmount, {
      type: 'deposit',
      reference: ref,
      description: `Financing disbursement (${contract.productType.replace('_', ' ')})`,
    })
  } catch (err) {
    // Credit failed — revert the claim so the contract isn't active-but-unfunded.
    await FinancingContract.updateOne(
      { _id: contractId },
      { $set: { status: 'pending_disbursement' }, $unset: { disbursedAt: 1, disbursementReference: 1 } },
    )
    console.error(`[financing/disburse] credit failed, claim reverted for ${contractId}: ${(err as Error).message}`)
    throw err
  }

  notify({
    userId: contract.applicantId,
    title: 'Financing Disbursed',
    message: `GHS ${netAmount.toFixed(2)} has been disbursed. Repayment begins on ${contract.schedule[0]?.dueDate ?? 'your first installment date'}.`,
    actionUrl: `/financing/contracts/${contract._id}`,
  }).catch((err) => console.warn('[financing] notify failed:', err))

  return contract
}

/**
 * Apply a repayment against the next due installment(s).
 */
export async function applyRepayment(contractId: string, amount: number, reference: string) {
  const contract = await FinancingContract.findById(contractId)
  if (!contract) throw new Error('Contract not found')
  if (!['active', 'in_grace', 'in_arrears'].includes(contract.status)) {
    throw new Error(`Contract is ${contract.status} — cannot accept repayment`)
  }

  let remaining = amount
  for (const item of contract.schedule) {
    if (remaining <= 0) break
    if (item.status === 'paid' || item.status === 'waived') continue
    const due = round2(item.amountDue - item.amountPaid)
    if (due <= 0) continue
    const apply = Math.min(remaining, due)
    item.amountPaid = round2(item.amountPaid + apply)
    remaining = round2(remaining - apply)
    if (item.amountPaid >= item.amountDue) {
      item.status = 'paid'
      item.paidAt = new Date().toISOString()
    } else {
      item.status = 'partial'
    }
  }
  contract.amountRepaid = round2(contract.amountRepaid + (amount - remaining))

  if (contract.amountRepaid >= contract.totalRepayable - 0.01) {
    contract.status = 'settled'
    notify({
      userId: contract.applicantId,
      title: 'Financing Settled',
      message: 'Congratulations! Your financing contract has been fully repaid.',
      actionUrl: `/financing/contracts/${contract._id}`,
    }).catch((err) => console.warn('[financing] notify failed:', err))
  }

  await contract.save()
  return { contract, applied: round2(amount - remaining), reference }
}
