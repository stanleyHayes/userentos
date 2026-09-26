import { reconciliationEvidence } from './payments/reconciliationEvidence.js'
import { recoverPaymentWalletCredits } from './payments/paymentWalletCredit.js'
import { recoverPaidSubscriptions } from './payments/paidSubscription.js'
import { recoverApplePurchases } from './storeBilling/recoverApplePurchases.js'
import { recoverRentReceipts } from './payments/recoverRentReceipts.js'
import { expireSubscription } from './subscriptionExpiry.js'
import { recoverGooglePurchases } from './storeBilling/recoverPurchases.js'
import cron from 'node-cron'
import { Types } from 'mongoose'
import { SavingsPlan } from '../models/SavingsPlan.js'
import { isRegulatedFeatureEnabled } from '../config/regulatedFeatures.js'
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
import { purgeExpiredAccounts } from './accountErasure.js'
import { acquireCronLock } from './cronLock.js'
import { retentionCutoff } from '../config/retention.js'
import { payoutsOffered, reconcileUncertainPayouts } from './payouts/reconcile.js'
import { expireFinishedCampaigns } from './marketplace/sponsorshipServing.js'
import { sendWeeklyNewLeaseDigest } from './newLeaseDigest.js'
import { BlogPost } from '../models/BlogPost.js'
import { pollPendingCertificates } from './hosting/poll.js'
import { retryUnprocessedWebhooks, reconcilePendingTransactions } from './marketplace/reconcile.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'

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
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await recoverPaidSubscriptions()
      if (result.completed || result.deferred) logger.info('[Scheduler] Paid subscription recovery', result)
    } catch { logger.error('[Scheduler] Paid subscription recovery failed; retry scheduled') }
  }, { timezone: GHANA_TZ })
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await recoverPaymentWalletCredits()
      if (result.completed || result.deferred) logger.info('[Scheduler] Payment wallet credit recovery', result)
    } catch { logger.error('[Scheduler] Payment wallet credit recovery failed; retry scheduled') }
  }, { timezone: GHANA_TZ })
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await recoverRentReceipts()
      if (result.issued || result.deferred) logger.info('[Scheduler] Rent receipt recovery', result)
    } catch { logger.error('[Scheduler] Rent receipt recovery failed; retry scheduled for the next run') }
  }, { timezone: GHANA_TZ })
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await recoverApplePurchases()
      if (result.processed) logger.info('[Scheduler] Apple purchase recovery', result)
    } catch {
      logger.error('[Scheduler] Apple purchase recovery failed; retry scheduled for the next run')
    }
  }, { timezone: GHANA_TZ })
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await recoverGooglePurchases()
      if (result.processed) logger.info('[Scheduler] Google purchase recovery', result)
    } catch {
      logger.error('[Scheduler] Google purchase recovery failed; retry scheduled for the next run')
    }
  }, { timezone: GHANA_TZ })
  // Auto-debit: runs every day at 8am
  cron.schedule('0 8 * * *', async () => {
    // Moving money between stored-value balances is itself the regulated activity.
    if (!isRegulatedFeatureEnabled('wallet')) return
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
          }).catch((err) => logger.warn('[Scheduler] notify failed:', err))
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
            { returnDocument: 'after' },
          )
          if (updated && updated.status !== 'completed' && updated.currentAmount >= updated.targetAmount) {
            await SavingsPlan.updateOne({ _id: plan._id }, { $set: { status: 'completed' } })
            notify({
              userId: plan.userId,
              title: 'Savings Goal Reached!',
              message: `Your savings plan has reached its target of GHS ${plan.targetAmount.toFixed(2)}!`,
              actionUrl: '/savings',
              category: 'savings',
            }).catch((err) => logger.warn('[Scheduler] notify failed:', err))
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
  }, { timezone: GHANA_TZ })

  // Rent reminders: runs every day at 9am
  // Checks active agreements and reminds tenants if rent is due within 3, 7, or 14 days
  cron.schedule('0 9 * * *', async () => {
    if (!(await acquireCronLock('rent-reminders', LOCK_TTL_DAILY))) return
    logger.info('[Scheduler] Checking rent reminders...')
    try {
      const now = new Date()
      /*
       * Look back two months, not to the start of this calendar month.
       *
       * The "already paid, skip the reminder" check used the current calendar
       * month, but nextDue rolls into NEXT month as soon as this month's due
       * date passes. A tenant whose rent falls on the 5th and who paid on the
       * 3rd was therefore treated as paid for the 5th of the following month
       * too — so the 14, 7 and 3 day reminders for the next cycle were all
       * suppressed by the previous cycle's payment. The window must cover the
       * cycle that nextDue actually closes, which is resolved per agreement
       * below.
       */
      const lookbackStart = new Date(now.getFullYear(), now.getMonth() - 2, 1)

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
          createdAt: { $gte: lookbackStart },
        }).lean()
        // Most recent completed payment per agreement, compared per cycle below.
        const lastPaidAt = new Map<string, number>()
        for (const p of recentPayments) {
          // agreementId is optional on Payment (wallet top-ups have none).
          const agreementId = p.agreementId
          if (!agreementId) continue
          const at = new Date((p as { createdAt?: Date }).createdAt ?? 0).getTime()
          if (at > (lastPaidAt.get(agreementId) ?? 0)) lastPaidAt.set(agreementId, at)
        }

        for (const agreement of activeAgreements) {
          // Rent falls due each month on the lease start day-of-month: this
          // month's occurrence if it's still ahead, otherwise next month's.
          // Clamp to the month length so a 31st-day start in a 30-day month
          // falls due on the last day of the month.
          const start = new Date(agreement.startDate)
          const startDay = start.getDate()
          const daysThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
          let nextDue = new Date(now.getFullYear(), now.getMonth(), Math.min(startDay, daysThisMonth))
          if (start.getTime() > now.getTime()) {
            nextDue = start // lease hasn't started — first rent is due on the start date
          } else if (nextDue.getTime() < now.getTime()) {
            const daysNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate()
            nextDue = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(startDay, daysNextMonth))
          }

          const daysUntilDue = Math.ceil((nextDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

          // Only remind at 14, 7, and 3 days before due
          if (daysUntilDue === 14 || daysUntilDue === 7 || daysUntilDue === 3) {
            const agId = (agreement._id as Types.ObjectId).toString()

            // Has THIS cycle been paid? The cycle nextDue closes began at the
            // previous month's occurrence of the same day, so only a payment
            // on or after that date counts.
            const cycleStart = new Date(nextDue)
            cycleStart.setMonth(cycleStart.getMonth() - 1)
            if ((lastPaidAt.get(agId) ?? 0) >= cycleStart.getTime()) continue

            const propertyTitle = propertyTitleMap.get(agreement.propertyId) ?? 'your property'
            notifyRentReminder(
              agreement.tenantId,
              agreement.rentAmount,
              daysUntilDue,
              propertyTitle
            ).catch((err) => logger.warn('[Scheduler] notify failed:', err))
            logger.info(`[Scheduler] Sent rent reminder to tenant ${agreement.tenantId} (${daysUntilDue} days)`)
          }
        }
        batch++
      } while (activeAgreements.length === batchSize)
    } catch (err) {
      logger.error('[Scheduler] Rent reminder error:', err)
    }
  }, { timezone: GHANA_TZ })

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
            }).catch((err) => logger.warn('[Scheduler] notify failed:', err))
            notify({
              userId: agreement.tenantId,
              title: 'Your Lease Ends Soon',
              message: `Your lease at "${propertyTitle}" ends in ${days} days. Tap to renew.`,
              actionUrl: `/agreements/${(agreement._id as Types.ObjectId).toString()}`,
            }).catch((err) => logger.warn('[Scheduler] notify failed:', err))

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
            }).catch((err) => logger.warn('[Scheduler] notify failed:', err))
            notify({
              userId: a.landlordId,
              title: 'Move-out Initiated',
              message: `The lease at "${propertyTitle}" has ended. Schedule the inspection to begin the move-out.`,
              actionUrl: `/agreements/${agId}/move-out`,
            }).catch((err) => logger.warn('[Scheduler] notify failed:', err))
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

          notify({ userId: payment.tenantId, title, message, actionUrl: '/payments', category: 'payment' })
            .catch((err) => logger.warn('[Scheduler] notify failed:', err))
          if (days === -3 && payment.landlordId) {
            notify({
              userId: payment.landlordId,
              title: 'Tenant Payment Overdue',
              message: `A tenant payment of GHS ${payment.amount.toFixed(2)} is 3 days overdue.`,
              actionUrl: '/payments',
            }).catch((err) => logger.warn('[Scheduler] notify failed:', err))
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
            }).catch((err) => logger.warn('[Scheduler] notify failed:', err))
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
        /*
         * 'defaulted' is included deliberately.
         *
         * This job derives status purely from overdueCount, and it is the only
         * thing that writes 'defaulted' (at >= 4 overdue installments). Leaving
         * defaulted out of its own query meant the job wrote a status it then
         * refused to look at: once a contract defaulted, no amount of catching
         * up could move it, because nothing re-examined it. Every other status
         * here is recomputed from reality each day; making this one sticky was
         * an accident, not a policy.
         *
         * If the business wants a defaulted contract to require MANUAL
         * reinstatement, that is a real policy and belongs in an explicit
         * transition guard — not in an omission from a query.
         */
        const cursor = FinancingContract.find({ status: { $in: ['active', 'in_grace', 'in_arrears', 'defaulted'] } }).cursor()
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
              .catch((err) => logger.warn('[Scheduler] notify failed:', err))
            notify({ userId: c.financierId, title: 'Contract Status Update', message: msg, actionUrl: `/financing/contracts/${c._id}` })
              .catch((err) => logger.warn('[Scheduler] notify failed:', err))
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
  // 2 minutes that have a providerRef, requests verified financial facts, and
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
          const provider = getProvider(payment.method as ProviderId, payment.collectionSource)
          const event = await reconciliationEvidence(provider, payment)
          await Payment.updateOne({ _id: payment._id }, { $set: { lastProviderCheckAt: new Date().toISOString() } })
          if (event) await finalizePayment(event, { source: 'reconciliation', providerSource: provider.source })
        } catch (err) {
          logger.warn(`[Scheduler] reconcile ${payment.reference} failed:`, (err as Error).message)
        }
      }
    } catch (err) {
      logger.error('[Scheduler] Payment reconciliation error:', err)
    }
  })

  // ─── Payout reconciliation: every 5 minutes ───
  // Transfers whose outcome the provider never confirmed stay 'processing'
  // with needsReconciliation (routes/payouts.ts). Ask the provider, through
  // the same path as the admin's POST /payouts/:id/reconcile, with per-payout
  // backoff. Only while payouts can be offered at all.
  cron.schedule('*/5 * * * *', async () => {
    if (!payoutsOffered()) return
    if (!(await acquireCronLock('payout-reconcile', LOCK_TTL_RECONCILE))) return
    try {
      const result = await reconcileUncertainPayouts()
      if (result.examined) logger.info('[Scheduler] Payout reconciliation', result)
    } catch (err) {
      logger.error('[Scheduler] Payout reconciliation error:', err)
    }
  }, { timezone: GHANA_TZ })

  // ─── Daily 10:00 Ghana time: subscription lifecycle ───
  // (a) remind landlords 7 days before subscriptionEndDate;
  // (b) downgrade expired PAID subscriptions back to the default package.
  cron.schedule('0 10 * * *', async () => {
    if (!(await acquireCronLock('subscription-lifecycle', LOCK_TTL_DAILY))) return
    logger.info('[Scheduler] Running subscription lifecycle check...')
    const now = new Date()

    // (a) Renewal reminders — end date falls 7 days out (24h window, daily job).
    try {
      const windowStart = new Date(now); windowStart.setDate(windowStart.getDate() + 7)
      const windowEnd = new Date(windowStart); windowEnd.setDate(windowEnd.getDate() + 1)
      const expiring = await User.find({
        subscriptionEndDate: { $gte: windowStart, $lt: windowEnd },
      }).select('_id subscriptionPackageId subscriptionEndDate subscriptionPaymentId subscriptionSnapshotJson subscriptionStartDate subscriptionPlanVersion').lean()

      // Free packages renew at no cost — no renewal nudge for a GHS 0 plan.
      const pkgIds = [...new Set(expiring.map((u) => u.subscriptionPackageId).filter((id): id is string => !!id))]
      const pkgs = pkgIds.length
        ? await SubscriptionPackage.find({ _id: { $in: pkgIds } }).select('price').lean()
        : []
      const paidPkgIds = new Set(pkgs.filter((p) => p.price > 0).map((p) => p._id.toString()))

      let reminded = 0
      for (const u of expiring) {
        if (!u.subscriptionPackageId || !paidPkgIds.has(u.subscriptionPackageId)) continue
        reminded += 1
        notify({
          userId: (u._id as Types.ObjectId).toString(),
          title: 'Subscription Expiring Soon',
          message: `Your subscription expires on ${new Date(u.subscriptionEndDate!).toISOString().slice(0, 10)}. Renew to keep your listing limits.`,
          actionUrl: '/subscription',
          // A renewal nudge, not account activity: the payment-reminder toggle applies.
          category: 'payment',
        }).catch((err) => logger.warn('[Scheduler] notify failed:', err))
      }
      if (reminded) logger.info(`[Scheduler] Sent ${reminded} subscription renewal reminder(s)`)
    } catch (err) {
      logger.error('[Scheduler] Subscription reminder error:', err)
    }

    // (b) Downgrade expired paid subscriptions to the default (free) package.
    try {
      const defaultPkg = await SubscriptionPackage.findOne({ isDefault: true, isActive: true, price: 0 }).lean()
      if (!defaultPkg) {
        logger.warn('[Scheduler] No default subscription package configured — skipping expiry downgrades')
        return
      }
      const expiredUsers = await User.find({
        subscriptionPackageId: { $exists: true, $ne: null },
        subscriptionEndDate: { $lt: now },
      }).select('_id subscriptionPackageId subscriptionEndDate subscriptionPaymentId subscriptionSnapshotJson subscriptionStartDate subscriptionPlanVersion').lean()

      for (const u of expiredUsers) {
        const uid = (u._id as Types.ObjectId).toString()
        try {
          if (!u.subscriptionPackageId || !u.subscriptionEndDate) continue
          const result = await expireSubscription({ userId: uid, packageId: u.subscriptionPackageId, expiresAt: new Date(u.subscriptionEndDate), subscriptionPaymentId: u.subscriptionPaymentId, subscriptionSnapshotJson: u.subscriptionSnapshotJson, subscriptionStartDate: u.subscriptionStartDate, subscriptionPlanVersion: u.subscriptionPlanVersion }, {
            id: defaultPkg._id.toString(), price: defaultPkg.price, version: defaultPkg.version ?? 1,
          }, now)
          if (!result.downgradedFrom) continue
          notify({
            userId: uid,
            title: 'Subscription Expired',
            message: `Your ${result.downgradedFrom} subscription has expired and your account was moved to the free ${defaultPkg.name} plan. Resubscribe to restore your previous limits.`,
            actionUrl: '/subscription',
          }).catch((err) => logger.warn('[Scheduler] notify failed:', err))
          logger.info(`[Scheduler] Downgraded expired subscription for user ${uid.slice(0, 8)}...`)
        } catch (err) {
          logger.error(`[Scheduler] Subscription expiry failed for user ${uid.slice(0, 8)}; retained for retry`, err)
        }
      }
    } catch (err) {
      logger.error('[Scheduler] Subscription expiry error:', err)
    }
  }, { timezone: GHANA_TZ })

  // ─── Data retention: purge audit logs older than 2 years ───
  // Marketplace webhook dead-letter retry and settlement reconciliation
  // (spec §8.4). Runs every 15 minutes: a webhook that failed mid-processing,
  // or never arrived at all, otherwise leaves a real payment stuck at pending
  // with the seller unpaid and no route to the truth.
  cron.schedule('*/15 * * * *', async () => {
    if (!process.env.PAYSTACK_SECRET_KEY) return
    if (!(await acquireCronLock('marketplace-reconcile', LOCK_TTL_RECONCILE))) return
    try {
      const retried = await retryUnprocessedWebhooks()
      if (retried.recovered > 0 || retried.exhausted > 0) {
        logger.info(`[Cron] Webhook retry: ${retried.recovered} recovered, ${retried.exhausted} exhausted of ${retried.examined}.`)
      }
      const reconciled = await reconcilePendingTransactions()
      if (reconciled.corrected > 0) {
        logger.info(`[Cron] Reconciled ${reconciled.corrected} of ${reconciled.examined} pending marketplace transaction(s).`)
      }
    } catch (err) {
      logger.error(`[Cron] Marketplace reconciliation failed: ${(err as Error).message}`)
    }
  }, { timezone: GHANA_TZ })

  // Sponsorship expiry — a campaign whose window closed must stop serving, but
  // its spend and billing history stay (spec §9). Serving already filters on
  // endAt, so this is bookkeeping rather than the enforcement itself.
  cron.schedule('30 2 * * *', async () => {
    if (!(await acquireCronLock('sponsorship-expiry', LOCK_TTL_DAILY))) return
    try {
      const expired = await expireFinishedCampaigns()
      if (expired > 0) logger.info(`[Cron] Expired ${expired} finished sponsorship campaign(s).`)
    } catch (err) {
      logger.error(`[Cron] Sponsorship expiry failed: ${(err as Error).message}`)
    }
  }, { timezone: GHANA_TZ })

  // Weekly new-lease count for approved local businesses, Monday 09:00. An
  // aggregate per city (only at 5+ leases), never a per-lease signal.
  cron.schedule('0 9 * * 1', async () => {
    if (!(await acquireCronLock('new-lease-digest', LOCK_TTL_DAILY))) return
    try {
      const result = await sendWeeklyNewLeaseDigest()
      if (result.notified > 0) logger.info(`[Cron] New-lease digest: ${result.notified} business(es) in ${result.cities} city(ies).`)
    } catch (err) {
      logger.error(`[Cron] New-lease digest failed: ${(err as Error).message}`)
    }
  }, { timezone: GHANA_TZ })

  // Scheduled posts (spec §6). The model has had a 'scheduled' status and a
  // scheduledFor date all along, but nothing ever moved a post out of that
  // state — an author who scheduled a post watched it sit there forever.
  // Every 10 minutes is close enough: publishing is not time-critical to the
  // minute, and a tighter schedule buys nothing an author would notice.
  cron.schedule('*/10 * * * *', async () => {
    if (!(await acquireCronLock('publish-scheduled-posts', LOCK_TTL_RECONCILE))) return
    try {
      const now = new Date()
      const due = await BlogPost.find({ status: 'scheduled', scheduledFor: { $lte: now } })
        .select('_id slug').lean()
      if (due.length === 0) return

      const result = await BlogPost.updateMany(
        { _id: { $in: due.map((p) => p._id) }, status: 'scheduled' },
        { $set: { status: 'published', published: true, publishedAt: now } },
      )
      if ((result.modifiedCount ?? 0) > 0) {
        logger.info(`[Cron] Published ${result.modifiedCount} scheduled post(s).`)
      }
    } catch (err) {
      logger.error(`[Cron] Scheduled post publishing failed: ${(err as Error).message}`)
    }
  }, { timezone: GHANA_TZ })

  // Custom-domain certificates (spec §4.3). Attaching a domain starts issuance;
  // this is what finishes it. Every 5 minutes because a seller who has just
  // pointed their DNS is watching the screen.
  cron.schedule('*/5 * * * *', async () => {
    if (!(await acquireCronLock('tls-provisioning', LOCK_TTL_RECONCILE))) return
    try {
      await pollPendingCertificates()
    } catch (err) {
      logger.error(`[Cron] TLS provisioning poll failed: ${(err as Error).message}`)
    }
  }, { timezone: GHANA_TZ })

  cron.schedule('0 3 * * *', async () => {
    if (!(await acquireCronLock('audit-purge', LOCK_TTL_DAILY))) return
    try {
      const result = await AuditLog.deleteMany({ createdAt: { $lt: retentionCutoff('auditLog') } })
      if ((result.deletedCount ?? 0) > 0) {
        logger.info(`[Scheduler] Purged ${result.deletedCount} audit logs older than 2 years`)
      }
    } catch (err) {
      logger.error('[Scheduler] Audit log purge error:', err)
    }
  }, { timezone: GHANA_TZ })

  // ─── Account erasure: retry incomplete cleanup after the disclosed delay ───
  cron.schedule('0 4 * * *', async () => {
    if (!(await acquireCronLock('gdpr-delete', LOCK_TTL_DAILY))) return
    try {
      await purgeExpiredAccounts()
    } catch {
      logger.error('[Scheduler] Account erasure scan failed; retry scheduled for the next run')
    }
  }, { timezone: GHANA_TZ })

  logger.info('[Scheduler] Started. Auto-debit at 8am, reminders + arrears at 9am, subscription lifecycle at 10am Ghana time. Payment reconcile every 5min. Audit purge at 3am. GDPR cleanup at 4am.')
}
