/**
 * Vercel as the TLS/hosting provider for storefront custom domains (spec §4.3).
 *
 * Endpoints used (checked against the REST API reference, September 2026):
 *   POST   /v10/projects/{idOrName}/domains          attach
 *   GET    /v9/projects/{idOrName}/domains/{domain}  status
 *   DELETE /v9/projects/{idOrName}/domains/{domain}  detach
 *
 * Vercel issues the certificate itself once a domain is attached and verified,
 * so there is no separate "certificate" call to make: `verified: true` is the
 * signal that TLS is live. While it is false, `verification[]` carries the DNS
 * the seller still has to publish, which is exactly what the storefront UI
 * needs to show them.
 */
import { envOr } from '../../utils/env.js'
import { logger } from '../../utils/logger.js'
import type { DomainStatus, HostingProvider } from './types.js'

const API = 'https://api.vercel.com'

/** Bound every call: a hung hosting API must not hold a request or a cron tick. */
const TIMEOUT_MS = 10_000

interface VercelDomain {
  name: string
  verified: boolean
  verification?: Array<{ type: string; domain: string; value: string; reason?: string }>
}

interface VercelError {
  error?: { code?: string; message?: string }
}

export class VercelHostingProvider implements HostingProvider {
  readonly name = 'vercel'

  constructor(
    private readonly token: string,
    private readonly projectId: string,
    private readonly teamId?: string,
  ) {}

  get configured(): boolean {
    return this.token !== '' && this.projectId !== ''
  }

  private url(path: string): string {
    const team = this.teamId ? `?teamId=${encodeURIComponent(this.teamId)}` : ''
    return `${API}${path}${team}`
  }

  private async call<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<{ ok: boolean; status: number; body: T & VercelError }> {
    const res = await fetch(this.url(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    // A 204 or an empty body is normal on DELETE.
    const text = await res.text()
    const body = text ? (JSON.parse(text) as T & VercelError) : ({} as T & VercelError)
    return { ok: res.ok, status: res.status, body }
  }

  /** Turn a Vercel project-domain payload into our own vocabulary. */
  private toStatus(domain: VercelDomain): DomainStatus {
    if (domain.verified) return { ok: true, tls: 'active' }

    const challenges = (domain.verification ?? []).map((v) => ({
      type: v.type,
      domain: v.domain,
      value: v.value,
      reason: v.reason,
    }))

    return {
      ok: true,
      tls: 'provisioning',
      challenges,
      reason: challenges.length > 0
        ? 'Waiting on the DNS records below before the certificate can be issued.'
        : 'Waiting for DNS to propagate before the certificate can be issued.',
    }
  }

  async attachDomain(domain: string): Promise<DomainStatus> {
    try {
      const { ok, status, body } = await this.call<VercelDomain>(
        `/v10/projects/${encodeURIComponent(this.projectId)}/domains`,
        { method: 'POST', body: JSON.stringify({ name: domain }) },
      )

      // Already attached to this project — the desired end state, so treat the
      // conflict as success and read the real status instead of failing.
      if (!ok && (status === 409 || body.error?.code === 'domain_already_in_use')) {
        return this.domainStatus(domain)
      }

      if (!ok) {
        const reason = body.error?.message ?? `Vercel refused the domain (HTTP ${status}).`
        logger.warn(`[hosting] attach ${domain} failed: ${reason}`)
        return { ok: false, tls: 'failed', reason }
      }

      return this.toStatus(body)
    } catch (err) {
      const reason = (err as Error).message
      logger.warn(`[hosting] attach ${domain} errored: ${reason}`)
      // A network blip is not a failed certificate; stay in provisioning so the
      // poller retries rather than telling the seller their domain is broken.
      return { ok: false, tls: 'provisioning', reason: 'Could not reach the hosting provider; will retry.' }
    }
  }

  async domainStatus(domain: string): Promise<DomainStatus> {
    try {
      const { ok, status, body } = await this.call<VercelDomain>(
        `/v9/projects/${encodeURIComponent(this.projectId)}/domains/${encodeURIComponent(domain)}`,
      )

      if (status === 404) {
        return { ok: false, tls: 'failed', reason: 'The domain is not attached to the hosting project.' }
      }
      if (!ok) {
        return { ok: false, tls: 'provisioning', reason: body.error?.message ?? `HTTP ${status}` }
      }

      return this.toStatus(body)
    } catch (err) {
      logger.warn(`[hosting] status ${domain} errored: ${(err as Error).message}`)
      return { ok: false, tls: 'provisioning', reason: 'Could not reach the hosting provider; will retry.' }
    }
  }

  async detachDomain(domain: string): Promise<{ ok: boolean; reason?: string }> {
    try {
      const { ok, status, body } = await this.call(
        `/v9/projects/${encodeURIComponent(this.projectId)}/domains/${encodeURIComponent(domain)}`,
        { method: 'DELETE' },
      )
      // Removing a domain that is not there is the outcome we wanted.
      if (ok || status === 404) return { ok: true }
      return { ok: false, reason: body.error?.message ?? `HTTP ${status}` }
    } catch (err) {
      return { ok: false, reason: (err as Error).message }
    }
  }
}

export function vercelFromEnv(): VercelHostingProvider {
  return new VercelHostingProvider(
    envOr('VERCEL_API_TOKEN', ''),
    envOr('VERCEL_PROJECT_ID', ''),
    envOr('VERCEL_TEAM_ID', '') || undefined,
  )
}
