import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { BiometricToken } from '../models/BiometricToken.js'
import { Property } from '../models/Property.js'
import { Worker } from '../models/Worker.js'
import { Business } from '../models/Business.js'
import { BusinessListing } from '../models/BusinessListing.js'
import { Storefront } from '../models/Storefront.js'
import { StorefrontDomain } from '../models/StorefrontDomain.js'
import { Promotion } from '../models/Promotion.js'
import { AgencyProfile } from '../models/AgencyProfile.js'
import { ProfileAccess } from '../models/ProfileAccess.js'
import { TenantProfile } from '../models/TenantProfile.js'
import { WebhookSubscription } from '../models/WebhookSubscription.js'
import { AuditLog } from '../models/AuditLog.js'
import { rememberLegacyAvatar } from './avatarStorage.js'
import { revokeAccountSessions } from './sessionRevocation.js'
import { disconnectSession } from './socket.js'
import { recordErasure } from './erasureLedger.js'
import { hostingProvider } from './hosting/index.js'
import { recordAuditEntry } from '../utils/audit.js'
import { logger } from '../utils/logger.js'

/**
 * Closing an account — the one path for self-service deletion, an admin
 * deleting a user, and a deletion requested by email.
 *
 * At closure, in this order:
 *  1. The erasure ledger entry (so a restored backup re-applies it). If it
 *     cannot be written, nothing else happens and the caller reports failure.
 *  2. Everything public the account owns is taken down: listings, service
 *     provider, business, storefront (and custom domains), promotions, the
 *     agency page. Tenant-profile access and passport links are revoked and
 *     webhook subscriptions deleted, so no more personal data leaves.
 *  3. The identity is scrubbed and deletedAt set.
 *  4. Every session is revoked and open sockets disconnected.
 * The remaining records are erased after the grace period by
 * services/accountErasure.ts, retried until every step succeeds.
 */
export type ClosureSource = 'self_service' | 'admin' | 'email_request' | 'ledger_replay'

export interface CloseAccountOptions {
  source: ClosureSource
  /** Who acted: the account itself, or the administrator. */
  actorId: string
  reason?: string
  ipAddress?: string
  /** When the deletion was asked for — earlier than now when a ledger replay re-applies it. */
  requestedAt?: Date
  /** False on a replay onto a restored copy; see HostOptions. */
  contactHost?: boolean
  /** The requesting device's session (its access token's sid), closed quietly. */
  sid?: string
}

const CLOSED_REASON = 'Account closed'

/**
 * The deletion is in the ledger but a later step failed. The daily ledger
 * replay finishes it; the caller can say so instead of a bare error.
 */
export class AccountClosureIncompleteError extends Error {
  constructor(cause: unknown) {
    super('Account closure recorded but not finished', { cause })
  }
}

/** Listing states a closed account's property can be taken out of. Suspended/rejected ones stay as moderated. */
const WITHDRAWABLE_LISTING_STATUSES = ['draft', 'pending_review', 'in_review', 'changes_requested', 'approved', 'published'] as const

/**
 * Whether erasure may call the hosting provider. False when the ledger is
 * replayed onto a restored copy (scripts/replayErasureLedger.ts): the host is
 * live state a database restore never rolled back. The live service already
 * released the domain, and another seller may hold it by now, so detaching it
 * from a scratch or restored copy could take a live storefront off the air.
 */
export interface HostOptions {
  contactHost?: boolean
}

/**
 * Release custom domains at the host and drop their records, so the domain
 * stops serving and another seller can claim it. A domain the host refuses to
 * release is kept as 'removed' (not served, not polled) for a retry; the
 * return value counts them. With contactHost false the records are dropped
 * without asking the host (see HostOptions).
 */
export async function releaseStorefrontDomains(storefrontIds: string[], { contactHost = true }: HostOptions = {}): Promise<number> {
  if (storefrontIds.length === 0) return 0
  const domains = await StorefrontDomain.find({ storefrontId: { $in: storefrontIds } })
  let unreleased = 0
  for (const record of domains) {
    if (!contactHost) {
      await record.deleteOne()
      continue
    }
    const detached = await hostingProvider().detachDomain(record.domain)
      .catch((err: Error) => ({ ok: false, reason: err.message }))
    if (detached.ok) {
      await record.deleteOne()
      continue
    }
    logger.warn(`[Account closure] Host did not release custom domain ${String(record._id)}; kept as removed for retry`)
    unreleased++
    record.status = 'removed'
    record.tlsStatus = 'none'
    record.tlsChallenges = []
    record.failureReason = detached.reason
    await record.save()
  }
  return unreleased
}

/**
 * Take down everything public the account owns and stop sharing its data.
 * Idempotent: the ledger replay re-runs it for closed accounts still inside
 * the grace period, which heals a partial failure.
 */
export async function unpublishAccount(uid: string, now = new Date(), hostOptions: HostOptions = {}): Promise<void> {
  const [storefronts, businesses] = await Promise.all([
    Storefront.find({ ownerId: uid }).select('_id').lean(),
    Business.find({ ownerId: uid }).select('_id').lean(),
  ])
  const storefrontIds = storefronts.map((s) => String(s._id))
  const businessIds = businesses.map((b) => String(b._id))
  const operations: Array<() => PromiseLike<unknown>> = [
    () => Property.updateMany({ landlordId: uid, listingStatus: { $in: [...WITHDRAWABLE_LISTING_STATUSES] } }, { $set: { listingStatus: 'withdrawn' } }),
    () => Worker.updateMany({ userId: uid }, { $set: { status: 'offline', approvalStatus: 'rejected', rejectionReason: CLOSED_REASON } }),
    () => Business.updateMany({ ownerId: uid }, { $set: { approvalStatus: 'rejected', rejectionReason: CLOSED_REASON } }),
    () => BusinessListing.updateMany({ businessId: { $in: businessIds } }, { $set: { isActive: false } }),
    () => Storefront.updateMany({ ownerId: uid }, { $set: { status: 'archived' } }),
    () => releaseStorefrontDomains(storefrontIds, hostOptions),
    () => Promotion.updateMany({ $or: [{ ownerId: uid }, { storefrontId: { $in: storefrontIds } }] }, { $set: { status: 'disabled' } }),
    () => AgencyProfile.updateMany({ ownerId: uid, hiddenAt: { $exists: false } }, { $set: { hiddenAt: now } }),
    // Both directions: landlords lose access to this tenant, and this account's
    // own access to other tenants ends with it.
    () => ProfileAccess.updateMany(
      { $or: [{ tenantId: uid }, { requesterId: uid }], status: { $in: ['pending', 'approved'] } },
      { $set: { status: 'revoked', respondedAt: now } },
    ),
    // Share links are JWTs; revocation kills every one issued before now.
    () => TenantProfile.updateOne({ userId: uid }, { $set: { passportShareRevokedAt: now } }),
    // Otherwise events about this account keep being delivered to its endpoint.
    () => WebhookSubscription.deleteMany({ userId: uid }),
  ]
  const results = await Promise.allSettled(operations.map((operation) => Promise.resolve().then(operation)))
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('Unpublishing the account was incomplete')
  }
}

/**
 * Close the account. Returns false when there is no open account with that id.
 * Throws when the ledger entry cannot be written (nothing has changed), or
 * AccountClosureIncompleteError when a later step fails (the ledger replay
 * finishes it within a day; retrying is also safe).
 */
export async function closeAccount(userId: string, options: CloseAccountOptions): Promise<boolean> {
  const user = await User.findById(userId)
  if (!user) return false
  const requestedAt = options.requestedAt ?? new Date()

  if (options.source !== 'ledger_replay') {
    await recordErasure({ subjectId: userId, scope: 'account', source: options.source, requestedAt })
  }
  // Before the account changes: the socket watcher tells every open socket of
  // a closed account 'account:closed' and signs it out, which would cut off
  // the requesting device before it shows its own confirmation.
  if (options.sid) disconnectSession(options.sid, { notify: false })
  try {
    await finishClosure(user, userId, requestedAt, options)
  } catch (err) {
    throw new AccountClosureIncompleteError(err)
  }
  return true
}

async function finishClosure(user: InstanceType<typeof User>, userId: string, requestedAt: Date, options: CloseAccountOptions): Promise<void> {
  await unpublishAccount(userId, requestedAt, { contactHost: options.contactHost })
  await rememberLegacyAvatar(userId, user.profileImage)

  /*
   * What the tombstone keeps until the purge deletes it (Act 843
   * minimisation), and why:
   *  - roles/activeRole: schema-required; they grant nothing once deletedAt is set.
   *  - consents versions + acceptedAt + ageConfirmed: which terms governed the
   *    processing that happened. The signing IP and device are dropped.
   *  - suspension fields: the account was closed while suspended for abuse —
   *    kept so the report trail survives the window.
   *  - storeAccountToken + subscription fields: app-store refund/revocation
   *    notifications and payment disputes still resolve to this account.
   * Everything else that describes the person is scrambled or removed.
   */
  const scramble = crypto.randomBytes(8).toString('hex')
  user.email = `deleted-${scramble}@userentos.com`
  user.phone = `000000${scramble.slice(0, 6)}`
  user.firstName = 'Deleted'
  user.lastName = 'User'
  user.passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), config.bcryptRounds)
  user.ghanaCardId = undefined
  user.profileImage = undefined
  user.mfaSecret = undefined
  user.markModified('mfaSecret')
  user.mfaEnabled = false
  user.set('consents.ip', undefined)
  user.set('consents.userAgent', undefined)
  user.set('settings', undefined)
  user.invitedBy = undefined
  user.permissions = []
  user.isVerified = false
  user.verificationStatus = 'none'
  user.taxReportingConsent = false
  user.deletedAt = requestedAt
  await user.save()

  await endClosedAccountSessions(userId, options.sid)

  await recordAuditEntry({
    userId: options.actorId,
    action: 'users.delete',
    entityType: 'User',
    entityId: userId,
    details: { source: options.source, ...(options.reason ? { reason: options.reason } : {}) },
    ipAddress: options.ipAddress,
  })
}

/**
 * Bumps sessionVersion, disconnects sockets, removes push tokens and revokes
 * refresh and biometric credentials; biometric enrolments go entirely.
 * Idempotent.
 */
async function endClosedAccountSessions(userId: string, requestingSid?: string): Promise<void> {
  // Other devices are told the account was closed and sign out; the device
  // that closed it shows its own confirmation, so its sockets close quietly.
  await revokeAccountSessions(userId, 'gdpr_deletion', { notice: 'account:closed', quietSid: requestingSid })
  await BiometricToken.deleteMany({ userId })
}

/**
 * The steps after the tombstone is saved, again, for a closed account.
 *
 * Once deletedAt is set the user's token is refused, so if revoking sessions
 * failed after the save they cannot retry the closure themselves — and their
 * devices would keep refresh tokens and push enrolments until the day-30
 * erasure. The ledger replay runs this for every closed account it sees:
 * sessions revoked, push and biometric enrolments removed, and the
 * 'users.delete' audit entry written if it never was. Idempotent.
 */
export async function completeClosedAccount(userId: string, source: string): Promise<void> {
  await endClosedAccountSessions(userId)
  if (!(await AuditLog.exists({ action: 'users.delete', entityType: 'User', entityId: userId }))) {
    await recordAuditEntry({ userId: 'system', action: 'users.delete', entityType: 'User', entityId: userId, details: { source, completedBy: 'ledger_replay' } })
  }
}
