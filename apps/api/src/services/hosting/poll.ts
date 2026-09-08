/**
 * Advance domains that are waiting on a certificate (spec §4.3).
 *
 * Attaching a domain starts issuance but does not finish it — the seller still
 * has to point DNS, and the host still has to see it. Without something asking
 * "is it done yet", `tlsStatus` never leaves 'provisioning', which is the
 * exact bug this closes.
 */
import { StorefrontDomain } from '../../models/StorefrontDomain.js'
import { logger } from '../../utils/logger.js'
import { envNumber } from '../../utils/env.js'
import { hostingProvider } from './index.js'

/**
 * How long a certificate may stay pending before it is called failed.
 *
 * Vercel issues within minutes once DNS is correct, so a domain still waiting
 * a day later is almost always DNS that was never published. Saying so is more
 * useful than an indefinite spinner — and 'failed' is recoverable, because
 * re-verifying re-attaches.
 */
export const TLS_TIMEOUT_HOURS = envNumber('TLS_PROVISION_TIMEOUT_HOURS', 24)

export interface PollResult {
  examined: number
  activated: number
  failed: number
}

export async function pollPendingCertificates(now: Date = new Date()): Promise<PollResult> {
  const host = hostingProvider()
  // Nothing to poll if nothing was ever asked to provision.
  if (!host.configured) return { examined: 0, activated: 0, failed: 0 }

  const pending = await StorefrontDomain.find({
    tlsStatus: 'provisioning',
    status: { $in: ['verified', 'active'] },
  }).limit(100)

  let activated = 0
  let failed = 0

  for (const record of pending) {
    const status = await host.domainStatus(record.domain)
    record.lastCheckedAt = now

    if (status.tls === 'active') {
      record.tlsStatus = 'active'
      record.failureReason = undefined
      record.tlsChallenges = []
      activated += 1
    } else {
      const startedAt = record.tlsRequestedAt ?? record.verifiedAt ?? record.createdAt
      const waitedMs = now.getTime() - new Date(startedAt).getTime()

      if (waitedMs > TLS_TIMEOUT_HOURS * 60 * 60 * 1000) {
        record.tlsStatus = 'failed'
        record.failureReason =
          `The certificate was not issued within ${TLS_TIMEOUT_HOURS} hours. `
          + 'Check the DNS records, then verify the domain again.'
        failed += 1
      } else {
        record.tlsChallenges = status.challenges ?? []
        record.failureReason = status.reason
      }
    }

    await record.save()
  }

  if (activated > 0 || failed > 0) {
    logger.info(`[hosting] certificates: ${activated} active, ${failed} timed out of ${pending.length} pending.`)
  }
  return { examined: pending.length, activated, failed }
}
