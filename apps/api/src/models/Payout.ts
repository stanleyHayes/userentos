import mongoose, { Schema, type Document } from 'mongoose'

/**
 * A request to move money OUT of the platform to a user's own account.
 *
 * Lifecycle:
 *   requested  — user asked; wallet ALREADY debited (the funds are reserved,
 *                so the same balance cannot be requested twice)
 *   processing — an admin approved it and the PSP accepted the transfer
 *   paid       — PSP confirmed delivery by webhook (terminal)
 *   failed     — PSP rejected it before paying, or an admin declined; the
 *                wallet is credited back (terminal)
 *   reversed   — PSP confirmed delivery, then reversed it and the money came
 *                back to the platform's balance; the wallet is credited back
 *                (terminal)
 *
 * The wallet is debited at request time and refunded on any terminal failure.
 * Doing it the other way round (debit on success) would let a user drain the
 * same balance through several concurrent requests.
 *
 * A refund is captured as `refundIntent` in the same conditional update that
 * makes the payout terminal, then applied through the durable wallet-credit
 * journal (services/payouts/refund.ts). A crash between the two leaves the
 * intent for recoverPayoutRefunds, and the journal's operation key means a
 * retry can never credit twice.
 */
export const PAYOUT_STATUSES = ['requested', 'processing', 'paid', 'failed', 'reversed'] as const

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

export interface IPayout extends Document {
  userId: string
  amount: number
  status: PayoutStatus
  /** Our reference, echoed by the PSP so webhooks can be correlated. */
  reference: string
  /** PSP transfer handle (Paystack TRF_xxx), set once the transfer is accepted. */
  providerRef?: string
  /** Snapshot of the destination at request time — the account may change later. */
  destination: {
    type: string
    accountNumber: string
    bankName: string
    accountName: string
    recipientCode: string
  }
  approvedBy?: string
  approvedAt?: Date
  paidAt?: Date
  failureReason?: string
  /** True once a refund has been claimed, so a retry cannot claim a second one. */
  refunded: boolean
  /** The claimed refund, applied through the durable wallet-credit journal. */
  refundIntent?: { version: number; operationKey: string; userId: string; amount: number; type: string; reference: string }
  refundCompletedAt?: Date
  refundNextAttemptAt?: Date
  reversedAt?: Date
  /**
   * The provider never answered the transfer request (timeout, dropped
   * connection, 5xx), so money may or may not have left. The payout stays
   * 'processing' — which decline cannot touch — until POST /:id/reconcile or
   * a provider webhook settles what actually happened.
   */
  needsReconciliation?: boolean
  /** Scheduled provider checks so far, and when the next is due (backoff). */
  reconcileAttempts?: number
  lastReconcileAt?: Date
  nextReconcileAt?: Date
  createdAt: Date
  updatedAt: Date
}

const payoutSchema = new Schema<IPayout>({
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, required: true, enum: [...PAYOUT_STATUSES], default: 'requested', index: true },
  reference: { type: String, required: true, unique: true, index: true },
  // Unique, below: one transfer handle names one payout.
  providerRef: String,
  destination: {
    type: { type: String, required: true },
    accountNumber: { type: String, required: true },
    bankName: { type: String, required: true },
    accountName: { type: String, required: true },
    recipientCode: { type: String, required: true },
  },
  approvedBy: String,
  approvedAt: Date,
  paidAt: Date,
  failureReason: String,
  refunded: { type: Boolean, default: false },
  refundIntent: { type: new Schema({
    version: { type: Number, enum: [1], required: true, immutable: true },
    operationKey: { type: String, required: true, immutable: true },
    userId: { type: String, required: true, immutable: true },
    amount: { type: Number, required: true, immutable: true },
    type: { type: String, required: true, immutable: true },
    reference: { type: String, required: true, immutable: true },
  }, { _id: false }), immutable: true },
  refundCompletedAt: Date,
  refundNextAttemptAt: Date,
  reversedAt: Date,
  needsReconciliation: Boolean,
  reconcileAttempts: Number,
  lastReconcileAt: Date,
  nextReconcileAt: Date,
}, { timestamps: true })

// The reconciliation sweep's query: held payouts, oldest first.
payoutSchema.index({ needsReconciliation: 1, status: 1, approvedAt: 1 }, { partialFilterExpression: { needsReconciliation: true } })
// Every sent transfer is polled once its webhook is overdue, not only held ones.
payoutSchema.index({ status: 1, nextReconcileAt: 1 }, { partialFilterExpression: { status: 'processing' } })
// Refund recovery: claimed refunds not yet applied.
payoutSchema.index({ 'refundIntent.version': 1, refundCompletedAt: 1, refundNextAttemptAt: 1 })
// Built by src/scripts/syncPaymentIndexes.ts, which also drops the old non-unique providerRef_1.
payoutSchema.index({ providerRef: 1 }, { name: 'payout_provider_ref_unique', unique: true, partialFilterExpression: { providerRef: { $type: 'string' } } })

export const Payout = mongoose.model<IPayout>('Payout', payoutSchema)

/**
 * Statuses no ordinary webhook or admin action may move a payout out of. The
 * one exception is a provider reversal of a 'paid' payout (finalize.ts).
 */
export const TERMINAL_PAYOUT_STATES = ['paid', 'failed', 'reversed'] as const

/** Build the refund a terminal failure, decline or reversal owes the payee. */
export function payoutRefundIntent(payout: { _id: unknown; userId: string; amount: number; reference: string }) {
  return { version: 1, operationKey: `payout-refund:v1:${String(payout._id)}`, userId: payout.userId, amount: payout.amount, type: 'refund', reference: `${payout.reference}-REFUND` }
}
