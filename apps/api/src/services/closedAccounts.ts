import { isValidObjectId } from 'mongoose'
import { User } from '../models/User.js'

/**
 * Closed accounts still inside the erasure grace period.
 *
 * Closing an account unpublishes everything it owns at once
 * (services/accountClosure.ts). Public directories also exclude these owners,
 * so a failed or partial unpublish can never leave a closed account's listing
 * or contact details on show. The set is small: after the grace period the
 * account and its public records are gone.
 */
export async function closedAccountIds(): Promise<string[]> {
  const ids = await User.distinct('_id', { deletedAt: { $exists: true } })
  return ids.map(String)
}

export async function isClosedAccount(id?: string | null): Promise<boolean> {
  if (!id || !isValidObjectId(id)) return false
  return !!(await User.exists({ _id: id, deletedAt: { $exists: true } }))
}
