import { FinancingContract, type IRepaymentScheduleItem } from '../models/FinancingContract.js'
import { FinancingApplication } from '../models/FinancingApplication.js'
import { FinancingOffer } from '../models/FinancingOffer.js'
import { creditWallet, debitWallet } from './payments/walletLedger.js'
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

/** A financing failure the caller can show, with its HTTP status. */
export class FinancingError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000

/**
 * Approve an application — creates a contract with a full amortization schedule.
 * The status flip is conditional, so concurrent approvals can't both proceed, and a
 * unique index on applicationId backs it up at the contract level.
 */
export async function approveApplication(applicationId: string, decidedBy: string, notes?: string, financierId?: string) {
  const decidedAt = new Date().toISOString()
  const before = await FinancingApplication.findOneAndUpdate(
    { _id: applicationId, status: { $in: ['submitted', 'under_review'] }, ...(financierId ? { financierId } : {}) },
    { $set: { status: 'approved', decidedBy, decidedAt, decisionNotes: notes } },
    { returnDocument: 'before' },
  )
  if (!before) {
    const existing = await FinancingApplication.findById(applicationId).select('status').lean()
    if (!existing) throw new FinancingError('Application not found', 404)
    throw new FinancingError(`Application is ${existing.status} — cannot approve`, 409)
  }
  const revert = () => FinancingApplication.updateOne({ _id: before._id }, { $set: { status: before.status }, $unset: { decidedBy: 1, decidedAt: 1, decisionNotes: 1 } })

  const offer = await FinancingOffer.findById(before.offerId)
  if (!offer) { await revert(); throw new FinancingError('Offer not found', 404) }

  const quote = buildCreditQuote({
    principal: before.amountRequested,
    annualInterestRate: offer.annualInterestRate,
    tenureMonths: before.tenureMonths,
    processingFeePct: offer.processingFeePct,
  })

  let contract
  try {
    contract = await FinancingContract.create({
      applicationId: before._id.toString(),
      financierId: before.financierId,
      applicantId: before.applicantId,
      applicantName: before.applicantName,
      agreementId: before.agreementId,
      productType: offer.productType,
      principal: before.amountRequested,
      annualInterestRate: offer.annualInterestRate,
      tenureMonths: before.tenureMonths,
      processingFee: quote.processingFee,
      apr: quote.apr,
      monthlyPayment: quote.monthlyPayment,
      totalRepayable: quote.totalRepayable,
      amountRepaid: 0,
      status: 'pending_disbursement',
      schedule: quote.schedule,
      signedByApplicant: false,
      signedByFinancier: true,
    })
  } catch (err) {
    if (isDuplicateKey(err)) throw new FinancingError('A contract already exists for this application', 409)
    await revert()
    throw err
  }

  const application = (await FinancingApplication.findById(before._id))!
  notify({
    userId: before.applicantId,
    title: 'Financing Approved',
    message: `Your ${offer.name} application for GHS ${before.amountRequested.toFixed(2)} has been approved. Review the terms (APR ${quote.apr}%) and sign the contract to proceed.`,
    actionUrl: `/financing/contracts/${contract._id}`,
  }).catch((err) => console.warn('[financing] notify failed:', err))

  return { application, contract }
}

export type DisbursementFunding =
  /** The financier pays from its RentOS wallet. */
  | { kind: 'financier_wallet' }
  /** The financier's money already arrived in the platform account under this reference. */
  | { kind: 'external_settlement'; settlementReference: string }

/**
 * Disburse an approved + signed contract to the landlord (rent advance) or the
 * applicant. Every credit is matched by the financier's wallet debit or backed by
 * a unique external settlement — never created from nothing.
 */
export async function disburseContract(contractId: string, funding: DisbursementFunding = { kind: 'financier_wallet' }) {
  const ref = funding.kind === 'external_settlement' ? funding.settlementReference : `FIN-${contractId}`

  const pending = await FinancingContract.findById(contractId).lean()
  if (!pending) throw new FinancingError('Contract not found', 404)
  if (pending.productType === 'rent_advance' && !pending.landlordId) throw new FinancingError('A rent advance must be paid to the landlord on a signed agreement')

  // Atomically claim the disbursement: only one caller can flip a signed,
  // pending_disbursement contract to active, so the principal can never be
  // disbursed twice (previously a concurrent/retried call double-paid).
  let contract
  try {
    contract = await FinancingContract.findOneAndUpdate(
      { _id: contractId, status: 'pending_disbursement', signedByApplicant: true },
      { $set: { status: 'active', disbursedAt: new Date().toISOString(), disbursementReference: ref, fundingSource: funding.kind }, $inc: { __v: 1 } },
      { returnDocument: 'after' },
    )
  } catch (err) {
    if (isDuplicateKey(err)) throw new FinancingError('That settlement reference already funds another disbursement', 409)
    throw err
  }
  if (!contract) {
    if (!pending.signedByApplicant) throw new FinancingError('Applicant must sign contract before disbursement')
    throw new FinancingError(`Contract is ${pending.status} — cannot disburse`, 409)
  }
  const revert = () => FinancingContract.updateOne(
    { _id: contractId },
    { $set: { status: 'pending_disbursement' }, $unset: { disbursedAt: 1, disbursementReference: 1, fundingSource: 1 }, $inc: { __v: 1 } },
  )

  // Disburse to landlord if linked to agreement; else to applicant wallet
  const recipientUserId = contract.landlordId ?? contract.applicantId
  const netAmount = round2(contract.principal - contract.processingFee)
  if (funding.kind === 'financier_wallet') {
    const funded = await debitWallet(contract.financierId, netAmount, { type: 'financing_funding', reference: ref, description: `Financing disbursement ${contractId.slice(-6)}` })
    if (!funded) { await revert(); throw new FinancingError('Insufficient financier wallet balance to fund this disbursement') }
  }
  try {
    await creditWallet(recipientUserId, netAmount, {
      type: 'financing_disbursement',
      reference: ref,
      description: `Financing disbursement (${contract.productType.replace('_', ' ')})`,
    })
  } catch (err) {
    if (funding.kind === 'financier_wallet') {
      await creditWallet(contract.financierId, netAmount, { type: 'refund', reference: `${ref}-REV`, description: 'Reversal of failed financing disbursement' })
        .catch((refundErr) => console.error(`[financing/disburse] CRITICAL: financier refund failed for ${contractId}: ${(refundErr as Error).message}`))
    }
    await revert()
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
  const applied = round2(amount - remaining)
  // The financier is the creditor: what the borrower (or their employer) pays reaches it.
  if (applied > 0) {
    await creditWallet(contract.financierId, applied, { type: 'financing_repayment_received', reference, description: `Repayment on contract ${contract._id.toString().slice(-6)}` })
      .catch((err) => console.error(`[financing/repay] CRITICAL: repayment ${reference} not credited to financier ${contract.financierId}: ${(err as Error).message}`))
  }
  return { contract, applied, reference }
}
