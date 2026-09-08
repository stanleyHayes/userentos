import { describe, it, expect, vi, afterEach } from 'vitest'

const findMock = vi.fn()
vi.mock('../models/StorefrontDomain.js', () => ({ StorefrontDomain: { find: findMock } }))

const statusMock = vi.fn()
vi.mock('../services/hosting/index.js', () => ({
  hostingProvider: () => ({ name: 'vercel', configured: true, domainStatus: statusMock }),
}))

const { pollPendingCertificates, TLS_TIMEOUT_HOURS } = await import('../services/hosting/poll.js')

const NOW = new Date('2026-09-08T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000)

/** The fields the poller reads or writes on a domain row. */
interface FakeRow {
  domain: string
  tlsStatus: string
  tlsRequestedAt?: Date
  verifiedAt?: Date
  createdAt: Date
  lastCheckedAt?: Date
  failureReason?: string
  tlsChallenges?: unknown[]
  save: ReturnType<typeof vi.fn>
}

/** A pending domain row with a save() we can assert against. */
function row(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    domain: 'shop.com',
    tlsStatus: 'provisioning',
    tlsRequestedAt: hoursAgo(1),
    createdAt: hoursAgo(1),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function pending(rows: FakeRow[]) {
  findMock.mockReturnValue({ limit: () => Promise.resolve(rows) })
}

describe('certificate polling (spec §4.3)', () => {
  afterEach(() => vi.clearAllMocks())

  it('moves a domain to active once the host issues the certificate', async () => {
    const r = row()
    pending([r])
    statusMock.mockResolvedValue({ ok: true, tls: 'active' })

    const result = await pollPendingCertificates(NOW)

    expect(r.tlsStatus).toBe('active')
    expect(r.failureReason).toBeUndefined()
    expect(r.save).toHaveBeenCalled()
    expect(result).toMatchObject({ examined: 1, activated: 1, failed: 0 })
  })

  it('keeps waiting, and refreshes the DNS it is waiting on', async () => {
    const r = row()
    pending([r])
    statusMock.mockResolvedValue({
      ok: true, tls: 'provisioning',
      challenges: [{ type: 'TXT', domain: '_vercel.shop.com', value: 'vc-2' }],
      reason: 'Waiting on the DNS records below before the certificate can be issued.',
    })

    const result = await pollPendingCertificates(NOW)

    expect(r.tlsStatus).toBe('provisioning')
    expect(r.tlsChallenges).toHaveLength(1)
    expect(result.activated).toBe(0)
  })

  it('gives up after the timeout rather than spinning forever', async () => {
    const r = row({ tlsRequestedAt: hoursAgo(TLS_TIMEOUT_HOURS + 1) })
    pending([r])
    statusMock.mockResolvedValue({ ok: true, tls: 'provisioning' })

    const result = await pollPendingCertificates(NOW)

    expect(r.tlsStatus).toBe('failed')
    expect(r.failureReason).toContain('verify the domain again')
    expect(result.failed).toBe(1)
  })

  it('does not time out a domain that is still inside the window', async () => {
    const r = row({ tlsRequestedAt: hoursAgo(TLS_TIMEOUT_HOURS - 1) })
    pending([r])
    statusMock.mockResolvedValue({ ok: true, tls: 'provisioning' })

    await pollPendingCertificates(NOW)

    expect(r.tlsStatus).toBe('provisioning')
  })

  it('falls back to verifiedAt when the request time was never recorded', async () => {
    // Rows created before tlsRequestedAt existed must still be able to expire.
    const r = row({ tlsRequestedAt: undefined, verifiedAt: hoursAgo(TLS_TIMEOUT_HOURS + 2) })
    pending([r])
    statusMock.mockResolvedValue({ ok: true, tls: 'provisioning' })

    await pollPendingCertificates(NOW)

    expect(r.tlsStatus).toBe('failed')
  })

  it('stamps lastCheckedAt so the UI can say when it last looked', async () => {
    const r = row()
    pending([r])
    statusMock.mockResolvedValue({ ok: true, tls: 'active' })

    await pollPendingCertificates(NOW)

    expect(r.lastCheckedAt).toEqual(NOW)
  })
})

describe('certificate polling with no hosting configured', () => {
  afterEach(() => vi.clearAllMocks())

  it('does nothing at all rather than querying', async () => {
    vi.resetModules()
    vi.doMock('../services/hosting/index.js', () => ({
      hostingProvider: () => ({ name: 'none', configured: false, domainStatus: statusMock }),
    }))
    const { pollPendingCertificates: poll } = await import('../services/hosting/poll.js')

    const result = await poll(NOW)

    expect(result).toEqual({ examined: 0, activated: 0, failed: 0 })
    expect(statusMock).not.toHaveBeenCalled()
    vi.doUnmock('../services/hosting/index.js')
  })
})
