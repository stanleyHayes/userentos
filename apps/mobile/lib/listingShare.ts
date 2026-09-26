export const PUBLIC_WEB_URL = 'https://userentos.com'

/** Statuses the public registry page (web /registry/:id) shows; others answer "not found". */
const PUBLIC_LISTING_STATUSES = new Set(['approved', 'published'])

/**
 * Share-sheet content for a listing, with a link to its public page when the
 * listing is publicly visible, so a recipient without the app can open it.
 * iOS takes the link as `url` (shared as a link, not repeated in the text);
 * Android ignores `url`, so the link goes in the message.
 */
export function listingShareContent(listing: {
  id: string
  title: string
  rent: string
  city: string
  listingStatus?: string
}, platform: string): { title: string; message: string; url?: string } {
  const message = `Check out "${listing.title}" on RentOS Ghana - ${listing.rent}/mo in ${listing.city}`
  const shareable = !!listing.listingStatus && PUBLIC_LISTING_STATUSES.has(listing.listingStatus) && /^[a-f0-9]{24}$/i.test(listing.id)
  if (!shareable) return { title: listing.title, message }
  const url = `${PUBLIC_WEB_URL}/registry/${listing.id}`
  return platform === 'ios' ? { title: listing.title, message, url } : { title: listing.title, message: `${message}\n${url}` }
}
