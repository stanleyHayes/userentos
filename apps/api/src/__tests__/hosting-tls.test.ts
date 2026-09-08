import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VercelHostingProvider } from '../services/hosting/vercel.js'
import { hostingProvider, resetHostingProvider } from '../services/hosting/index.js'

/** Stand in for one fetch round-trip. */
function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  })
}

const provider = () => new VercelHostingProvider('tok', 'prj_1', 'team_1')

describe('Vercel hosting provider (spec §4.3)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetHostingProvider() })

  it('reports TLS active once the host says the domain is verified', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { name: 'shop.com', verified: true }))
    const result = await provider().attachDomain('shop.com')
    expect(result).toMatchObject({ ok: true, tls: 'active' })
  })

  it('surfaces the DNS the host is still waiting on', async () => {
    vi.stubGlobal('fetch', mockFetch(200, {
      name: 'shop.com',
      verified: false,
      verification: [{ type: 'TXT', domain: '_vercel.shop.com', value: 'vc-1', reason: 'pending' }],
    }))

    const result = await provider().attachDomain('shop.com')

    expect(result.tls).toBe('provisioning')
    expect(result.challenges).toEqual([
      { type: 'TXT', domain: '_vercel.shop.com', value: 'vc-1', reason: 'pending' },
    ])
  })

  it('treats an already-attached domain as success rather than an error', async () => {
    // 409 on attach, then the status call reports it live.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => JSON.stringify({ error: { code: 'domain_already_in_use' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ name: 'shop.com', verified: true }) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await provider().attachDomain('shop.com')

    expect(result).toMatchObject({ ok: true, tls: 'active' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stays in provisioning when the host is unreachable, so the poller retries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')))
    const result = await provider().attachDomain('shop.com')
    // A network blip must not be reported to the seller as a broken certificate.
    expect(result.tls).toBe('provisioning')
  })

  it('reports a genuine refusal as failed', async () => {
    vi.stubGlobal('fetch', mockFetch(400, { error: { message: 'The domain is not valid' } }))
    const result = await provider().attachDomain('not a domain')
    expect(result).toMatchObject({ ok: false, tls: 'failed', reason: 'The domain is not valid' })
  })

  it('calls it failed when the host does not know the domain', async () => {
    vi.stubGlobal('fetch', mockFetch(404, {}))
    const result = await provider().domainStatus('shop.com')
    expect(result).toMatchObject({ tls: 'failed' })
  })

  it('treats detaching an unknown domain as done', async () => {
    vi.stubGlobal('fetch', mockFetch(404, {}))
    await expect(provider().detachDomain('shop.com')).resolves.toEqual({ ok: true })
  })

  it('sends the bearer token and scopes the call to the team', async () => {
    const fetchMock = mockFetch(200, { name: 'shop.com', verified: true })
    vi.stubGlobal('fetch', fetchMock)

    await provider().attachDomain('shop.com')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/v10/projects/prj_1/domains')
    expect(url).toContain('teamId=team_1')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })
})

describe('provider selection', () => {
  beforeEach(() => resetHostingProvider())
  afterEach(() => { vi.unstubAllEnvs(); resetHostingProvider() })

  it('falls back to a provider that admits it is not configured', () => {
    vi.stubEnv('VERCEL_API_TOKEN', '')
    vi.stubEnv('VERCEL_PROJECT_ID', '')

    const host = hostingProvider()

    // The bug being closed: an unconfigured deployment must NOT report a wait
    // that will never end.
    expect(host.configured).toBe(false)
    expect(host.name).toBe('none')
  })

  it('uses Vercel once both credentials are present', () => {
    vi.stubEnv('VERCEL_API_TOKEN', 'tok')
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1')

    const host = hostingProvider()

    expect(host.configured).toBe(true)
    expect(host.name).toBe('vercel')
  })

  it('an unconfigured deployment reports "none", never "provisioning"', async () => {
    vi.stubEnv('VERCEL_API_TOKEN', '')
    vi.stubEnv('VERCEL_PROJECT_ID', '')

    const result = await hostingProvider().attachDomain('shop.com')

    expect(result.tls).toBe('none')
    expect(result.reason).toContain('not configured')
  })
})
