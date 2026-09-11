import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import {
  toLocalGhanaMsisdn,
  mapChargeStatus,
  paystackRentProviders,
  paystackMtnProvider,
} from '../services/payments/paystackRent.js'

const KEY = 'sk_test_reviewkey'

function okFetch(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200,
    text: async () => JSON.stringify({ status: true, message: 'ok', data }),
  })
}

describe('phone normalisation', () => {
  it('converts MSISDN to the local form Paystack expects', () => {
    expect(toLocalGhanaMsisdn('233551234987')).toBe('0551234987')
    expect(toLocalGhanaMsisdn('+233 55 123 4987')).toBe('0551234987')
  })

  it('leaves an already-local number alone', () => {
    expect(toLocalGhanaMsisdn('0551234987')).toBe('0551234987')
  })

  it('restores the leading zero on a bare subscriber number', () => {
    expect(toLocalGhanaMsisdn('551234987')).toBe('0551234987')
  })
})

describe('charge status mapping', () => {
  it('treats only a finished charge as completed', () => {
    expect(mapChargeStatus('success')).toBe('completed')
  })

  it('treats every in-progress state as pending, not failed', () => {
    // Calling these failed would cancel a payment the tenant is midway through
    // approving on their handset.
    for (const s of ['send_otp', 'pay_offline', 'pending', 'open_url', 'ongoing', undefined]) {
      expect(mapChargeStatus(s), `${s} must stay pending`).toBe('pending')
    }
  })

  it('maps the genuinely terminal failures', () => {
    for (const s of ['failed', 'reversed', 'abandoned']) {
      expect(mapChargeStatus(s)).toBe('failed')
    }
  })
})

describe('provider mapping', () => {
  it('carries each network on the code Paystack actually accepts', async () => {
    // Confirmed against the live test API: mtn / vod / atl are accepted,
    // "telecel" and "airtel" are rejected.
    vi.stubEnv('PAYSTACK_SECRET_KEY', KEY)
    const expected: Record<string, string> = {
      mtn_momo: 'mtn',
      telecel_cash: 'vod',
      airteltigo_money: 'atl',
    }
    for (const [id, code] of Object.entries(expected)) {
      const fetchMock = okFetch({ reference: 'PAY-1', status: 'pay_offline' })
      vi.stubGlobal('fetch', fetchMock)
      await paystackRentProviders[id as keyof typeof paystackRentProviders]
        .initiateCollection({ amount: 250, phone: '233551234987', reference: 'PAY-1', narration: 'Rent' })
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.mobile_money.provider, `${id} -> ${code}`).toBe(code)
    }
  })

  it('keeps our own provider id, so stored payments never learn about Paystack', () => {
    expect(paystackRentProviders.mtn_momo.id).toBe('mtn_momo')
    expect(paystackRentProviders.telecel_cash.id).toBe('telecel_cash')
  })
})

describe('initiating a collection', () => {
  beforeEach(() => vi.stubEnv('PAYSTACK_SECRET_KEY', KEY))
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('sends the amount in pesewas, not cedis', async () => {
    const fetchMock = okFetch({ reference: 'PAY-2', status: 'pay_offline' })
    vi.stubGlobal('fetch', fetchMock)

    await paystackMtnProvider.initiateCollection({ amount: 250.5, phone: '0551234987', reference: 'PAY-2', narration: 'Rent' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    // 250.50 GHS is 25050 pesewas. Sending 250.5 would charge the tenant GHS 2.50.
    expect(body.amount).toBe('25050')
    expect(body.currency).toBe('GHS')
  })

  it('echoes our own reference so the webhook can be correlated', async () => {
    vi.stubGlobal('fetch', okFetch({ reference: 'PAY-3', status: 'send_otp' }))
    const r = await paystackMtnProvider.initiateCollection({ amount: 10, phone: '0551234987', reference: 'PAY-3', narration: 'Rent' })
    expect(r.providerRef).toBe('PAY-3')
    expect(r.status).toBe('pending')
    expect(r.instructions).toMatch(/one-time code/i)
  })

  it('surfaces the provider display text to the payer when there is one', async () => {
    vi.stubGlobal('fetch', okFetch({ reference: 'PAY-4', status: 'pay_offline', display_text: 'Dial *170# to approve' }))
    const r = await paystackMtnProvider.initiateCollection({ amount: 10, phone: '0551234987', reference: 'PAY-4', narration: 'Rent' })
    expect(r.instructions).toBe('Dial *170# to approve')
  })
})

describe('webhook verification', () => {
  beforeEach(() => vi.stubEnv('PAYSTACK_SECRET_KEY', KEY))
  afterEach(() => vi.unstubAllEnvs())

  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'PAY-5', id: 99, amount: 25000, status: 'success', paid_at: '2026-09-11T10:00:00Z' } })
  const sign = (b: string, k = KEY) => createHmac('sha512', k).update(b, 'utf8').digest('hex')

  it('accepts a correctly signed payload', () => {
    expect(paystackMtnProvider.verifyWebhook(body, { 'x-paystack-signature': sign(body) })).toBe(true)
  })

  it('rejects a payload signed with the wrong key', () => {
    expect(paystackMtnProvider.verifyWebhook(body, { 'x-paystack-signature': sign(body, 'sk_test_attacker') })).toBe(false)
  })

  it('rejects a tampered body under a valid signature', () => {
    const sig = sign(body)
    const tampered = body.replace('25000', '1')
    expect(paystackMtnProvider.verifyWebhook(tampered, { 'x-paystack-signature': sig })).toBe(false)
  })

  it('rejects a missing signature rather than throwing', () => {
    expect(paystackMtnProvider.verifyWebhook(body, {})).toBe(false)
  })

  it('rejects a short signature without throwing on the length mismatch', () => {
    expect(paystackMtnProvider.verifyWebhook(body, { 'x-paystack-signature': 'abc' })).toBe(false)
  })
})

describe('webhook parsing', () => {
  it('converts pesewas back to cedis exactly once', () => {
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'PAY-6', id: 7, amount: 25050, status: 'success', paid_at: '2026-09-11T10:00:00Z' } })
    const e = paystackMtnProvider.parseWebhook(raw)
    expect(e.amount).toBe(250.5)
    expect(e.reference).toBe('PAY-6')
    expect(e.status).toBe('completed')
  })

  it('does not treat a non-success event as completed', () => {
    const raw = JSON.stringify({ event: 'charge.failed', data: { reference: 'PAY-7', status: 'failed', amount: 100 } })
    expect(paystackMtnProvider.parseWebhook(raw).status).toBe('failed')
  })

  it('survives an event with no amount', () => {
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: 'PAY-8' } })
    const e = paystackMtnProvider.parseWebhook(raw)
    expect(e.amount).toBe(0)
    expect(e.status).toBe('completed')
  })
})

describe('status polling', () => {
  beforeEach(() => vi.stubEnv('PAYSTACK_SECRET_KEY', KEY))
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('reports pending when the provider is unreachable', async () => {
    // Reconciliation must never turn a live payment into a failed one because
    // the network blipped.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')))
    await expect(paystackMtnProvider.queryStatus('PAY-9')).resolves.toBe('pending')
  })

  it('reports the verified status when reachable', async () => {
    vi.stubGlobal('fetch', okFetch({ status: 'success' }))
    await expect(paystackMtnProvider.queryStatus('PAY-10')).resolves.toBe('completed')
  })
})
