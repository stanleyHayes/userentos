import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import net from 'node:net'
import type { AddressInfo } from 'node:net'

const lookup = vi.hoisted(() => vi.fn())
vi.mock('dns/promises', () => ({ default: { lookup } }))
vi.mock('../models/WebhookSubscription.js', () => ({ WebhookSubscription: { updateOne: vi.fn(), find: vi.fn() } }))

const { deliver, pinnedLookup, ipIsPrivate, assertSafeWebhookUrl } = await import('../services/webhooks.js')

describe('outbound webhook address policy', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '198.18.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', 'not-an-ip',
  ])('treats %s as unreachable', (ip) => {
    expect(ipIsPrivate(ip)).toBe(true)
  })

  it.each(['8.8.8.8', '41.215.160.1', '2c0f:fe38::1'])('allows public %s', (ip) => {
    expect(ipIsPrivate(ip)).toBe(false)
  })
})

describe('the delivery connection resolves once, and that answer is the one checked', () => {
  const env = process.env.NODE_ENV
  beforeEach(() => { lookup.mockReset(); process.env.NODE_ENV = 'production' })
  afterEach(() => { process.env.NODE_ENV = env })

  it('refuses to connect when the host resolves to a private address', async () => {
    lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }])
    const result = await new Promise<{ err: unknown; address: unknown }>((resolve) =>
      pinnedLookup('metadata.example', {}, (err, address) => resolve({ err, address })))
    expect(result.err).toBeInstanceOf(Error)
  })

  it('hands the validated public address to the socket', async () => {
    lookup.mockResolvedValue([{ address: '41.215.160.1', family: 4 }])
    const single = await new Promise<unknown[]>((resolve) => pinnedLookup('hooks.example', {}, (...args) => resolve(args)))
    expect(single).toEqual([null, '41.215.160.1', 4])
    const all = await new Promise<unknown[]>((resolve) => pinnedLookup('hooks.example', { all: true }, (...args) => resolve(args)))
    expect(all).toEqual([null, [{ address: '41.215.160.1', family: 4 }]])
  })

  it('does not follow a DNS answer that changes to loopback after the check', async () => {
    // A receiver on this machine, standing in for an internal service.
    let connections = 0
    const internal = net.createServer((socket) => { connections++; socket.destroy() })
    await new Promise<void>((resolve) => internal.listen(0, '127.0.0.1', resolve))
    const { port } = internal.address() as AddressInfo
    try {
      // First answer (the pre-flight check) is public; every later one is loopback.
      lookup.mockResolvedValueOnce([{ address: '41.215.160.1', family: 4 }]).mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
      const delivered = await deliver({ _id: 'sub-1', url: `https://localhost:${port}/hook`, secret: 's' } as never, 'payment.completed', {})
      expect(delivered).toBe(false)
      expect(connections).toBe(0)
      expect(lookup.mock.calls.length).toBeGreaterThanOrEqual(2)
    } finally {
      await new Promise((resolve) => internal.close(resolve))
    }
  })

  it('refuses an IPv6 literal that maps to loopback', async () => {
    await expect(assertSafeWebhookUrl('https://[::ffff:7f00:1]/hook')).rejects.toThrow(/private/)
  })
})
