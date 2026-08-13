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

/** Escape user-controlled values before interpolating into email HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const ROLE_LABELS: Record<string, string> = {
  tenant: 'Tenant',
  landlord: 'Landlord',
  property_manager: 'Property Manager',
  government: 'Government Official',
  legal_officer: 'Legal Officer',
  admin: 'Administrator',
  super_admin: 'Super Administrator',
  financier: 'Financier',
  employer: 'Employer',
  service_provider: 'Service Provider',
  business: 'Local Business',
  developer: 'Property Developer',
  agent: 'Agent',
}

/** Human-readable role list for an invitation ("Government Official and Legal Officer"). */
export function describeRoles(roles: string[]): string {
  const labels = roles.map((r) => ROLE_LABELS[r] || r.replace(/_/g, ' '))
  if (labels.length <= 1) return labels[0] || 'RentOS user'
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

/**
 * Absolute URL for an in-app path. Built here because this module owns
 * PUBLIC_BASE_URL — set it in the environment or recipients get links to the
 * default production host.
 */
export function absoluteUrl(path: string): string {
  return `${PUBLIC_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/** Absolute link an invitee follows to claim their account. */
export function buildInviteUrl(rawToken: string): string {
  return absoluteUrl(`/accept-invite?token=${encodeURIComponent(rawToken)}`)
}

export function sendInvitationEmail(to: string, opts: {
  inviteUrl: string
  roles: string[]
  invitedByName?: string
  expiresAt: Date
}) {
  const roleText = describeRoles(opts.roles)
  const invitedBy = opts.invitedByName ? `${opts.invitedByName} has invited you` : 'You have been invited'
  const expires = opts.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return sendEmail({
    to,
    subject: `You have been invited to RentOS Ghana as ${roleText}`,
    text: `${invitedBy} to join RentOS Ghana as ${roleText}.\n\nAccept your invitation and set your password here:\n\n${opts.inviteUrl}\n\nThis invitation is for ${to} only and expires on ${expires}.\n\nIf you were not expecting this invitation, you can ignore this email — the link cannot be used until someone completes the form.\n\nThe RentOS Team`,
    html: `<h2>You have been invited to RentOS Ghana</h2>`
      + `<p>${escapeHtml(invitedBy)} to join <strong>RentOS Ghana</strong> as <strong>${escapeHtml(roleText)}</strong>.</p>`
      + `<p><a href="${opts.inviteUrl}" style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Accept Invitation</a></p>`
      + `<p><small>Or paste this link into your browser:<br>${escapeHtml(opts.inviteUrl)}</small></p>`
      + `<p><small>This invitation is for ${escapeHtml(to)} only and expires on ${escapeHtml(expires)}. If you were not expecting it, you can ignore this email.</small></p>`,
  })
}
