/**
 * Where the platform tells the public to reach it.
 *
 * These were hard-coded in five places against two dead domains (rentos.gh and
 * rentos.com.gh) — a support address on the footer, a DPO address in the data
 * protection notice, a legal address in the terms. Legal notices with a
 * bouncing contact are not a cosmetic problem, so they live in one place now.
 *
 * Only the mailboxes that actually exist are used. There is no legal@ or
 * privacy@; those enquiries go to info@, which is monitored.
 */
export const PLATFORM_DOMAIN = 'userentos.com'
export const PLATFORM_URL = `https://${PLATFORM_DOMAIN}`

export const CONTACT_EMAIL = {
  /** Account help, product questions, platform operations. */
  support: `support@${PLATFORM_DOMAIN}`,
  /** General enquiries, and the fallback for legal, privacy and DPO notices. */
  info: `info@${PLATFORM_DOMAIN}`,
  /** Partnerships and press. */
  hello: `hello@${PLATFORM_DOMAIN}`,
  /** Sales and anything the other three do not cover. */
  contact: `contact@${PLATFORM_DOMAIN}`,
} as const
