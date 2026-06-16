import { Resend } from 'resend'

let resendInstance: Resend | null = null

function getResend(): Resend {
  if (resendInstance) return resendInstance
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    throw new Error('Missing required environment variable: RESEND_API_KEY')
  }
  resendInstance = new Resend(resendApiKey)
  return resendInstance
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev'
const FROM_NAME = 'RentOS Ghana'
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://rentos.gh'

interface EmailOptions {
  to: string
  subject: string
  text: string
  html?: string
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    await getResend().emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html || options.text,
    })
    console.log(`[Email] Sent to ${options.to}: ${options.subject}`)
    return true
  } catch (err) {
    const e = err as { message?: string }
    console.error(`[Email] Failed to send to ${options.to}:`, e.message)
    return false
  }
}

// Pre-built templates

export function sendWelcomeEmail(to: string, firstName: string) {
  return sendEmail({
    to,
    subject: 'Welcome to RentOS Ghana',
    text: `Hi ${firstName},\n\nWelcome to RentOS Ghana! Your account has been created successfully.\n\nYou can now:\n- Browse rental properties\n- Create digital agreements\n- Make rent payments\n- Start saving with RentGuard\n\nLog in at: ${PUBLIC_BASE_URL}/login\n\nBest regards,\nThe RentOS Team`,
    html: `<h2>Welcome to RentOS Ghana, ${firstName}!</h2><p>Your account has been created successfully.</p><p>You can now:</p><ul><li>Browse rental properties</li><li>Create digital agreements</li><li>Make rent payments</li><li>Start saving with RentGuard</li></ul><p><a href="${PUBLIC_BASE_URL}/login">Log in to your account</a></p>`,
  })
}

export function sendPasswordResetEmail(to: string, resetToken: string) {
  const resetUrl = `${PUBLIC_BASE_URL}/reset-password?token=${resetToken}`
  return sendEmail({
    to,
    subject: 'Reset Your RentOS Password',
    text: `You requested a password reset. Click this link to reset your password:\n\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, please ignore this email.`,
    html: `<h2>Reset Your Password</h2><p>You requested a password reset. Click the button below:</p><p><a href="${resetUrl}" style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Reset Password</a></p><p><small>This link expires in 1 hour. If you did not request this, please ignore this email.</small></p>`,
  })
}

export function sendPaymentConfirmation(to: string, amount: number, reference: string) {
  return sendEmail({
    to,
    subject: `Payment Confirmed - ${reference}`,
    text: `Your rent payment of GHS ${amount.toFixed(2)} has been confirmed.\n\nReference: ${reference}\n\nView your payment history at: ${PUBLIC_BASE_URL}/payments`,
    html: `<h2>Payment Confirmed</h2><p>Your rent payment of <strong>GHS ${amount.toFixed(2)}</strong> has been confirmed.</p><p>Reference: <code>${reference}</code></p><p><a href="${PUBLIC_BASE_URL}/payments">View Payment History</a></p>`,
  })
}

export function sendRentReminder(to: string, amount: number, dueDate: string, property: string) {
  return sendEmail({
    to,
    subject: `Rent Reminder - GHS ${amount.toFixed(2)} due ${dueDate}`,
    text: `This is a reminder that your rent payment of GHS ${amount.toFixed(2)} for ${property} is due on ${dueDate}.\n\nPay now at: ${PUBLIC_BASE_URL}/payments`,
    html: `<h2>Rent Reminder</h2><p>Your rent payment of <strong>GHS ${amount.toFixed(2)}</strong> for <strong>${property}</strong> is due on <strong>${dueDate}</strong>.</p><p><a href="${PUBLIC_BASE_URL}/payments" style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Pay Now</a></p>`,
  })
}

export function sendDisputeNotification(to: string, disputeTitle: string, status: string) {
  return sendEmail({
    to,
    subject: `Dispute Update - ${disputeTitle}`,
    text: `Your dispute "${disputeTitle}" has been updated to: ${status.replace('_', ' ')}.\n\nView details at: ${PUBLIC_BASE_URL}/disputes`,
    html: `<h2>Dispute Update</h2><p>Your dispute "<strong>${disputeTitle}</strong>" has been updated to: <strong>${status.replace('_', ' ')}</strong>.</p><p><a href="${PUBLIC_BASE_URL}/disputes">View Details</a></p>`,
  })
}
