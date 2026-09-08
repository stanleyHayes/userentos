/**
 * Which hosting provider this deployment talks to.
 *
 * Defaults to a provider that does nothing and says so. That matters: the bug
 * this replaces was a domain sitting at "provisioning" forever because nobody
 * was provisioning it. An unconfigured deployment must report "not managed
 * here", not a wait that will never end.
 */
import { envOr } from '../../utils/env.js'
import type { DomainStatus, HostingProvider } from './types.js'
import { vercelFromEnv } from './vercel.js'

export * from './types.js'

const NOT_CONFIGURED = 'TLS provisioning is not configured on this deployment.'

class UnconfiguredProvider implements HostingProvider {
  readonly name = 'none'
  readonly configured = false

  async attachDomain(): Promise<DomainStatus> {
    return { ok: false, tls: 'none', reason: NOT_CONFIGURED }
  }

  async domainStatus(): Promise<DomainStatus> {
    return { ok: false, tls: 'none', reason: NOT_CONFIGURED }
  }

  async detachDomain(): Promise<{ ok: boolean }> {
    // Nothing was ever attached, so there is nothing to fail at.
    return { ok: true }
  }
}

let cached: HostingProvider | null = null

export function hostingProvider(): HostingProvider {
  if (cached) return cached

  const configured = envOr('HOSTING_PROVIDER', 'vercel').toLowerCase()
  if (configured === 'vercel') {
    const vercel = vercelFromEnv()
    cached = vercel.configured ? vercel : new UnconfiguredProvider()
  } else {
    cached = new UnconfiguredProvider()
  }
  return cached
}

/** Tests only: forget the memoised provider so env changes take effect. */
export function resetHostingProvider(): void {
  cached = null
}
