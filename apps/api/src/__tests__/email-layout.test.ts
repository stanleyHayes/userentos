/**
 * Every email uses one branded layout (services/emailLayout.ts). These pin the
 * parts that must not regress: escaping, the logo, a button that works in
 * every client (including Outlook's VML), the plain-text twin, and the footer
 * that says why the email arrived.
 */
import { describe, expect, it } from 'vitest'
import { renderEmail, formatCedis } from '../services/emailLayout.js'
import { welcomeEmail, passwordResetEmail, paymentConfirmationEmail, rentReminderEmail, disputeEmail, invitationEmail } from '../services/email.js'
import { notificationEmail, emailFooter } from '../services/notify.js'
import { unreadEmail } from '../services/messageAlerts.js'

describe('renderEmail', () => {
  const email = renderEmail({
    preheader: 'Preview <line>',
    heading: 'Hello <b>there</b>',
    paragraphs: ['A & B <script>alert(1)</script>', { html: '<strong>trusted</strong>' }],
    highlight: { label: 'Message', text: '<img src=x onerror=alert(1)>' },
    details: [{ label: 'Amount', value: formatCedis(2500) }],
    button: { label: 'Open', url: 'https://userentos.com/messages?conversationId=1&x="y"' },
    note: 'Small print',
    footer: emailFooter('account'),
  })

  it('escapes everything but explicitly trusted HTML', () => {
    expect(email.html).not.toContain('<script>')
    expect(email.html).not.toContain('<img src=x')
    expect(email.html).toContain('A &amp; B &lt;script&gt;')
    expect(email.html).toContain('Hello &lt;b&gt;there&lt;/b&gt;')
    expect(email.html).toContain('<strong>trusted</strong>')
    expect(email.html).toContain('conversationId=1&amp;x=&quot;y&quot;')
  })

  it('carries the brand: logo, wordmark, colours', () => {
    expect(email.html).toMatch(/<img src="[^"]+\/email\/rentos-mark\.png" width="44" height="44" alt="RentOS"/)
    expect(email.html).toContain('Rent<span style="color:#f59e0b">OS</span>')
    expect(email.html).toContain('#1e3a5f')
  })

  it('has a button for every client, plus the plain link', () => {
    expect(email.html).toContain('<v:roundrect')
    expect(email.html).toMatch(/<a href="https:\/\/userentos\.com\/messages[^"]*" target="_blank" rel="noopener" class="rentos-btn-link"/)
    expect(email.html).toContain('Button not working? Open this link')
  })

  it('has a plain-text twin with the link and the footer', () => {
    expect(email.text).toContain('Hello <b>there</b>')
    expect(email.text).toContain('Open: https://userentos.com/messages?conversationId=1&x="y"')
    expect(email.text).toContain('Amount: GH₵ 2,500.00')
    expect(email.text).toMatch(/Unsubscribe or manage notification preferences/)
  })

  it('keeps the unsubscribe link for optional email and the service note for required email', () => {
    expect(email.html).toMatch(/href="[^"]*\/settings\?tab=notifications"/)
    const receipt = renderEmail({ preheader: 'x', heading: 'x', paragraphs: [], footer: emailFooter('receipt') })
    expect(receipt.html).not.toContain('settings?tab=notifications')
    expect(receipt.text).toMatch(/required service message/)
  })

  it('formats cedis the Ghanaian way', () => {
    expect(formatCedis(2500)).toBe('GH₵ 2,500.00')
    expect(formatCedis(1234567.5)).toBe('GH₵ 1,234,567.50')
  })
})

describe('every template uses the layout', () => {
  const all = {
    welcome: welcomeEmail('Ama'),
    reset: passwordResetEmail('token'),
    payment: paymentConfirmationEmail(2500, 'RNT-1'),
    reminder: rentReminderEmail(2500, '1 November 2026', 'East Legon flat'),
    dispute: disputeEmail('Deposit', 'under_review'),
    invitation: invitationEmail('a@b.test', { inviteUrl: 'https://userentos.com/accept-invite?token=t', roles: ['government'], expiresAt: new Date('2026-10-09') }),
    notification: notificationEmail({ title: 'New lead', message: 'New enquiry from your website.', actionUrl: '/agent/leads?lead=1', category: 'account' }),
    unread: unreadEmail({ senderName: 'Kofi', unread: 1, preview: 'Hello', url: 'https://userentos.com/messages?conversationId=1' }),
  }
  it.each(Object.entries(all))('%s', (_name, email) => {
    expect(email.subject.length).toBeGreaterThan(3)
    expect(email.html).toContain('rentos-mark.png')
    expect(email.html).toContain('class="rentos-btn-link"')
    expect(email.text.length).toBeGreaterThan(20)
  })
  it('labels the notification button by where it leads', () => {
    expect(all.notification.html).toContain('View the enquiry')
    expect(all.unread.html).toContain('Reply on RentOS')
  })
})
