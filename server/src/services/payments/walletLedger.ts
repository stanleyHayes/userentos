/**
 * Central wallet ledger — the ONLY place wallet balances may change.
 *
 * Guarantees:
 *  - atomic balance mutation (findOneAndUpdate + $inc, no read-modify-write)
 *  - debits are guarded: balance can never go negative, concurrent debits
 *    can't double-spend
 *  - every amount rounds through utils/money (no float drift)
 *  - the embedded transactions array stays bounded ($slice) so long-lived
 *    wallets never approach the 16MB document cap
 *
 * NOTE: no multi-document transactions here — Mongo may run standalone.
 * Callers compose debit-first + compensating-credit ordering for transfers.
 */

import { Wallet } from '../../models/Wallet.js'
import { round2 } from '../../utils/money.js'

export interface WalletTxMeta {
  type: string
  reference?: string
  description?: string
}

/** Keep only the most recent transactions embedded on the wallet document. */
const MAX_EMBEDDED_TX = 500

function assertValidAmount(amount: number, direction: 'credit' | 'debit'): number {
  const value = round2(amount)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid wallet ${direction} amount: ${amount}`)
  }
  return value
}

/** Atomic credit. Throws on failure (DB error or invalid amount). */
export async function creditWallet(userId: string, amount: number, meta: WalletTxMeta): Promise<void> {
  const value = assertValidAmount(amount, 'credit')
  const reference = meta.reference ?? `CR-${Date.now()}`

  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: value }, $setOnInsert: { userId } },
    { new: true, upsert: true },
  )
  if (!wallet) throw new Error(`Failed to credit wallet for user ${userId}`)

  await Wallet.updateOne(
    { userId },
    {
      $push: {
        transactions: {
          $each: [{
            type: meta.type,
            amount: value,
            balanceAfter: wallet.balance,
            reference,
            description: meta.description ?? meta.type,
            createdAt: new Date().toISOString(),
          }],
          $slice: -MAX_EMBEDDED_TX,
        },
      },
    },
  )
}

/**
 * Atomic debit with balance guard.
 * Returns false when funds are insufficient (no write happened).
 * Throws on other failures (invalid amount, DB error).
 */
export async function debitWallet(userId: string, amount: number, meta: WalletTxMeta): Promise<boolean> {
  const value = assertValidAmount(amount, 'debit')
  const reference = meta.reference ?? `DR-${Date.now()}`

  const wallet = await Wallet.findOneAndUpdate(
    { userId, balance: { $gte: value } },
    { $inc: { balance: -value } },
    { new: true },
  )
  if (!wallet) return false // insufficient funds (or no wallet — same outcome)

  await Wallet.updateOne(
    { userId },
    {
      $push: {
        transactions: {
          $each: [{
            type: meta.type,
            amount: -value,
            balanceAfter: wallet.balance,
            reference,
            description: meta.description ?? meta.type,
            createdAt: new Date().toISOString(),
          }],
          $slice: -MAX_EMBEDDED_TX,
        },
      },
    },
  )
  return true
}
