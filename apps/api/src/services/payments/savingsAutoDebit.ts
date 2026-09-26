/**
 * Daily savings auto-debit: move each due plan's contribution from the
 * owner's wallet into the plan.
 *
 * The period is claimed on the plan BEFORE any money moves, conditional on the
 * last debit this run observed, and the debit carries a deterministic
 * reference (AUTODEBIT-<planId>-<period>). Two overlapping runs — a second
 * instance, a retried cron — therefore debit a plan once per period. The claim,
 * the debit and the plan credit are one transaction; on a standalone Mongo
 * each is compensated instead.
 */
import type { Types } from 'mongoose'
import { SavingsPlan, type ISavingsPlan } from '../../models/SavingsPlan.js'
import { creditWallet, debitWallet } from './walletLedger.js'
import { withMoneyTransaction, InsufficientFundsError } from './moneyTransaction.js'
import { notify } from '../notify.js'
import { round2 } from '../../utils/money.js'
import { logger } from '../../utils/logger.js'

type Plan = Pick<ISavingsPlan, 'userId' | 'frequency' | 'contributionAmount' | 'targetAmount' | 'lastAutoDebitAt' | 'lastAutoDebitPeriod'> & { _id: Types.ObjectId }

/** Frequency check FIRST — a monthly plan must not get a daily "insufficient balance" notice when nothing is due. */
function isDue(plan: Plan, now: Date): boolean {
  if (!plan.lastAutoDebitAt) return true
  const diffDays = (now.getTime() - new Date(plan.lastAutoDebitAt).getTime()) / (1000 * 60 * 60 * 24)
  if (plan.frequency === 'daily') return diffDays >= 1
  if (plan.frequency === 'weekly') return diffDays >= 7
  if (plan.frequency === 'monthly') return diffDays >= 28
  return false
}

/** The period a debit on `now` settles: the Ghana (UTC) calendar day it fell due. */
export function autoDebitPeriod(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export async function autoDebitPlan(plan: Plan, now = new Date()): Promise<'debited' | 'insufficient' | 'skipped'> {
  if (!isDue(plan, now)) return 'skipped'
  const period = autoDebitPeriod(now)
  if (plan.lastAutoDebitPeriod === period) return 'skipped'
  const planId = String(plan._id)
  const reference = `AUTODEBIT-${planId}-${period}`
  const amount = round2(plan.contributionAmount)

  let updated: ISavingsPlan | null
  try {
    updated = await withMoneyTransaction(async ({ session, onRollback }) => {
      const claimed = await SavingsPlan.findOneAndUpdate(
        { _id: plan._id, status: 'active', autoDebit: true, lastAutoDebitPeriod: { $ne: period }, lastAutoDebitAt: plan.lastAutoDebitAt ?? { $exists: false } },
        { $set: { lastAutoDebitPeriod: period, lastAutoDebitAt: now.toISOString() } },
        { session, returnDocument: 'after' },
      )
      if (!claimed) return null // another run already took this period
      onRollback(() => SavingsPlan.updateOne({ _id: plan._id, lastAutoDebitPeriod: period }, plan.lastAutoDebitAt
        ? { $set: { lastAutoDebitAt: plan.lastAutoDebitAt, ...(plan.lastAutoDebitPeriod ? { lastAutoDebitPeriod: plan.lastAutoDebitPeriod } : {}) }, ...(plan.lastAutoDebitPeriod ? {} : { $unset: { lastAutoDebitPeriod: 1 } }) }
        : { $unset: { lastAutoDebitAt: 1, lastAutoDebitPeriod: 1 } }))

      const debited = await debitWallet(plan.userId, amount, { type: 'savings_contribution', reference, description: `Auto-debit: ${plan.frequency} savings contribution` }, { session })
      if (!debited) throw new InsufficientFundsError()
      onRollback(() => creditWallet(plan.userId, amount, { type: 'refund', reference: `${reference}-REV`, description: 'Reversal of failed auto-debit' }))

      return await SavingsPlan.findOneAndUpdate(
        { _id: plan._id },
        [{ $set: { currentAmount: { $round: [{ $add: [{ $ifNull: ['$currentAmount', 0] }, amount] }, 2] } } }],
        { session, returnDocument: 'after', updatePipeline: true },
      ) as unknown as ISavingsPlan | null
    })
  } catch (err) {
    if (!(err instanceof InsufficientFundsError)) throw err
    notify({
      userId: plan.userId,
      title: 'Auto-debit Failed',
      message: `Insufficient wallet balance for your ${plan.frequency} savings contribution of GHS ${amount.toFixed(2)}.`,
      actionUrl: '/savings',
    }).catch((failure) => logger.warn('[AutoDebit] notify failed:', failure))
    return 'insufficient'
  }
  if (!updated) return 'skipped'

  if (updated.status !== 'completed' && updated.currentAmount >= updated.targetAmount) {
    const completed = await SavingsPlan.updateOne({ _id: plan._id, status: 'active' }, { $set: { status: 'completed' } })
    if (completed.modifiedCount) {
      notify({
        userId: plan.userId,
        title: 'Savings Goal Reached!',
        message: `Your savings plan has reached its target of GHS ${plan.targetAmount.toFixed(2)}!`,
        actionUrl: '/savings',
        category: 'savings',
      }).catch((failure) => logger.warn('[AutoDebit] notify failed:', failure))
    }
  }
  logger.info(`[AutoDebit] Debited GHS ${amount} for plan ${planId}`)
  return 'debited'
}

/** Per-plan error isolation — one bad plan must never skip everyone's debit. `planIds` scopes a run (tests share a database). */
export async function runSavingsAutoDebit(opts: { now?: Date; planIds?: string[] } = {}) {
  const now = opts.now ?? new Date()
  const plans = await SavingsPlan.find({ status: 'active', autoDebit: true, ...(opts.planIds ? { _id: { $in: opts.planIds } } : {}) }).lean()
  const summary = { debited: 0, insufficient: 0, skipped: 0, failed: 0 }
  for (const plan of plans) {
    try {
      summary[await autoDebitPlan(plan, now)]++
    } catch (err) {
      summary.failed++
      logger.error(`[AutoDebit] Auto-debit failed for plan ${String(plan._id)}:`, err)
    }
  }
  return summary
}
