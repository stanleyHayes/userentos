/**
 * The hosting layer, as the storefront code needs to see it (spec §4.3).
 *
 * A custom domain is only half ours: we prove the seller owns it, but the
 * certificate is issued by whoever terminates TLS for the app. Before this
 * existed, verifying a domain set `tlsStatus = 'provisioning'` and nothing ever
 * moved it — every custom domain sat "provisioning" forever, which is a worse
 * lie than saying nothing.
 *
 * The interface is deliberately small and provider-shaped rather than
 * Vercel-shaped, so moving hosts is one new file.
 */

/** How far along the certificate is, as the provider reports it. */
export type TlsState = 'none' | 'provisioning' | 'active' | 'failed'

/** A DNS record the seller still has to publish before the host will finish. */
export interface DomainChallenge {
  type: string
  domain: string
  value: string
  reason?: string
}

export interface DomainStatus {
  ok: boolean
  tls: TlsState
  challenges?: DomainChallenge[]
  /** Why it is not done — shown to the seller, so keep it in plain language. */
  reason?: string
}

export interface HostingProvider {
  readonly name: string
  /**
   * False when the deployment has no hosting credentials. Callers must not
   * report "provisioning" in that case: nothing is provisioning.
   */
  readonly configured: boolean
  /** Register the domain with the host and start certificate issuance. */
  attachDomain(domain: string): Promise<DomainStatus>
  /** Where issuance has got to. Safe to call repeatedly. */
  domainStatus(domain: string): Promise<DomainStatus>
  /** Release the domain. Removing an unknown domain must succeed. */
  detachDomain(domain: string): Promise<{ ok: boolean; reason?: string }>
}
