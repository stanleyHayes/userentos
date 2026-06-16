import twilio from 'twilio'

let client: ReturnType<typeof twilio> | null = null

function getClient(): ReturnType<typeof twilio> {
  if (client) return client
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    throw new Error('Missing required Twilio environment variables: TWILIO_ACCOUNT_SID and/or TWILIO_AUTH_TOKEN')
  }
  client = twilio(accountSid, authToken)
  return client
}

const fromNumber = process.env.TWILIO_PHONE_NUMBER || '+1234567890'

export async function sendSMS(to: string, message: string): Promise<boolean> {
  try {
    // Ensure Ghana country code
    const phone = to.startsWith('+') ? to : `+233${to.replace(/^0/, '')}`

    await getClient().messages.create({
      body: message,
      from: fromNumber,
      to: phone,
    })
    console.log(`[SMS] Sent to ${phone}`)
    return true
  } catch (err) {
    const e = err as { message?: string }
    console.error(`[SMS] Failed to send to ${to}:`, e.message)
    return false
  }
}

// Pre-built templates

export function sendOTP(to: string, code: string) {
  return sendSMS(to, `Your RentOS verification code is: ${code}. Valid for 10 minutes. Do not share this code.`)
}

export function sendPaymentSMS(to: string, amount: number, reference: string) {
  return sendSMS(to, `RentOS: Payment of GHS ${amount.toFixed(2)} confirmed. Ref: ${reference}. View details at rentos.gh/payments`)
}

export function sendRentReminderSMS(to: string, amount: number, dueDate: string) {
  return sendSMS(to, `RentOS: Reminder - Your rent of GHS ${amount.toFixed(2)} is due on ${dueDate}. Pay now at rentos.gh/payments`)
}

export function sendDisputeSMS(to: string, title: string, status: string) {
  return sendSMS(to, `RentOS: Your dispute "${title}" status updated to: ${status.replace('_', ' ')}. View at rentos.gh/disputes`)
}
