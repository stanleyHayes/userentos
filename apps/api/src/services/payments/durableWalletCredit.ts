import { randomUUID } from 'node:crypto'
import { Wallet } from '../../models/Wallet.js'
import { WalletCredit, type IWalletCredit } from '../../models/WalletCredit.js'
import { round2 } from '../../utils/money.js'

type CreditTerms = Pick<IWalletCredit, 'operationKey' | 'userId' | 'amount' | 'type' | 'reference'>

/** An operation key must identify one immutable financial obligation, never one retry. */
export async function prepareWalletCredit(terms: CreditTerms): Promise<void> {
  const amount = round2(terms.amount)
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100)) || ![terms.operationKey, terms.userId, terms.type, terms.reference].every(value => typeof value === 'string' && value.length > 0 && value.length <= 250)) throw new Error('Invalid wallet credit terms')
  try { await WalletCredit.updateOne({ operationKey: terms.operationKey }, { $setOnInsert: { ...terms, amount, state: 'pending' } }, { upsert: true, runValidators: true }) }
  catch (failure) { if ((failure as { code?: number }).code !== 11000) throw failure }
  const stored = await WalletCredit.findOne({ operationKey: terms.operationKey }).lean()
  if (!stored || stored.userId !== terms.userId || stored.amount !== amount || stored.type !== terms.type || stored.reference !== terms.reference) throw new Error('Wallet credit operation conflicts with its recorded terms')
}

/**
 * Standalone-Mongo protocol: reserve one wallet slot, move balance and mark that
 * slot applied in ONE write, complete the durable journal, then release the slot.
 * No timeout discards an applied marker. Any worker can resume the saved phase.
 * Other credits/debits may change balance atomically without replacing this slot.
 */
export async function applyWalletCredit(operationKey: string): Promise<boolean> {
  const credit = await WalletCredit.findOne({ operationKey }).lean()
  if (!credit) throw new Error('Wallet credit operation not found')
  if (credit.state === 'completed') {
    await Wallet.updateOne({ userId: credit.userId, 'pendingCredit.operationKey': operationKey }, { $unset: { pendingCredit: '' } })
    return true
  }
  try { await Wallet.updateOne({ userId: credit.userId }, { $setOnInsert: { balance: 0, transactions: [] } }, { upsert: true }) }
  catch (failure) { if ((failure as { code?: number }).code !== 11000) throw failure }
  const claim = randomUUID()
  await Wallet.updateOne({ userId: credit.userId, pendingCredit: { $exists: false } }, { $set: { pendingCredit: { operationKey, claim, phase: 'prepared' } } })
  let wallet = await Wallet.findOne({ userId: credit.userId }).lean()
  const slot = wallet?.pendingCredit
  if (!slot || slot.operationKey !== operationKey) return false

  // A delayed worker can reserve after another worker completed and released the
  // same operation. Re-read AFTER reservation to prevent crediting it a second time.
  const current = await WalletCredit.findOne({ operationKey }).lean()
  if (!current) throw new Error('Wallet credit journal unavailable')
  if (current.state === 'completed') {
    await Wallet.updateOne({ userId: credit.userId, 'pendingCredit.claim': slot.claim }, { $unset: { pendingCredit: '' } })
    return true
  }
  wallet = await Wallet.findOneAndUpdate({ userId: credit.userId, balance: { $gte: 0, $lte: Number.MAX_SAFE_INTEGER / 100 - credit.amount }, 'pendingCredit.claim': slot.claim, 'pendingCredit.phase': 'prepared' }, [
    { $set: { balance: { $round: [{ $add: [{ $ifNull: ['$balance', 0] }, credit.amount] }, 2] } } },
    { $set: {
      'pendingCredit.phase': 'applied',
      transactions: { $slice: [{ $concatArrays: [{ $ifNull: ['$transactions', []] }, [{
        type: { $literal: credit.type }, amount: credit.amount, balanceAfter: '$balance',
        reference: { $literal: credit.reference }, description: { $literal: credit.type },
        createdAt: new Date().toISOString(),
      }]] }, -500] },
    } },
  ], { updatePipeline: true, returnDocument: 'after' }).lean()
  if (!wallet) wallet = await Wallet.findOne({ userId: credit.userId }).lean()
  if (wallet?.pendingCredit?.claim !== slot.claim || wallet.pendingCredit.phase !== 'applied') {
    return (await WalletCredit.findOne({ operationKey }).lean())?.state === 'completed'
  }
  const completed = await WalletCredit.updateOne({ operationKey, state: 'pending' }, { $set: { state: 'completed', appliedAt: new Date() } })
  if (!completed.matchedCount && (await WalletCredit.findOne({ operationKey }).lean())?.state !== 'completed') throw new Error('Wallet credit completion could not be recorded')
  await Wallet.updateOne({ userId: credit.userId, 'pendingCredit.claim': slot.claim }, { $unset: { pendingCredit: '' } })
  return true
}
