import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
 * notify() used to ignore Settings → Notifications entirely: every
 * notification went out by email and push whatever the user had switched off.
 * These pin the mapping from category to toggles, the exempt categories, and
 * the manage-preferences link in optional emails.
 */

const create = vi.fn()
vi.mock('../models/Notification.js', () => ({ Notification: { create } }))

let storedUser: unknown = null
let lookupFails = false
const findById = vi.fn(() => ({
  select: () => ({ lean: () => (lookupFails ? Promise.reject(new Error('db down')) : Promise.resolve(storedUser)) }),
}))
vi.mock('../models/User.js', () => ({ User: { findById } }))

vi.mock('../services/socket.js', () => ({ getIO: () => { throw new Error('socket not initialised') } }))
const sendEmail = vi.fn().mockResolvedValue(true)
vi.mock('../services/email.js', () => ({
  sendEmail,
  absoluteUrl: (path: string) => `https://app.rentos.test${path}`,
}))
const sendPushNotification = vi.fn().mockResolvedValue(true)
vi.mock('../services/push.js', () => ({ sendPushNotification }))
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { notify, deliveryPlan, notifyRentReminder, notifyPaymentConfirmed } = await import('../services/notify.js')

function withPrefs(notifications: Record<string, boolean> | undefined) {
  storedUser = { email: 'ama@example.com', settings: notifications ? { notifications } : undefined }
}

const base = { userId: 'u1', title: 'Hello', message: 'World', actionUrl: '/payments' }

beforeEach(() => {
  vi.clearAllMocks()
  lookupFails = false
  create.mockResolvedValue({ _id: { toString: () => 'n1' } })
  withPrefs({ email: true, sms: true, push: true, payment: true, savings: true })
})

describe('notify honours notification preferences', () => {
  it('sends in-app, email and push when everything is on (and for users who never saved settings)', async () => {
    await notify(base)
    expect(create).toHaveBeenCalledOnce()
    expect(sendEmail).toHaveBeenCalledOnce()
    expect(sendPushNotification).toHaveBeenCalledOnce()

    vi.clearAllMocks()
    withPrefs(undefined)
    await notify(base)
    expect(sendEmail).toHaveBeenCalledOnce()
    expect(sendPushNotification).toHaveBeenCalledOnce()
  })

  it('skips email when the email toggle is off', async () => {
    withPrefs({ email: false, push: true })
    await expect(notify(base)).resolves.toBe(true)
    expect(create).toHaveBeenCalledOnce()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendPushNotification).toHaveBeenCalledOnce()
  })

  it('skips push when the push toggle is off', async () => {
    withPrefs({ email: true, push: false })
    await notify(base)
    expect(sendEmail).toHaveBeenCalledOnce()
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('suppresses payment reminders entirely when "Payment Reminders" is off', async () => {
    withPrefs({ email: true, push: true, payment: false })
    await expect(notify({ ...base, category: 'payment' })).resolves.toBe(true)
    expect(create).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('suppresses savings alerts entirely when "Savings Alerts" is off', async () => {
    withPrefs({ email: true, push: true, savings: false })
    await notify({ ...base, category: 'savings' })
    expect(create).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('a category toggle does not affect other categories', async () => {
    withPrefs({ payment: false, savings: false })
    await notify(base)
    expect(create).toHaveBeenCalledOnce()
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it.each(['security', 'receipt'] as const)('always delivers exempt %s notices, whatever the toggles', async (category) => {
    withPrefs({ email: false, sms: false, push: false, payment: false, savings: false })
    await notify({ ...base, category })
    expect(create).toHaveBeenCalledOnce()
    expect(sendEmail).toHaveBeenCalledOnce()
    expect(sendPushNotification).toHaveBeenCalledOnce()
  })

  it('does not guess when preferences cannot be read: in-app only', async () => {
    lookupFails = true
    await expect(notify(base)).resolves.toBe(true)
    expect(create).toHaveBeenCalledOnce()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendPushNotification).not.toHaveBeenCalled()
  })

  it('still honours skipEmail / skipPush', async () => {
    await notify({ ...base, skipEmail: true, skipPush: true })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(sendPushNotification).not.toHaveBeenCalled()
  })
})

describe('notification emails', () => {
  it('optional emails carry an unsubscribe / manage-preferences link to the settings page', async () => {
    await notify(base)
    const mail = sendEmail.mock.calls[0][0] as { html: string; text: string }
    expect(mail.html).toContain('href="https://app.rentos.test/settings?tab=notifications"')
    expect(mail.html).toMatch(/Unsubscribe or manage notification preferences/)
    expect(mail.text).toContain('https://app.rentos.test/settings?tab=notifications')
  })

  it('exempt emails explain why they arrive instead of offering an unsubscribe', async () => {
    await notify({ ...base, category: 'receipt' })
    const mail = sendEmail.mock.calls[0][0] as { html: string; text: string }
    expect(mail.html).not.toContain('settings?tab=notifications')
    expect(mail.text).toMatch(/required service message/)
  })
})

describe('built-in helpers are categorised', () => {
  it('rent reminders follow the payment toggle; payment confirmations are receipts', async () => {
    withPrefs({ email: true, push: true, payment: false })
    await notifyRentReminder('u1', 1200, 3, 'East Legon flat')
    expect(create).not.toHaveBeenCalled()

    withPrefs({ email: false, push: false, payment: false })
    await notifyPaymentConfirmed('u1', 1200, 'REF-1')
    expect(create).toHaveBeenCalledOnce()
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('scheduler reminders carry their category (payment reminders, savings goal alerts)', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../services/scheduler.ts', import.meta.url), 'utf8')
    expect(src).toContain("notify({ userId: payment.tenantId, title, message, actionUrl: '/payments', category: 'payment' })")
    // The auto-debit job lives in its own service now.
    const autoDebit = readFileSync(new URL('../services/payments/savingsAutoDebit.ts', import.meta.url), 'utf8')
    const at = autoDebit.indexOf("title: 'Savings Goal Reached!'")
    expect(at).toBeGreaterThan(-1)
    expect(autoDebit.slice(at, at + 300)).toContain("category: 'savings'")
  })

  it('deliveryPlan maps channels exactly', () => {
    expect(deliveryPlan('account', { sms: false })).toEqual({ inApp: true, email: true, push: true, sms: false })
    expect(deliveryPlan('payment', { payment: false })).toEqual({ inApp: false, email: false, push: false, sms: false })
    expect(deliveryPlan('security', null)).toEqual({ inApp: true, email: true, push: true, sms: true })
    expect(deliveryPlan('savings', null)).toEqual({ inApp: true, email: false, push: false, sms: false })
  })
})

describe('promotional notifications', () => {
  it('stay in-app whatever the channel preferences', () => {
    expect(deliveryPlan('promotion', { email: true, push: true, sms: true })).toEqual({ inApp: true, email: false, push: false, sms: false })
    expect(deliveryPlan('promotion', null)).toEqual({ inApp: true, email: false, push: false, sms: false })
  })
})
