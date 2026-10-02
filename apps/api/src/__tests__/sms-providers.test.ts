import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const twilioCreate = vi.hoisted(() => vi.fn())
vi.mock('twilio', () => ({ default: () => ({ messages: { create: twilioCreate } }) }))
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }))

async function load() {
  vi.resetModules()
  return import('../services/sms.js')
}

describe('SMS providers', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    twilioCreate.mockReset()
    for (const key of ['SMS_PROVIDER', 'ARKESEL_API_KEY', 'SMS_SENDER_ID', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER']) vi.stubEnv(key, '')
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('skips quietly when no provider is configured', async () => {
    const sms = await load()
    expect(sms.smsConfigured()).toBe(false)
    expect(await sms.sendSMS('0244123456', 'Hi')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends through Arkesel v2 with the api-key header and an international recipient', async () => {
    vi.stubEnv('ARKESEL_API_KEY', 'fixture-key')
    vi.stubEnv('SMS_SENDER_ID', 'RentOS')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'success', data: [] }), { status: 200 }))
    const sms = await load()
    expect(await sms.sendSMS('024 412 3456', 'New enquiry')).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://sms.arkesel.com/api/v2/sms/send')
    expect(init.headers['api-key']).toBe('fixture-key')
    expect(JSON.parse(init.body)).toEqual({ sender: 'RentOS', message: 'New enquiry', recipients: ['233244123456'] })
  })

  it('reports an Arkesel refusal as a failed send instead of throwing', async () => {
    vi.stubEnv('ARKESEL_API_KEY', 'fixture-key')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'error' }), { status: 403 }))
    const sms = await load()
    expect(await sms.sendSMS('0244123456', 'x')).toBe(false)
  })

  it('falls back to Twilio when only Twilio is configured', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC1'); vi.stubEnv('TWILIO_AUTH_TOKEN', 't'); vi.stubEnv('TWILIO_PHONE_NUMBER', '+15005550006')
    twilioCreate.mockResolvedValue({})
    const sms = await load()
    expect(await sms.sendSMS('0244123456', 'Hi')).toBe(true)
    expect(twilioCreate).toHaveBeenCalledWith({ body: 'Hi', from: '+15005550006', to: '+233244123456' })
  })
})
