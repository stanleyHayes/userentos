/**
 * Money moves between documents, all or nothing.
 *
 * A transfer is several writes: debit one wallet, credit another, mark the
 * obligation settled. Done one after another with compensating writes, a
 * crash or a deploy between them strands money — a move-out marked
 * 'refund_paid' with nothing transferred, a payout debited with no record.
 * Production Mongo (Atlas) is a replica set, so those writes run in one
 * transaction and either all land or none do.
 *
 * A standalone Mongo (the docker-compose self-host) cannot run transactions.
 * There the same work runs without a session, and each step it registered
 * with `onRollback` is undone in reverse order if a later step throws — the
 * compensating-write behaviour this replaced, kept only where nothing better
 * is available.
 */
import mongoose, { type ClientSession } from 'mongoose'
import { logger } from '../../utils/logger.js'

export interface MoneyTransaction {
  /** Pass to every read and write in the transfer. Undefined on a standalone server. */
  session?: ClientSession
  /** How to undo a completed step on a standalone server. Ignored inside a real transaction. */
  onRollback(step: () => Promise<unknown>): void
}

let supported: boolean | undefined

/** Whether the connected server can run multi-document transactions. */
export async function transactionsSupported(): Promise<boolean> {
  if (supported !== undefined) return supported
  const db = mongoose.connection.db
  if (!db) return false
  try {
    const hello = await db.admin().command({ hello: 1 })
    supported = typeof hello.setName === 'string' || hello.msg === 'isdbgrid'
    if (!supported) logger.warn('[Money] MongoDB is standalone: transfers fall back to compensating writes instead of transactions')
    return supported
  } catch {
    // Unknown is not "no": ask again next time rather than caching a guess.
    return false
  }
}

/**
 * Run a transfer atomically. Throw inside `work` to abort it; the thrown error
 * is rethrown to the caller after the rollback.
 */
export async function withMoneyTransaction<T>(work: (tx: MoneyTransaction) => Promise<T>): Promise<T> {
  if (await transactionsSupported()) {
    // Mongoose retries the whole callback on a transient write conflict, so
    // `work` must not have side effects outside the session.
    return mongoose.connection.transaction((session) => work({ session, onRollback: () => undefined }))
  }
  const undo: Array<() => Promise<unknown>> = []
  try {
    return await work({ onRollback: (step) => { undo.push(step) } })
  } catch (failure) {
    for (const step of undo.reverse()) {
      try { await step() } catch (err) {
        logger.error(`[Money] CRITICAL: compensation after a failed transfer did not apply: ${(err as Error).message}`)
      }
    }
    throw failure
  }
}

/** Thrown inside a transfer to abort it because a wallet could not cover a debit. */
export class InsufficientFundsError extends Error {
  constructor(message = 'Insufficient wallet balance') {
    super(message)
    this.name = 'InsufficientFundsError'
  }
}
