import mongoose from 'mongoose'
import { Storefront } from '../models/Storefront.js'
import { User } from '../models/User.js'
import { internationalNumber } from './listings.js'
import { storefrontUrl } from './storefront.js'
import { isEnabled } from './featureFlags.js'
import { logger } from '../utils/logger.js'

/**
 * Direct WhatsApp enquiries (brief §05) hand the enquirer the agent's own
 * number, which lets the deal leave RentOS. Off unless an admin creates and
 * enables this feature flag; enquiries otherwise go through RentOS messages,
 * with an SMS alert to the agent. "Share on WhatsApp" (sharing the listing
 * link) is unaffected.
 */
export const DIRECT_WHATSAPP_FLAG = 'listings.direct_whatsapp'

export async function directWhatsAppEnabled(): Promise<boolean> {
  // No database, no flag: off (and no request left waiting on a connection).
  if (mongoose.connection.readyState !== 1) return false
  try {
    return await isEnabled(DIRECT_WHATSAPP_FLAG, {})
  } catch (err) {
    logger.warn(`[listingContact] feature flag lookup failed: ${(err as Error).message}`)
    return false
  }
}

const PROFESSIONAL_LABELS: Record<string, string> = { agent: 'Agent', agency: 'Agency', property_manager: 'Property manager' }

/** Who a public listing page shows as its contact, without their phone number. */
export interface ListingAgent {
  name: string
  /** Agent, Agency, Property manager or Landlord. */
  type: string
  logoUrl: string | null
  /** Their RentOS website, when they have one. */
  websiteUrl: string | null
  storefrontSlug: string | null
  /** A person checked their Ghana Card (not merely isVerified, see publicRegistry). */
  identityVerified: boolean
  /** Whether the WhatsApp button can open a chat with them (only when direct WhatsApp is switched on). */
  whatsapp: boolean
}

/**
 * The contact behind a listing — the agent who receives its enquiries — and
 * the WhatsApp number to send people to. The number comes from the business
 * contact on their website first; a professional account's own phone is the
 * fallback, since that is the number they run their business on. A landlord's
 * personal phone is never used unless they put it on their website.
 */
export async function listingContact(agentId: string): Promise<{ agent: ListingAgent; whatsappNumber: string | null } | null> {
  const [user, storefront, direct] = await Promise.all([
    User.findById(agentId).select('firstName lastName verificationStatus professionalType roles profileImage phone').lean(),
    Storefront.findOne({ ownerId: agentId, status: 'active' }).lean(),
    directWhatsAppEnabled(),
  ])
  if (!user) return null
  const professional = user.roles.includes('property_manager')
  const whatsappNumber = !direct ? null
    : internationalNumber(storefront?.contact?.whatsapp)
      ?? internationalNumber(storefront?.contact?.phone)
      ?? (professional ? internationalNumber(user.phone) : null)
  return {
    whatsappNumber,
    agent: {
      name: storefront?.name ?? `${user.firstName} ${user.lastName}`.trim(),
      type: professional ? (PROFESSIONAL_LABELS[user.professionalType ?? ''] ?? 'Agent') : user.roles.includes('landlord') ? 'Landlord' : 'Owner',
      logoUrl: storefront?.branding?.logoUrl ?? user.profileImage ?? null,
      websiteUrl: storefront ? storefrontUrl(storefront) : null,
      storefrontSlug: storefront?.slug ?? null,
      identityVerified: user.verificationStatus === 'verified',
      whatsapp: Boolean(whatsappNumber),
    },
  }
}
