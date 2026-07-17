import cron from 'node-cron'
import { Types } from 'mongoose'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { Wallet } from '../models/Wallet.js'
import { Agreement } from '../models/Agreement.js'
import { Property } from '../models/Property.js'
import { User } from '../models/User.js'
import { Payment } from '../models/Payment.js'
import { MaintenanceRequest } from '../models/MaintenanceRequest.js'
import { FinancingContract } from '../models/FinancingContract.js'
import { MoveOut } from '../models/MoveOut.js'
import { notify, notifyRentReminder } from './notify.js'
import { getProvider } from './payments/index.js'
import { finalizePayment } from './payments/finalize.js'
import { creditWallet, debitWallet } from './payments/walletLedger.js'
import { round2 } from '../utils/money.js'
import type { ProviderId } from './payments/types.js'
import { logger } from '../utils/logger.js'
import { AuditLog } from '../models/AuditLog.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { DeviceToken } from '../models/DeviceToken.js'
import { Notification } from '../models/Notification.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { ProfileAccess } from '../models/ProfileAccess.js'
import { Favorite } from '../models/Favorite.js'
import { CreditScore } from '../models/CreditScore.js'
import { Review } from '../models/Review.js'
import { Conversation, Message } from '../models/Conversation.js'
import { acquireCronLock } from './cronLock.js'

// Ghana timezone (UTC+0, no DST). cron defaults to server time, but we set tz explicitly
// for clarity/portability since the requirement specifies Ghana time.
const GHANA_TZ = 'Africa/Accra'

// Cron lock TTLs — in a multi-instance deployment only one instance runs each job
// per window, so jobs like auto-debit never fire twice and double-charge.
const LOCK_TTL_DAILY = 2 * 60 * 60 * 1000 // daily jobs: 2h window (< 1 day until next run)
const LOCK_TTL_RECONCILE = 4 * 60 * 1000 // 5-min reconcile: 4min, below the interval

/** Returns the number of whole days between two dates (rounded up). */
function daysBetween(future: Date, now: Date): number {
  return Math.ceil((future.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

/** True if the timestamp is older than `hours` hours ago (or missing). */
function olderThanHours(iso: string | undefined | null, hours: number): boolean {
  if (!iso) return true
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return true
  return Date.now() - ts > hours * 60 * 60 * 1000
}

/** Batch lookup helper: given a list of items with propertyId, load all properties at once. */
async function batchPropertyTitles<T extends { propertyId: string }>(
  items: T[],
): Promise<Map<string, string>> {
  const propertyIds = [...new Set(items.map((i) => i.propertyId).filter(Boolean))]
  const properties = propertyIds.length
    ? await Property.find({ _id: { $in: propertyIds } }).select('title').lean()
    : []
  const titleMap = new Map<string, string>()
  for (const p of properties) {
    titleMap.set((p._id as Types.ObjectId).toString(), p.title ?? 'your property')
  }
  return titleMap
}

export function startScheduler() {
  // Auto-debit: runs every day at 8am
  cron.schedule('0 8 * * *', async () => {
    if (!(await acquireCronLock('auto-debit', LOCK_TTL_DAILY))) return
    logger.info('[Scheduler] Running auto-debit check...')
    const plans = await SavingsPlan.find({ status: 'active', autoDebit: true })

    // Per-plan error isolation — one bad plan must never skip everyone's debit.
    for (const plan of plans) {
      try {
        const now = new Date()

        // Frequency check FIRST — a monthly plan must not get a daily
        // "insufficient balance" notification when no debit is even due.
        if (plan.lastAutoDebitAt) {
          const diffDays = (now.getTime() - new Date(plan.lastAutoDebitAt).getTime()) / (1000 * 60 * 60 * 24)
          if (plan.frequency === 'daily' && diffDays < 1) continue
          if (plan.frequency === 'weekly' && diffDays < 7) continue
          if (plan.frequency === 'monthly' && diffDays < 28) continue
        }

        // Atomic guarded debit (no negative balance, no double-spend)
        const debited = await debitWallet(plan.userId, plan.contributionAmount, {
          type: 'savings_contribution',
          reference: `AUTODEBIT-${Date.now()}`,
          description: `Auto-debit: ${plan.frequency} savings contribution`,
        })
        if (!debited) {
          notify({
            userId: plan.userId,
            title: 'Auto-debit Failed',
            message: `Insufficient wallet balance for your ${plan.frequency} savings contribution of GHS ${plan.contributionAmount.toFixed(2)}.`,
            actionUrl: '/savings',
          })
          continue
        }

        // Credit the plan; on failure refund the debit.
        try {
          const updated = await SavingsPlan.findByIdAndUpdate(
            plan._id,
            {
              $inc: { currentAmount: round2(plan.contributionAmount) },
              $set: { lastAutoDebitAt: now.toISOString() },
            },
            { new: true },
          )
          if (updated && updated.status !== 'completed' && updated.currentAmount >= updated.targetAmount) {
            await SavingsPlan.updateOne({ _id: plan._id }, { $set: { status: 'completed' } })
            notify({
              userId: plan.userId,
              title: 'Savings Goal Reached!',
              message: `Your savings plan has reached its target of GHS ${plan.targetAmount.toFixed(2)}!`,
              actionUrl: '/savings',
            })
          }
        } catch (err) {
          await creditWallet(plan.userId, plan.contributionAmount, {
            type: 'refund',
            reference: `AUTODEBIT-REV-${Date.now()}`,
            description: 'Reversal of failed auto-debit',
          })
          throw err
        }

        logger.info(`[Scheduler] Auto-debited GHS ${plan.contributionAmount} for user ${plan.userId}`)
      } catch (err) {
        logger.error(`[Scheduler] Auto-debit failed for plan ${plan._id}:`, err)
      }
    }
  })

  // Rent reminders: runs every day at 9am
  // Checks active agreements and reminds tenants if rent is due within 3, 7, or 14 days
  cron.schedule('0 9 * * *', async () => {
    if (!(await acquireCronLock('rent-reminders', LOCK_TTL_DAILY))) return
    logger.info('[Scheduler] Checking rent reminders...')
    try {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

      // Use cursor + batching to avoid loading all agreements into memory
      const batchSize = 200
      let batch = 0
      let activeAgreements

      do {
        activeAgreements = await Agreement.find({ status: 'active' })
          .skip(batch * batchSize)
          .limit(batchSize)
          .lean()

        // Batch load properties and payments for this batch
        const propertyTitleMap = await batchPropertyTitles(activeAgreements)
        const agreementIds = activeAgreements.map((a) => (a._id as Types.ObjectId).toString())
        const recentPayments = await Payment.find({
          agreementId: { $in: agreementIds },
          status: 'completed',
          createdAt: { $gte: monthStart },
        }).lean()
        const paidAgreementIds = new Set(recentPayments.map((p) => p.agreementId))

        for (const agreement of activeAgreements) {
          // Calculate next payment due date based on start date and monthly cycle
          const start = new Date(agreement.startDate)
          const monthsSinceStart = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
          const nextDue = new Date(start)
          nextDue.setMonth(start.getMonth() + monthsSinceStart + 1)

          const daysUntilDue = Math.ceil((nextDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

          // Only remind at 14, 7, and 3 days before due
          if (daysUntilDue === 14 || daysUntilDue === 7 || daysUntilDue === 3) {
            const agId = (agreement._id as Types.ObjectId).toString()
            if (paidAgreementIds.has(agId)) continue

            const propertyTitle = propertyTitleMap.get(agreement.propertyId) ?? 'your property'
            notifyRentReminder(
              agreement.tenantId,
              agreement.rentAmount,
              daysUntilDue,
              propertyTitle
            )
            logger.info(`[Scheduler] Sent rent reminder to tenant ${agreement.tenantId} (${daysUntilDue} days)`)
          }
        }
        batch++
      } while (activeAgreements.length === batchSize)
    } catch (err) {
      logger.error('[Scheduler] Rent reminder error:', err)
    }
  })

  // ─── Daily 9am Ghana time: lease expiry + payment due + maintenance escalation ───
  cron.schedule(
    '0 9 * * *',
    async () => {
      if (!(await acquireCronLock('daily-reminders', LOCK_TTL_DAILY))) return
      const now = new Date()
      logger.info('[Scheduler] Running daily reminders (lease/payment/maintenance)...')

      // 1. Lease expiry reminders at 60 / 30 / 14 / 7 days
      try {
        const horizonDays = [60, 30, 14, 7]

        const batchSize = 200
        let batch = 0
        let activeAgreements

        do {
          activeAgreements = await Agreement.find({ status: 'active' })
            .skip(batch * batchSize)
            .limit(batchSize)
            .lean()

          const propertyTitleMap = await batchPropertyTitles(activeAgreements)

          for (const agreement of activeAgreements) {
            const end = new Date(agreement.endDate)
            if (Number.isNaN(end.getTime())) continue
            const days = daysBetween(end, now)
            if (!horizonDays.includes(days)) continue

            // Idempotency: don't fire more than once per 20h regardless of horizon
            if (!olderThanHours((agreement as { lastLeaseReminderAt?: string }).lastLeaseReminderAt, 20)) continue

            const propertyTitle = propertyTitleMap.get(agreement.propertyId) ?? 'your property'

            notify({
              userId: agreement.landlordId,
              title: 'Lease Expiring Soon',
              message: `Lease for "${propertyTitle}" expires in ${days} days. Tap to renew.`,
              actionUrl: `/agreements/${(agreement._id as Types.ObjectId).toString()}`,
            })
            notify({
              userId: agreement.tenantId,
              title: 'Your Lease Ends Soon',
              message: `Your lease at "${propertyTitle}" ends in ${days} days. Tap to renew.`,
              actionUrl: `/agreements/${(agreement._id as Types.ObjectId).toString()}`,
            })

            // Persist the lastLeaseReminderAt directly (field is dynamic/extra)
            await Agreement.updateOne(
              { _id: agreement._id },
              { $set: { lastLeaseReminderAt: now.toISOString() } } as Record<string, unknown>
            )
          }
          batch++
        } while (activeAgreements.length === batchSize)
      } catch (err) {
        logger.error('[Scheduler] Lease expiry reminder error:', err)
      }

      // 1b. Auto-initiate move-out for any active agreement whose endDate has
      // passed and which has no existing MoveOut row. Idempotent.
      try {
        const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0)
        const batchSize = 200
        let batch = 0
        let expired

        do {
          expired = await Agreement.find({
            status: 'active',
            endDate: { $lte: todayStart.toISOString() },
          })
            .skip(batch * batchSize)
            .limit(batchSize)
            .lean()

          const propertyTitleMap = await batchPropertyTitles(expired)

          for (const a of expired) {
            const agId = (a._id as Types.ObjectId).toString()
            const existing = await MoveOut.findOne({ agreementId: agId }).lean()
            if (existing) continue
            const moveOutDate = new Date(a.endDate).toISOString().slice(0, 10)
            await MoveOut.create({
              agreementId: agId,
              tenantId: a.tenantId,
              landlordId: a.landlordId,
              propertyId: a.propertyId,
              status: 'initiated',
              initiatedBy: 'system',
              moveOutDate,
              damages: [],
              securityDeposit: a.securityDeposit ?? 0,
              deductionsTotal: 0,
              refundAmount: a.securityDeposit ?? 0,
              notes: [],
            })
            const propertyTitle = propertyTitleMap.get(a.propertyId) ?? 'your property'
            notify({
              userId: a.tenantId,
              title: 'Move-out Initiated',
              message: `Your lease at "${propertyTitle}" has ended. A move-out has been started — please review and acknowledge.`,
              actionUrl: `/agreements/${agId}/move-out`,
            })
            notify({
              userId: a.landlordId,
              title: 'Move-out Initiated',
              message: `The lease at "${propertyTitle}" has ended. Schedule the inspection to begin the move-out.`,
              actionUrl: `/agreements/${agId}/move-out`,
            })
          }
          batch++
        } while (expired.length === batchSize)
      } catch (err) {
        logger.error('[Scheduler] Auto move-out init error:', err)
      }

      // 2. Payment due reminders.
      // The Payment model has no explicit dueDate — we treat a `pending` payment's
      // `createdAt` as its issue date and the agreement's monthly billing window as
      // the implicit dueDate. We notify on:
      //   - 3 days before due
      //   - 1 day before due
      //   - on due date
      //   - 3 days after due (overdue)
      try {
        // Cursor-stream pending payments instead of loading the whole collection.
        const cursor = Payment.find({ status: 'pending' }).lean().cursor()
        for await (const payment of cursor) {
          // Determine implicit dueDate: 7 days after the payment record was created.
          // (Payment lifecycle in this codebase: tenant initiates, status flips on confirm.)
          const createdAt = new Date((payment as { createdAt?: string | Date }).createdAt ?? Date.now())
          const dueDate = new Date(createdAt)
          dueDate.setDate(dueDate.getDate() + 7)

          const days = daysBetween(dueDate, now)
          // Reminder windows: +3 (3 days before), +1 (1 day before), 0 (today), -3 (3 days overdue)
          const fireDay = days === 3 || days === 1 || days === 0 || days === -3
          if (!fireDay) continue

          // Idempotency: don't double-fire within 20h
          const lastReminderAt = (payment as { lastReminderAt?: string }).lastReminderAt
          if (!olderThanHours(lastReminderAt, 20)) continue

          let title = 'Payment Reminder'
          let message = ''
          if (days === 3) {
            title = 'Payment Due in 3 Days'
            message = `Your pending payment of GHS ${payment.amount.toFixed(2)} is due in 3 days.`
          } else if (days === 1) {
            title = 'Payment Due Tomorrow'
            message = `Your pending payment of GHS ${payment.amount.toFixed(2)} is due tomorrow.`
          } else if (days === 0) {
            title = 'Payment Due Today'
            message = `Your pending payment of GHS ${payment.amount.toFixed(2)} is due today.`
          } else if (days === -3) {
            title = 'Payment Overdue'
            message = `Your payment of GHS ${payment.amount.toFixed(2)} is 3 days overdue. Please settle to avoid penalties.`
          }

          notify({ userId: payment.tenantId, title, message, actionUrl: '/payments' })
          if (days === -3 && payment.landlordId) {
            notify({
              userId: payment.landlordId,
              title: 'Tenant Payment Overdue',
              message: `A tenant payment of GHS ${payment.amount.toFixed(2)} is 3 days overdue.`,
              actionUrl: '/payments',
            })
          }

          await Payment.updateOne(
            { _id: payment._id },
            { $set: { lastReminderAt: now.toISOString() } } as Record<string, unknown>
          )
        }
      } catch (err) {
        logger.error('[Scheduler] Payment reminder error:', err)
      }

      // 3. Maintenance escalation: requests in `requested` status > 48h
      // NOTE: no .lean() here — hydrated documents are required for .save().
      // (This job previously called .save() on lean objects and silently never ran.)
      try {
        const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000)
        const stale = await MaintenanceRequest.find({
          status: 'requested',
          createdAt: { $lt: cutoff },
        }).limit(500)

        const propertyTitleMap = await batchPropertyTitles(stale)

        for (const request of stale) {
          try {
            if (!olderThanHours(request.lastReminderAt, 20)) continue

            // Escalate priority one level
            const ladder = ['low', 'medium', 'high', 'urgent'] as const
            const idx = ladder.indexOf(request.priority)
            const escalated = idx < ladder.length - 1 ? ladder[idx + 1] : 'urgent'
            const escalatedFlag = escalated !== request.priority
            request.priority = escalated
            request.lastReminderAt = now.toISOString()
            await request.save()

            const propertyTitle = propertyTitleMap.get(request.propertyId) ?? 'a property'
            notify({
              userId: request.landlordId,
              title: escalatedFlag ? 'Maintenance Escalated' : 'Maintenance Awaiting Action',
              message: escalatedFlag
                ? `"${request.title}" at "${propertyTitle}" is unanswered for >48h. Priority escalated to ${escalated}.`
                : `"${request.title}" at "${propertyTitle}" is still awaiting your response.`,
              actionUrl: '/maintenance',
            })
          } catch (itemErr) {
            logger.error(`[Scheduler] Escalation failed for request ${request._id}:`, itemErr)
          }
        }
      } catch (err) {
        logger.error('[Scheduler] Maintenance escalation error:', err)
      }
    },
    { timezone: GHANA_TZ }
  )

  // ─── Daily 09:00 Ghana time: financing arrears detection ───
  cron.schedule(
    '0 9 * * *',
    async () => {
      if (!(await acquireCronLock('financing-arrears', LOCK_TTL_DAILY))) return
      logger.info('[Scheduler] Running financing arrears check...')
      try {
        // Cursor-stream contracts (they embed full amortization schedules —
        // loading the whole collection at once doesn't scale).
        const cursor = FinancingContract.find({ status: { $in: ['active', 'in_grace', 'in_arrears'] } }).cursor()
        const now = new Date()
        const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0)
        for await (const c of cursor) {
          if (c.lastArrearsCheckAt) {
            const last = new Date(c.lastArrearsCheckAt); last.setUTCHours(0, 0, 0, 0)
            if (last.getTime() === todayStart.getTime()) continue
          }
          let overdueCount = 0
          for (const inst of c.schedule) {
            if (inst.status === 'paid' || inst.status === 'waived') continue
            const due = new Date(inst.dueDate)
            if (due < todayStart && inst.amountPaid < inst.amountDue) {
              if (inst.status !== 'overdue') inst.status = 'overdue'
              overdueCount++
            }
          }
          const prev = c.status
          let next = prev
          if (overdueCount === 0) next = 'active'
          else if (overdueCount === 1) next = 'in_grace'
          else if (overdueCount >= 4) next = 'defaulted'
          else if (overdueCount >= 2) next = 'in_arrears'
          if (next !== prev) {
            c.status = next as typeof c.status
            const msg = `Contract ${c._id.toString().slice(-6)} status: ${prev} → ${next} (${overdueCount} overdue installments)`
            notify({ userId: c.applicantId, title: 'Financing Status Update', message: msg, actionUrl: `/financing/contracts/${c._id}` })
            notify({ userId: c.financierId, title: 'Contract Status Update', message: msg, actionUrl: `/financing/contracts/${c._id}` })
          }
          c.lastArrearsCheckAt = now.toISOString()
          c.markModified('schedule')
          try {
            await c.save()
          } catch (e) {
            // optimisticConcurrency: a concurrent repayment bumped the version. Skip
            // this contract this run; the daily check picks it up again tomorrow.
            logger.warn(`[Scheduler] arrears save skipped for contract ${c._id.toString().slice(-6)} (concurrent update):`, (e as Error).message)
          }
        }
      } catch (err) {
        logger.error('[Scheduler] Arrears check error:', err)
      }
    },
    { timezone: GHANA_TZ }
  )

  // ─── Payment status reconciliation: every 5 minutes ───
  // Catches missed webhooks. Looks at processing/pending payments older than
  // 2 minutes that have a providerRef, calls the adapter's queryStatus, and
  // applies the result through the same finalize path used by webhooks.
  cron.schedule('*/5 * * * *', async () => {
    if (!(await acquireCronLock('payment-reconcile', LOCK_TTL_RECONCILE))) return
    try {
      const cutoff = new Date(Date.now() - 2 * 60 * 1000)
      const stale = await Payment.find({
        status: { $in: ['pending', 'processing'] },
        providerRef: { $exists: true, $ne: null },
        createdAt: { $lt: cutoff },
      }).limit(100)
      for (const payment of stale) {
        if (!payment.providerRef) continue
        try {
          const provider = getProvider(payment.method as ProviderId)
          const status = await provider.queryStatus(payment.providerRef)
          if (status === 'pending') {
            payment.lastProviderCheckAt = new Date().toISOString()
            await payment.save()
            continue
          }
          await finalizePayment(
            {
              reference: payment.reference,
              providerRef: payment.providerRef,
              status,
              amount: payment.amount,
              timestamp: new Date().toISOString(),
              raw: { reconciled: true },
            },
            { source: 'reconciliation' },
          )
        } catch (err) {
          logger.warn(`[Scheduler] reconcile ${payment.reference} failed:`, (err as Error).message)
        }
      }
    } catch (err) {
      logger.error('[Scheduler] Payment reconciliation error:', err)
    }
  })

  // ─── Data retention: purge audit logs older than 2 years ───
  cron.schedule('0 3 * * *', async () => {
    if (!(await acquireCronLock('audit-purge', LOCK_TTL_DAILY))) return
    try {
      const cutoff = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)
      const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } })
      if ((result.deletedCount ?? 0) > 0) {
        logger.info(`[Scheduler] Purged ${result.deletedCount} audit logs older than 2 years`)
      }
    } catch (err) {
      logger.error('[Scheduler] Audit log purge error:', err)
    }
  }, { timezone: GHANA_TZ })

  // ─── GDPR: hard-delete users after 30-day grace period ───
  cron.schedule('0 4 * * *', async () => {
    if (!(await acquireCronLock('gdpr-delete', LOCK_TTL_DAILY))) return
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const users = await User.find({ deletedAt: { $lt: cutoff } }).select('_id').lean()
      if (users.length === 0) return

      for (const u of users) {
        const uid = (u._id as Types.ObjectId).toString()
        // Erase credentials, tokens, and PII-bearing records. Financial records
        // (payments, agreements, loans) are RETAINED for compliance — they only
        // reference userId, and with the User doc gone the reference is anonymous.
        await Promise.all([
          RefreshToken.deleteMany({ userId: uid }),
          BiometricToken.deleteMany({ userId: uid }),
          DeviceToken.deleteMany({ userId: uid }),
          Notification.deleteMany({ userId: uid }),
          TenantProfile.deleteMany({ userId: uid }),
          ProfileAccess.deleteMany({ $or: [{ requesterId: uid }, { tenantId: uid }] }),
          Favorite.deleteMany({ userId: uid }),
          CreditScore.deleteMany({ userId: uid }),
          Message.deleteMany({ senderId: uid }),
          // Anonymize marketplace content that embeds the user's name
          Review.updateMany({ userId: uid }, { $set: { userName: 'Deleted User' } }),
          Conversation.updateMany({ participants: uid }, { $pull: { participants: uid } }),
        ])
        await User.findByIdAndDelete(uid)
        logger.info(`[Scheduler] Hard-deleted user ${uid.slice(0, 8)}... after 30-day grace period`)
      }
    } catch (err) {
      logger.error('[Scheduler] GDPR hard-delete error:', err)
    }
  }, { timezone: GHANA_TZ })

  logger.info('[Scheduler] Started. Auto-debit at 8am, reminders + arrears at 9am Ghana time. Payment reconcile every 5min. Audit purge at 3am. GDPR cleanup at 4am.')
}
