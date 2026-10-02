import twilio from 'twilio'
import { logger } from '../utils/logger.js'
import { internationalNumber } from './listings.js'

/**
 * Outbound SMS. Two providers:
 *  - Arkesel (Ghana; set ARKESEL_API_KEY and SMS_SENDER_ID, a registered
 *    sender name of at most 11 characters), the default when its key is set;
 *  - Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER).
 * SMS_PROVIDER picks one explicitly. With neither configured, sending is
 * skipped and logged rather than failing the request that triggered it.
 *
 * Arkesel v2: POST https://sms.arkesel.com/api/v2/sms/send, header `api-key`,
 * body { sender, message, recipients: ['233XXXXXXXXX'] }.
 */
type Provider = 'arkesel' | 'twilio'

const ARKESEL_URL = 'https://sms.arkesel.com/api/v2/sms/send'

function provider(): Provider | null {
  const chosen = process.env.SMS_PROVIDER?.trim().toLowerCase()
  if (chosen === 'arkesel') return process.env.ARKESEL_API_KEY ? 'arkesel' : null
  if (chosen === 'twilio') return twilioReady() ? 'twilio' : null
  if (process.env.ARKESEL_API_KEY) return 'arkesel'
  if (twilioReady()) return 'twilio'
  return null
}

function twilioReady(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER)
}

export function smsConfigured(): boolean {
  return provider() !== null
}

let twilioClient: ReturnType<typeof twilio> | null = null

async function sendViaTwilio(number: string, message: string): Promise<void> {
  twilioClient ??= twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  await twilioClient.messages.create({ body: message, from: process.env.TWILIO_PHONE_NUMBER!, to: `+${number}` })
}

async function sendViaArkesel(number: string, message: string): Promise<void> {
  const sender = (process.env.SMS_SENDER_ID || 'RentOS').slice(0, 11)
  const response = await fetch(ARKESEL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.ARKESEL_API_KEY! },
    body: JSON.stringify({ sender, message, recipients: [number] }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = await response.json().catch(() => null) as { status?: string } | null
  if (!response.ok || (body?.status && body.status !== 'success')) {
    throw new Error(`Arkesel answered ${response.status}${body?.status ? ` (${body.status})` : ''}`)
  }
}

/**
 * Sends one SMS; true when the provider accepted it. Never throws. The
 * recipient's number and the message are not logged.
 */
export async function sendSMS(to: string, message: string): Promise<boolean> {
  const chosen = provider()
  if (!chosen) {
    logger.info('[SMS] Skipped: no SMS provider is configured')
    return false
  }
  const number = internationalNumber(to)
  if (!number) {
    logger.warn('[SMS] Skipped: the recipient number is not usable')
    return false
  }
  try {
    if (chosen === 'arkesel') await sendViaArkesel(number, message)
    else await sendViaTwilio(number, message)
    return true
  } catch (err) {
    logger.warn(`[SMS] ${chosen} send failed: ${(err as Error).message}`)
    return false
  }
}

// Pre-built templates

export function sendOTP(to: string, code: string) {
  return sendSMS(to, `Your RentOS verification code is: ${code}. Valid for 10 minutes. Do not share this code.`)
}

export function sendPaymentSMS(to: string, amount: number, reference: string) {
  return sendSMS(to, `RentOS: Payment of GHS ${amount.toFixed(2)} confirmed. Ref: ${reference}. View details at userentos.com/payments`)
}

export function sendRentReminderSMS(to: string, amount: number, dueDate: string) {
  return sendSMS(to, `RentOS: Reminder - Your rent of GHS ${amount.toFixed(2)} is due on ${dueDate}. Pay now at userentos.com/payments`)
}

export function sendDisputeSMS(to: string, title: string, status: string) {
  return sendSMS(to, `RentOS: Your dispute "${title}" status updated to: ${status.replace('_', ' ')}. View at userentos.com/disputes`)
}
