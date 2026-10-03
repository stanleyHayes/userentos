/**
 * Rules every checkout that starts a real collection shares.
 *
 * - An Idempotency-Key is REQUIRED (428 without one). A retry after a lost
 *   response must find the original attempt instead of charging again; an
 *   optional key protected only the clients that remembered to send one. The
 *   web and mobile clients send it on every provider checkout
 *   (packages/shared/checkoutRequests.ts).
 * - One obligation, one in-flight collection. A second checkout for the same
 *   rent period or subscription — another device, cleared storage, a new key —
 *   gets 409 with the payment already under way, enforced by a unique index on
 *   Payment.openCollectionKey rather than by a read that two requests can both
 *   pass. A payment the provider refused outright fails at once and frees the
 *   slot; a bank transfer, a direct-rail collection or an interrupted
 *   initiation can be cancelled by the payer (POST /api/payments/:id/cancel).
 */
import type { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { Payment } from '../../models/Payment.js'
import { logger } from '../../utils/logger.js'
import { success } from '../../utils/response.js'

const MAX_KEY_LENGTH = 200

/**
 * The request's idempotency key, or null after answering 428. `explicit` is a
 * key the route's own body contract carries (the marketplace checkout's
 * idempotencyKey field); otherwise the Idempotency-Key header.
 */
export function requireIdempotencyKey(req: Request, res: Response, explicit?: string): string | null {
  const header = req.headers['idempotency-key']
  const key = (explicit ?? (typeof header === 'string' ? header : '')).trim()
  if (!key || key.length > MAX_KEY_LENGTH) {
    res.status(428).json({ success: false, error: 'An Idempotency-Key header is required to start a payment.', code: 'IDEMPOTENCY_KEY_REQUIRED' })
    return null
  }
  return key
}

/** A unique-index violation, optionally on a specific field. */
export function isDuplicateKey(err: unknown, field?: string): boolean {
  const failure = err as { code?: number; keyPattern?: Record<string, unknown> }
  return failure?.code === 11000 && (!field || !!failure.keyPattern?.[field])
}

/**
 * 422 for a collection the provider refused outright. The payment is already
 * failed and its obligation freed, so the payer can correct the details (a
 * new payload, so a new key) and pay again straight away.
 */
export function respondCollectionRefused<T extends { _id: unknown }>(res: Response, refused: T, reason: string | undefined) {
  res.status(422).json({
    success: false,
    error: reason
      ? `The payment provider refused this payment: ${reason}. Check the details and try again.`
      : 'The payment provider could not take this payment right now. Try again shortly or choose another method.',
    code: 'PAYMENT_REFUSED',
    data: { payment: { ...refused, id: (refused._id as Types.ObjectId).toString() } },
  })
}

/** 409 carrying the payment already in flight for this obligation, so the client can resume it. */
export function respondCollectionInProgress<T extends { _id: unknown; providerInstructions?: string }>(res: Response, existing: T) {
  res.status(409).json({
    success: false,
    error: 'A payment for this is already in progress. Finish or wait for it before starting another.',
    code: 'PAYMENT_IN_PROGRESS',
    data: { payment: { ...existing, id: (existing._id as Types.ObjectId).toString() }, instructions: existing.providerInstructions },
  })
}

interface RetryPayment { _id: unknown; status: string; idempotencyKey?: string | null; providerInstructions?: string }

/**
 * Answers a retry that found the payment created under its Idempotency-Key,
 * or frees that key and returns false so the caller starts a fresh attempt.
 *
 * - Failed or refunded: nothing is being collected under the key any more.
 *   Replaying it as "Payment already initiated" told the payer a dead payment
 *   was under way, and the web read a reply without instructions as
 *   "Subscription activated!". The client keeps the key after any error, so
 *   its next identical attempt lands here and must start over.
 * - Completed, or under way with the provider's instructions: answered as it
 *   stands, so the client can show the outcome or resume.
 * - Under way without instructions (the start was interrupted): 409 in
 *   progress, which the payer can check again or cancel.
 */
export async function answerRetry(res: Response, existing: RetryPayment, extra: Record<string, unknown> = {}): Promise<boolean> {
  if (existing.status === 'failed' || existing.status === 'refunded') {
    await Payment.updateOne({ _id: existing._id as Types.ObjectId, status: existing.status, idempotencyKey: existing.idempotencyKey ?? undefined }, { $unset: { idempotencyKey: 1 } })
    return false
  }
  const payment = { ...existing, id: (existing._id as Types.ObjectId).toString() }
  if (existing.status === 'completed') {
    success(res, { payment, ...extra }, 'Payment completed')
    return true
  }
  if (existing.providerInstructions) {
    success(res, { payment, instructions: existing.providerInstructions, ...extra }, 'Payment already initiated')
    return true
  }
  respondCollectionInProgress(res, existing)
  return true
}

/**
 * The provider did not answer clearly (an outage, a timeout, a lost reply)
 * after the payment was recorded. The caller has held it as uncertain for
 * reconciliation; the payer is told what is happening instead of "Internal
 * server error", and a retry with the same details finds this payment.
 */
export function respondCollectionUncertain(res: Response, payment: { _id: unknown }, err: unknown) {
  const failure = err as { name?: string; message?: string } | null
  logger.warn(`[Payments] collection ${String(payment._id)} not confirmed by the provider: ${failure?.message ?? 'unknown error'}`)
  const timedOut = failure?.name === 'TimeoutError' || failure?.name === 'AbortError'
  res.status(timedOut ? 504 : 502).json({
    success: false,
    error: "We couldn't confirm this payment yet. We're checking it with the provider; try again in a few minutes.",
    code: 'PAYMENT_UNCONFIRMED',
    data: { payment: { id: (payment._id as Types.ObjectId).toString() } },
  })
}
