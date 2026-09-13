import { isValidObjectId } from 'mongoose'
import { randomUUID } from 'node:crypto'
import { Payment } from '../../models/Payment.js'
import { rentPeriodError } from './rentPeriod.js'

export interface RentReceipt {
  number: string
  issuedAt: Date
  paymentReference: string
  amount: number
  currency: 'GHS'
  paidAt: string
  periodStart: string
  periodEnd: string
  tenantName: string
  landlordName: string
  propertyTitle: string
  premisesAddress: string
  furnished: boolean
  contextCapturedAt: Date
}
export class RentReceiptError extends Error {
  constructor(public readonly status: 404 | 409, message: string) { super(message) }
}

/** A receipt is a record of confirmed rent received, not a guarantee that all rent is settled.
 * Issuance lives on the payment document so concurrent callers cannot create competing receipts.
 */
export async function issueRentReceipt(paymentId: string, requesterId: string) {
  if (!isValidObjectId(paymentId)) throw new RentReceiptError(404, 'Payment not found')
  const ownership = { _id: paymentId, $or: [{ tenantId: requesterId }, { landlordId: requesterId }] }
  const payment = await Payment.findOne(ownership).lean()
  if (!payment || payment.purpose !== 'rent') throw new RentReceiptError(404, 'Rent payment not found')
  if (payment.rentReceipt) return { receipt: payment.rentReceipt, paymentStatus: payment.status }
  if (payment.status !== 'completed') throw new RentReceiptError(409, 'A receipt can be issued only after the rent payment is confirmed.')
  const context = payment.receiptContext
  const period = payment.rentPeriod
  const completeContext = context?.version === 1 && [context.tenantName, context.landlordName, context.propertyTitle, context.premisesAddress].every(value => typeof value === 'string' && value.trim().length > 0) && typeof context.furnished === 'boolean' && context.capturedAt != null && Number.isFinite(new Date(context.capturedAt).getTime())
  if (!context || !completeContext || !period || rentPeriodError(period) || !payment.paidAt || !Number.isFinite(Date.parse(payment.paidAt)) || !Number.isFinite(payment.amount) || payment.amount <= 0 || !payment.reference) {
    throw new RentReceiptError(409, 'Receipt details are incomplete. Contact support to resolve the payment record.')
  }
  const receipt: RentReceipt = {
    number: `RNT-${randomUUID()}`, issuedAt: new Date(), paymentReference: payment.reference,
    amount: payment.amount, currency: 'GHS', paidAt: payment.paidAt,
    periodStart: period.startDate, periodEnd: period.endDate,
    tenantName: context.tenantName, landlordName: context.landlordName,
    propertyTitle: context.propertyTitle, premisesAddress: context.premisesAddress,
    furnished: context.furnished, contextCapturedAt: context.capturedAt,
  }
  const updated = await Payment.findOneAndUpdate({
    ...ownership, purpose: 'rent', status: 'completed', rentReceipt: { $exists: false },
    amount: payment.amount, reference: payment.reference, paidAt: payment.paidAt,
    receiptContext: context, rentPeriod: period,
  }, { $set: { rentReceipt: receipt } }, { returnDocument: 'after', overwriteImmutable: true, runValidators: true }).lean()
  if (updated?.rentReceipt) return { receipt: updated.rentReceipt, paymentStatus: updated.status }
  // A concurrent successful issuance returns its durable result. Other state changes must retry.
  const winner = await Payment.findOne(ownership).lean()
  if (winner?.rentReceipt) return { receipt: winner.rentReceipt, paymentStatus: winner.status }
  throw new RentReceiptError(409, 'The payment changed while issuing its receipt. Refresh and try again.')
}

/** Read-only export path: opening a document never issues a new receipt. */
export async function readRentReceipt(paymentId: string, requesterId: string) {
  if (!isValidObjectId(paymentId)) throw new RentReceiptError(404, 'Rent payment not found')
  const payment = await Payment.findOne({ _id: paymentId, purpose: 'rent', $or: [{ tenantId: requesterId }, { landlordId: requesterId }] }).lean()
  if (!payment) throw new RentReceiptError(404, 'Rent payment not found')
  if (!payment.rentReceipt) throw new RentReceiptError(409, 'Issue the receipt before opening a printable copy.')
  return { receipt: payment.rentReceipt, paymentStatus: payment.status }
}
