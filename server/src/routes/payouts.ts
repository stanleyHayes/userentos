/**
 * Payouts — moving money OUT of the platform to a user's own MoMo wallet or
 * bank account.
 *
 * Shape of the flow:
 *   1. The user registers a destination (PUT /account). We hand it to the PSP,
 *      which resolves the real account name and returns a recipient handle.
 *   2. The user requests a payout (POST /). The wallet is debited immediately
 *      so the same balance cannot be requested twice.
 *   3. An admin approves it (POST /:id/approve). Only then does money leave.
 *   4. The PSP confirms by webhook, and finalizePayout settles or refunds.
 *
 * Approval is deliberately manual: this is the only route in the system that
 * pushes real money to an account we do not control.
 */

import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate, requirePermission } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { Payout, PAYOUT_STATUSES, type PayoutStatus } from '../models/Payout.js'
import { PayoutAccount } from '../models/PayoutAccount.js'
import { Wallet } from '../models/Wallet.js'
import { User } from '../models/User.js'
import { creditWallet, debitWallet } from '../services/payments/walletLedger.js'
import { getPayoutProvider } from '../services/payouts/index.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'
import { notify } from '../services/notify.js'
import { logger } from '../utils/logger.js'
import { round2 } from '../utils/money.js'

const router = Router()

/** Below this a payout costs more in provider fees than it is worth. */
const MIN_PAYOUT_AMOUNT = 10

const accountSchema = z.object({
  type: z.enum(['mobile_money', 'ghipss']),
  accountNumber: z.string().trim().min(6).max(24),
  bankCode: z.string().trim().min(1).max(20),
  accountName: z.string().trim().min(2).max(120),
})

const requestSchema = z.object({
  amount: z.number().positive(),
})

const declineSchema = z.object({
  reason: z.string().trim().min(3).max(300),
})

function payoutView(p: {
  _id: unknown
  userId: string
  amount: number
  status: string
  reference: string
  destination: { bankName: string; accountNumber: string; accountName: string }
  failureReason?: string
  createdAt?: Date
  paidAt?: Date
}) {
  return {
    id: (p._id as Types.ObjectId).toString(),
    userId: p.userId,
    amount: p.amount,
    status: p.status,
    reference: p.reference,
    destination: {
      bankName: p.destination.bankName,
      accountNumber: p.destination.accountNumber,
      accountName: p.destination.accountName,
    },
    failureReason: p.failureReason,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
  }
}

// ─── Destinations ───

/** Telcos and banks a payout can be sent to — populates the account form. */
router.get('/destinations', authenticate, asyncHandler(async (_req, res) => {
  try {
    const destinations = await getPayoutProvider().listDestinations()
    success(res, { items: destinations, total: destinations.length })
  } catch (err) {
    logger.error(`[Payouts] listing destinations failed: ${(err as Error).message}`)
    error(res, 'Could not load payout destinations right now', 502)
  }
}))

// ─── The user's payout account ───

router.get('/account', authenticate, asyncHandler(async (req, res) => {
  const account = await PayoutAccount.findOne({ userId: req.user!.userId }).lean()
  if (!account) { success(res, null); return }

  success(res, {
    type: account.type,
    accountNumber: account.accountNumber,
    bankCode: account.bankCode,
    bankName: account.bankName,
    accountName: account.accountName,
    verified: account.verified,
  })
}))

/**
 * Register or replace the destination. The PSP call happens BEFORE anything is
 * persisted, so an account we could not register never looks saved.
 */
router.put('/account', authenticate, asyncHandler(async (req, res) => {
  const parsed = accountSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const provider = getPayoutProvider()
  const destinations = await provider.listDestinations().catch(() => [])
  const destination = destinations.find((d) => d.code === parsed.data.bankCode && d.type === parsed.data.type)
  if (!destination) {
    error(res, 'Unknown bank or mobile money provider')
    return
  }

  let recipient
  try {
    recipient = await provider.createRecipient({
      type: parsed.data.type,
      name: parsed.data.accountName,
      accountNumber: parsed.data.accountNumber,
      bankCode: parsed.data.bankCode,
    })
  } catch (err) {
    logger.warn(`[Payouts] recipient creation failed for user ${req.user!.userId}: ${(err as Error).message}`)
    error(res, 'That account could not be verified. Check the number and provider and try again.', 422)
    return
  }

  const account = await PayoutAccount.findOneAndUpdate(
    { userId: req.user!.userId },
    {
      $set: {
        type: parsed.data.type,
        accountNumber: parsed.data.accountNumber,
        bankCode: parsed.data.bankCode,
        bankName: destination.name,
        accountName: recipient.accountName,
        recipientCode: recipient.recipientCode,
        verified: true,
      },
    },
    { upsert: true, returnDocument: 'after' },
  )

  recordAudit(req, 'payout_account.updated', 'PayoutAccount', String(account!._id), {
    type: account!.type,
    bankName: account!.bankName,
  })

  success(res, {
    type: account!.type,
    accountNumber: account!.accountNumber,
    bankCode: account!.bankCode,
    bankName: account!.bankName,
    accountName: account!.accountName,
    verified: account!.verified,
  }, 'Payout account saved')
}))

router.delete('/account', authenticate, asyncHandler(async (req, res) => {
  // An in-flight payout still has its own snapshot of the destination, so
  // removing the account cannot strand one mid-transfer.
  await PayoutAccount.deleteOne({ userId: req.user!.userId })
  success(res, null, 'Payout account removed')
}))

// ─── Requesting a payout ───

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const payouts = await Payout.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).limit(100).lean()
  success(res, { items: payouts.map((p) => payoutView(p as never)), total: payouts.length })
}))

router.post('/', authenticate, asyncHandler(async (req, res) => {
  const parsed = requestSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const amount = round2(parsed.data.amount)
  if (amount < MIN_PAYOUT_AMOUNT) {
    error(res, `The minimum payout is GHS ${MIN_PAYOUT_AMOUNT.toFixed(2)}`)
    return
  }

  const account = await PayoutAccount.findOne({ userId: req.user!.userId }).lean()
  if (!account) { error(res, 'Add a payout account before requesting a payout', 409); return }
  if (!account.verified) { error(res, 'Your payout account could not be verified', 409); return }

  const pending = await Payout.countDocuments({ userId: req.user!.userId, status: { $in: ['requested', 'processing'] } })
  if (pending > 0) {
    error(res, 'You already have a payout in progress. Wait for it to complete first.', 409)
    return
  }

  const reference = `PO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

  // Debit FIRST: the guarded debit is what stops two concurrent requests from
  // spending the same balance. If creating the record then fails, the credit
  // below puts it straight back.
  const debited = await debitWallet(req.user!.userId, amount, {
    type: 'withdrawal',
    reference,
    description: 'Payout requested',
  })
  if (!debited) { error(res, 'Insufficient wallet balance', 409); return }

  let payout
  try {
    payout = await Payout.create({
      userId: req.user!.userId,
      amount,
      status: 'requested',
      reference,
      destination: {
        type: account.type,
        accountNumber: account.accountNumber,
        bankName: account.bankName,
        accountName: account.accountName,
        recipientCode: account.recipientCode,
      },
    })
  } catch (err) {
    await creditWallet(req.user!.userId, amount, {
      type: 'refund',
      reference: `${reference}-REVERSAL`,
      description: 'Reversed payout request',
    }).catch((refundErr) => {
      logger.error(`[Payouts] CRITICAL: debited ${amount} for ${reference} but could not record or refund it: ${(refundErr as Error).message}`)
    })
    throw err
  }

  recordAudit(req, 'payout.requested', 'Payout', String(payout._id), { amount, reference })
  success(res, payoutView(payout as never), 'Payout requested — an admin will review it shortly', 201)
}))

// ─── Admin queue ───

router.get('/admin/queue', authenticate, requirePermission('payments:view'), asyncHandler(async (req, res) => {
  // Narrow the query param to the enum — an arbitrary string must never reach
  // the query, and an unknown one falls back to the queue that matters.
  const requested = typeof req.query.status === 'string' ? req.query.status : ''
  const status: PayoutStatus = (PAYOUT_STATUSES as readonly string[]).includes(requested)
    ? requested as PayoutStatus
    : 'requested'
  const payouts = await Payout.find({ status }).sort({ createdAt: 1 }).limit(200).lean()

  const userIds = [...new Set(payouts.map((p) => p.userId))]
  const users = await User.find({ _id: { $in: userIds } }).select('firstName lastName email').lean()
  const byId = new Map(users.map((u) => [String(u._id), u]))

  success(res, {
    items: payouts.map((p) => {
      const user = byId.get(p.userId)
      return {
        ...payoutView(p as never),
        user: user ? { firstName: user.firstName, lastName: user.lastName, email: user.email } : undefined,
      }
    }),
    total: payouts.length,
  })
}))

/** Approve and send. This is the moment money actually leaves. */
router.post('/:id/approve', authenticate, requirePermission('payments:process'), asyncHandler(async (req, res) => {
  const payout = await Payout.findById(param(req.params.id))
  if (!payout) { error(res, 'Payout not found', 404); return }
  if (payout.status !== 'requested') {
    error(res, `This payout is already ${payout.status}`, 409)
    return
  }

  // Claim it before calling the PSP, so two admins clicking at once cannot
  // both send the transfer.
  const claimed = await Payout.findOneAndUpdate(
    { _id: payout._id, status: 'requested' },
    { $set: { status: 'processing', approvedBy: req.user!.userId, approvedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!claimed) { error(res, 'This payout was already picked up', 409); return }

  try {
    const result = await getPayoutProvider().sendTransfer({
      amount: claimed.amount,
      recipientCode: claimed.destination.recipientCode,
      reference: claimed.reference,
      reason: 'RentOS payout',
    })
    claimed.providerRef = result.providerRef
    await claimed.save()

    recordAudit(req, 'payout.approved', 'Payout', String(claimed._id), {
      amount: claimed.amount,
      providerRef: result.providerRef,
    })
    success(res, payoutView(claimed as never), 'Payout sent — awaiting provider confirmation')
  } catch (err) {
    // The transfer never got accepted, so put it back in the queue rather than
    // leaving it stuck in 'processing' with no provider reference.
    await Payout.updateOne({ _id: claimed._id, status: 'processing' }, { $set: { status: 'requested' }, $unset: { approvedBy: '', approvedAt: '' } })
    logger.error(`[Payouts] transfer failed for ${claimed.reference}: ${(err as Error).message}`)
    error(res, 'The provider rejected this transfer. It has been returned to the queue.', 502)
  }
}))

/** Decline a request and give the money back. */
router.post('/:id/decline', authenticate, requirePermission('payments:process'), asyncHandler(async (req, res) => {
  const parsed = declineSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const declined = await Payout.findOneAndUpdate(
    { _id: param(req.params.id), status: 'requested', refunded: false },
    { $set: { status: 'failed', failureReason: parsed.data.reason, refunded: true, approvedBy: req.user!.userId, approvedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!declined) { error(res, 'Payout not found, or it is no longer pending', 404); return }

  try {
    await creditWallet(declined.userId, declined.amount, {
      type: 'refund',
      reference: `${declined.reference}-REFUND`,
      description: 'Payout declined',
    })
  } catch (err) {
    logger.error(`[Payouts] CRITICAL: declined ${declined.reference} but the refund did not apply: ${(err as Error).message}`)
    error(res, 'Payout declined but the refund failed — escalate this immediately', 500)
    return
  }

  recordAudit(req, 'payout.declined', 'Payout', String(declined._id), { amount: declined.amount, reason: parsed.data.reason })
  notify({
    userId: declined.userId,
    title: 'Payout declined',
    message: `Your GHS ${declined.amount.toFixed(2)} payout was declined (${parsed.data.reason}). The amount is back in your wallet.`,
    actionUrl: '/savings',
  }).catch((err) => logger.warn('[Payouts] notify failed:', (err as Error).message))

  success(res, payoutView(declined as never), 'Payout declined and refunded')
}))

/** What the user can actually withdraw right now. */
router.get('/available', authenticate, asyncHandler(async (req, res) => {
  const [wallet, account, pending] = await Promise.all([
    Wallet.findOne({ userId: req.user!.userId }).select('balance').lean(),
    PayoutAccount.findOne({ userId: req.user!.userId }).select('verified').lean(),
    Payout.countDocuments({ userId: req.user!.userId, status: { $in: ['requested', 'processing'] } }),
  ])

  success(res, {
    balance: wallet?.balance ?? 0,
    minimum: MIN_PAYOUT_AMOUNT,
    hasVerifiedAccount: Boolean(account?.verified),
    payoutInProgress: pending > 0,
  })
}))

export default router
