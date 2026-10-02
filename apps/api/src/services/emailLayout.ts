/**
 * The RentOS email layout. Every email the API sends is rendered here, so they
 * all look like one product: the navy header with the RentOS mark and
 * wordmark, a white card, an amber accent rule, a navy button that renders in
 * every client, the plain link beneath it for clients that block buttons, and
 * a footer that says why the email arrived.
 *
 * Email-client rules this follows: tables for layout and inline styles (Gmail
 * drops <style> in some views), no SVG (Gmail strips it, so the mark is a
 * hosted PNG with the wordmark as live text beside it), a VML button for
 * desktop Outlook, a 600px column that shrinks on phones, system fonts, and
 * explicit colours so dark-mode inversion cannot make text disappear.
 */
import { absoluteUrl } from './email.js'

export const BRAND = {
  navy: '#1e3a5f',
  navyDark: '#0f1f33',
  navyLight: '#2d5a8e',
  amber: '#f59e0b',
  amberLight: '#fbbf24',
  green: '#10b981',
  ink: '#0f172a',
  text: '#334155',
  muted: '#64748b',
  line: '#e2e8f0',
  canvas: '#eef2f6',
  card: '#ffffff',
  tint: '#f6f8fb',
} as const

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/** GH₵ 2,500.00 */
export function formatCedis(amount: number): string {
  return `GH₵ ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Already-safe HTML (built by the caller from escaped parts). */
export interface RawHtml { html: string }
type Inline = string | RawHtml

const toHtml = (part: Inline) => (typeof part === 'string' ? escapeHtml(part) : part.html)
const toText = (part: Inline) => (typeof part === 'string' ? part : part.html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))

export interface EmailContent {
  /** The line inboxes show after the subject. */
  preheader: string
  heading: string
  /** Plain strings are escaped; { html } is trusted as already safe. */
  paragraphs: Inline[]
  /** A quoted message or a call-out, with an optional label above it. */
  highlight?: { text: string; label?: string }
  /** Label and value rows: amount, reference, property, date. */
  details?: Array<{ label: string; value: string }>
  button?: { label: string; url: string }
  /** Small print under the button. */
  note?: Inline
  /** Why the email arrived and how to change it (notify.ts emailFooter). */
  footer?: { text: string; html: string }
}

function buttonHtml(label: string, url: string): string {
  const href = escapeHtml(url)
  const text = escapeHtml(label)
  const width = Math.min(360, Math.max(200, label.length * 11 + 64))
  return `<table role="presentation" class="rentos-btn" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 10px">
  <tr><td align="center" bgcolor="${BRAND.navy}" style="border-radius:10px;background:${BRAND.navy}">
    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:${width}px" arcsize="20%" stroke="f" fillcolor="${BRAND.navy}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold">${text}</center></v:roundrect><![endif]-->
    <!--[if !mso]><!--><a href="${href}" target="_blank" rel="noopener" class="rentos-btn-link" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:10px;background:${BRAND.navy};border:1px solid ${BRAND.navyDark}">${text}&nbsp;&rarr;</a><!--<![endif]-->
  </td></tr>
</table>`
}

/** Render one email: both the HTML and the plain-text part. */
export function renderEmail(content: EmailContent): { html: string; text: string } {
  const logo = escapeHtml(absoluteUrl('/email/rentos-mark.png'))
  const home = escapeHtml(absoluteUrl('/'))
  const paragraphs = content.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:26px;color:${BRAND.text}">${toHtml(p)}</p>`)
    .join('\n')

  const highlight = content.highlight
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 8px"><tr>
        <td style="border:1px solid ${BRAND.line};background:${BRAND.tint};border-radius:12px;padding:16px 18px">
          ${content.highlight.label ? `<div style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted};margin:0 0 6px">${escapeHtml(content.highlight.label)}</div>` : ''}
          <div style="font-family:${FONT};font-size:16px;line-height:25px;color:${BRAND.ink}">${escapeHtml(content.highlight.text)}</div>
        </td></tr></table>`
    : ''

  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 8px;border:1px solid ${BRAND.line};border-radius:10px;border-collapse:separate">
        ${content.details.map((row, i) => `<tr>
          <td style="padding:12px 16px;font-family:${FONT};font-size:14px;color:${BRAND.muted};${i ? `border-top:1px solid ${BRAND.line};` : ''}width:40%">${escapeHtml(row.label)}</td>
          <td style="padding:12px 16px;font-family:${FONT};font-size:15px;font-weight:600;color:${BRAND.ink};${i ? `border-top:1px solid ${BRAND.line};` : ''}text-align:right">${escapeHtml(row.value)}</td>
        </tr>`).join('')}
      </table>`
    : ''

  const button = content.button
    ? `${buttonHtml(content.button.label, content.button.url)}
       <p style="margin:0 0 4px;font-family:${FONT};font-size:13px;line-height:20px;color:${BRAND.muted}">Button not working? Open this link:<br><a href="${escapeHtml(content.button.url)}" target="_blank" rel="noopener" style="color:${BRAND.navyLight};text-decoration:underline;word-break:break-all">${escapeHtml(content.button.url)}</a></p>`
    : ''

  const note = content.note
    ? `<p style="margin:20px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${BRAND.muted}">${toHtml(content.note)}</p>`
    : ''

  const footer = content.footer
    ? content.footer.html.replace(/<hr>/g, '').replace(/<p style="color:#6b7280;font-size:12px">/g, `<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;line-height:18px;color:${BRAND.muted}">`).replace(/<a href=/g, `<a style="color:${BRAND.navyLight};text-decoration:underline" href=`)
    : ''

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.heading)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  @media only screen and (max-width: 620px) {
    .rentos-card { padding: 28px 22px !important; }
    .rentos-outer { padding: 12px 8px !important; }
    .rentos-heading { font-size: 22px !important; line-height: 30px !important; }
    .rentos-btn { width: 100% !important; }
    .rentos-btn-link { display: block !important; text-align: center !important; }
  }
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(content.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.canvas}">
<tr><td align="center" class="rentos-outer" style="padding:28px 16px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px">
    <tr><td style="background:${BRAND.navy};background-image:linear-gradient(135deg,${BRAND.navyDark} 0%,${BRAND.navy} 55%,${BRAND.navyLight} 100%);border-radius:16px 16px 0 0;padding:22px 32px">
      <a href="${home}" target="_blank" rel="noopener" style="text-decoration:none">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
        <td style="vertical-align:middle"><img src="${logo}" width="44" height="44" alt="RentOS" style="display:block;border:0;outline:none;border-radius:11px"></td>
        <td style="vertical-align:middle;padding-left:12px">
          <div style="font-family:${FONT};font-size:24px;line-height:26px;font-weight:800;letter-spacing:-0.4px;color:#ffffff">Rent<span style="color:${BRAND.amber}">OS</span></div>
          <div style="font-family:${FONT};font-size:10px;line-height:14px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#a9b8cc">Ghana</div>
        </td>
      </tr></table>
      </a>
    </td></tr>
    <tr><td style="height:4px;line-height:4px;font-size:0;background:${BRAND.amber};background-image:linear-gradient(90deg,${BRAND.amberLight} 0%,${BRAND.amber} 65%,${BRAND.green} 100%)">&nbsp;</td></tr>
    <tr><td class="rentos-card" style="background:${BRAND.card};padding:36px 40px;border-radius:0 0 16px 16px;box-shadow:0 10px 30px rgba(15,31,51,0.08)">
      <h1 class="rentos-heading" style="margin:0 0 18px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:800;letter-spacing:-0.3px;color:${BRAND.navyDark}">${escapeHtml(content.heading)}</h1>
      ${paragraphs}
      ${highlight}
      ${details}
      ${button}
      ${note}
    </td></tr>
    <tr><td style="padding:24px 28px 8px;text-align:center">
      <p style="margin:0 0 10px;font-family:${FONT};font-size:13px;line-height:20px;color:${BRAND.text}"><strong style="color:${BRAND.navy}">Keep it on RentOS.</strong> Chat, view and pay through RentOS so you stay protected.</p>
      ${footer}
      <p style="margin:12px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${BRAND.muted}">RentOS Ghana · <a href="${escapeHtml(absoluteUrl('/help'))}" target="_blank" rel="noopener" style="color:${BRAND.navyLight};text-decoration:underline">Help</a> · <a href="${escapeHtml(absoluteUrl('/privacy'))}" target="_blank" rel="noopener" style="color:${BRAND.navyLight};text-decoration:underline">Privacy</a> · <a href="${escapeHtml(absoluteUrl('/terms'))}" target="_blank" rel="noopener" style="color:${BRAND.navyLight};text-decoration:underline">Terms</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`

  const lines: string[] = [content.heading, '']
  for (const p of content.paragraphs) lines.push(toText(p), '')
  if (content.highlight) lines.push(`${content.highlight.label ? `${content.highlight.label}: ` : ''}"${content.highlight.text}"`, '')
  for (const row of content.details ?? []) lines.push(`${row.label}: ${row.value}`)
  if (content.details?.length) lines.push('')
  if (content.button) lines.push(`${content.button.label}: ${content.button.url}`, '')
  if (content.note) lines.push(toText(content.note), '')
  lines.push('Keep it on RentOS. Chat, view and pay through RentOS so you stay protected.')
  const text = `${lines.join('\n')}${content.footer?.text ?? ''}\n\nRentOS Ghana · ${absoluteUrl('/help')}`
  return { html, text }
}
