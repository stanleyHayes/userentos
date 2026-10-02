export const PUBLIC_WEB_URL = 'https://userentos.com'

/** Statuses the public property page shows; others answer "not found". */
const PUBLIC_LISTING_STATUSES = new Set(['approved', 'published'])

/**
 * Share-sheet content for a listing, with a link to its public page when the
 * listing is publicly visible, so a recipient without the app can open it.
 * The page is /property/<ref> (the short reference every listing gets); a
 * listing not yet given one falls back to /registry/<id>, which redirects.
 * iOS takes the link as `url` (shared as a link, not repeated in the text);
 * Android ignores `url`, so the link goes in the message.
 */
export function listingShareContent(listing: {
  id: string
  ref?: string
  title: string
  /** Price with what it is for, e.g. "GHS 2,500/month" or "GHS 850,000". */
  price: string
  city: string
  listingStatus?: string
}, platform: string): { title: string; message: string; url?: string } {
  const message = `Check out "${listing.title}" on RentOS Ghana - ${listing.price} in ${listing.city}`
  const hasRef = !!listing.ref && /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$/i.test(listing.ref)
  const shareable = !!listing.listingStatus && PUBLIC_LISTING_STATUSES.has(listing.listingStatus) && (hasRef || /^[a-f0-9]{24}$/i.test(listing.id))
  if (!shareable) return { title: listing.title, message }
  const url = hasRef ? `${PUBLIC_WEB_URL}/property/${listing.ref!.toLowerCase()}` : `${PUBLIC_WEB_URL}/registry/${listing.id}`
  return platform === 'ios' ? { title: listing.title, message, url } : { title: listing.title, message: `${message}\n${url}` }
}
