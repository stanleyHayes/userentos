import { Resend } from 'resend'
import { renderEmail, BRAND, formatCedis } from './emailLayout.js'
import { CREDENTIAL_LIFETIMES } from '../types/index.js'

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
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://userentos.com'

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

// Pre-built templates — all rendered with the RentOS layout (emailLayout.ts).
// Each has a builder (subject, html, text; tested and previewed) and a sender.

export interface BuiltEmail { subject: string; html: string; text: string }

export function welcomeEmail(firstName: string): BuiltEmail {
  const email = renderEmail({
    preheader: 'Your RentOS account is ready. Find a home, message agents and keep everything in one safe place.',
    heading: `Welcome to RentOS, ${firstName}`,
    paragraphs: [
      'Your account is ready. Here is what you can do on RentOS:',
      { html: `<strong style="color:${BRAND.navy}">Find a home</strong> to rent or buy across Ghana, with verified listings and clear prices.<br><strong style="color:${BRAND.navy}">Message agents and landlords</strong> safely on RentOS, and book viewings.<br><strong style="color:${BRAND.navy}">Keep your tenancy in one place</strong>: agreements, receipts and your rental profile.` },
    ],
    button: { label: 'Open RentOS', url: absoluteUrl('/login') },
  })
  return { subject: 'Welcome to RentOS Ghana', ...email }
}

export function sendWelcomeEmail(to: string, firstName: string) {
  return sendEmail({ to, ...welcomeEmail(firstName) })
}

export function passwordResetEmail(resetToken: string): BuiltEmail {
  const resetUrl = absoluteUrl(`/reset-password?token=${encodeURIComponent(resetToken)}`)
  const minutes = CREDENTIAL_LIFETIMES.passwordResetMinutes
  const email = renderEmail({
    preheader: `Reset your RentOS password. The link works for ${minutes} minutes.`,
    heading: 'Reset your password',
    paragraphs: ['Someone asked to reset the password for your RentOS account. If it was you, choose a new password with the button below.'],
    button: { label: 'Choose a new password', url: resetUrl },
    note: `This link works once and expires in ${minutes} minutes. If you did not ask for it, ignore this email: your password stays the same.`,
    footer: emailFooterExempt(),
  })
  return { subject: 'Reset your RentOS password', ...email }
}

export function sendPasswordResetEmail(to: string, resetToken: string) {
  return sendEmail({ to, ...passwordResetEmail(resetToken) })
}

export function paymentConfirmationEmail(amount: number, reference: string): BuiltEmail {
  const email = renderEmail({
    preheader: `${formatCedis(amount)} received. Reference ${reference}.`,
    heading: 'Payment confirmed',
    paragraphs: ['Your rent payment has been confirmed. Keep this email as your receipt; it is also saved in your payment history.'],
    details: [{ label: 'Amount', value: formatCedis(amount) }, { label: 'Reference', value: reference }],
    button: { label: 'View payment history', url: absoluteUrl('/payments') },
    footer: emailFooterExempt(),
  })
  return { subject: `Payment confirmed - ${reference}`, ...email }
}

export function sendPaymentConfirmation(to: string, amount: number, reference: string) {
  return sendEmail({ to, ...paymentConfirmationEmail(amount, reference) })
}

export function rentReminderEmail(amount: number, dueDate: string, property: string): BuiltEmail {
  const email = renderEmail({
    preheader: `${formatCedis(amount)} for ${property} is due on ${dueDate}.`,
    heading: 'Rent reminder',
    paragraphs: ['A friendly reminder that your next rent payment is coming up.'],
    details: [{ label: 'Property', value: property }, { label: 'Amount', value: formatCedis(amount) }, { label: 'Due', value: dueDate }],
    button: { label: 'Pay on RentOS', url: absoluteUrl('/payments') },
  })
  return { subject: `Rent reminder - ${formatCedis(amount)} due ${dueDate}`, ...email }
}

export function sendRentReminder(to: string, amount: number, dueDate: string, property: string) {
  return sendEmail({ to, ...rentReminderEmail(amount, dueDate, property) })
}

export function disputeEmail(disputeTitle: string, status: string): BuiltEmail {
  const readable = status.replace(/_/g, ' ')
  const email = renderEmail({
    preheader: `Your dispute "${disputeTitle}" is now ${readable}.`,
    heading: 'Dispute update',
    paragraphs: [`There is an update on your dispute "${disputeTitle}".`],
    details: [{ label: 'Status', value: readable }],
    button: { label: 'View the dispute', url: absoluteUrl('/disputes') },
  })
  return { subject: `Dispute update - ${disputeTitle}`, ...email }
}

export function sendDisputeNotification(to: string, disputeTitle: string, status: string) {
  return sendEmail({ to, ...disputeEmail(disputeTitle, status) })
}

/** Footer for emails sent whatever the notification settings say. */
function emailFooterExempt(): { text: string; html: string } {
  const note = 'This is a required service message about your RentOS account or a payment. It is sent even if optional notifications are turned off.'
  return { text: `\n\n--\n${note}`, html: `<p style="color:#6b7280;font-size:12px">${note}</p>` }
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

export function invitationEmail(to: string, opts: {
  inviteUrl: string
  roles: string[]
  invitedByName?: string
  expiresAt: Date
}): BuiltEmail {
  const roleText = describeRoles(opts.roles)
  const invitedBy = opts.invitedByName ? `${opts.invitedByName} has invited you` : 'You have been invited'
  const expires = opts.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const email = renderEmail({
    preheader: `${invitedBy} to join RentOS Ghana as ${roleText}.`,
    heading: 'You have been invited to RentOS',
    paragraphs: [{ html: `${escapeHtml(invitedBy)} to join <strong style="color:${BRAND.navy}">RentOS Ghana</strong> as <strong style="color:${BRAND.navy}">${escapeHtml(roleText)}</strong>. Accept the invitation to set your password and sign in.` }],
    button: { label: 'Accept invitation', url: opts.inviteUrl },
    note: `This invitation is for ${to} only and expires on ${expires}. If you were not expecting it, you can ignore this email: the link does nothing until someone completes the form.`,
  })
  return { subject: `You have been invited to RentOS Ghana as ${roleText}`, ...email }
}

export function sendInvitationEmail(to: string, opts: {
  inviteUrl: string
  roles: string[]
  invitedByName?: string
  expiresAt: Date
}) {
  return sendEmail({ to, ...invitationEmail(to, opts) })
}
