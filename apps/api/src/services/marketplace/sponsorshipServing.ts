/**
 * Serving sponsored listings (spec §9).
 *
 * Campaigns were purchasable and moderated but never READ by a public surface,
 * so a paid sponsorship changed nothing a renter could see.
 *
 * Two rules the spec is explicit about, both enforced here rather than at the
 * call site:
 *
 *  - Sponsorship must never bypass moderation. A campaign only serves while its
 *    listing is still approved/published, so losing approval silently stops it
 *    without touching the billing record.
 *  - Sponsored items must be clearly labelled. Serving returns the sponsorship
 *    id alongside the property so the caller cannot render a boost without
 *    also having the flag to label it.
 *
 * A third rule keeps the store privacy answers true (App Store "Third-Party
 * Advertising" / Google Play "Advertising or marketing" both unticked, no
 * tracking): choosing and counting a sponsored item uses only the placement
 * and the filters on the request, never who is asking. Nothing here may take a
 * user id, device id, IP, session or profile — sponsorship-serving.test.ts pins
 * the signatures. Picking sponsored items from a profile, favourites, history
 * or location would change those answers and the privacy policy in the same
 * release.
 */
import { Sponsorship } from '../../models/Sponsorship.js'
import { Property } from '../../models/Property.js'
import { escapeRegex } from '../../utils/params.js'
import type { SponsoredPlacementName } from './sponsoredPlacements.js'

export { SPONSORED_PLACEMENTS, isSponsoredPlacement, type SponsoredPlacementName } from './sponsoredPlacements.js'

/** A property that is currently being served as sponsored. */
export interface SponsoredPlacement {
  propertyId: string
  sponsorshipId: string
  placement: string
}

// Same definition the public registry uses — one place, not two.
import { PUBLICLY_VISIBLE_STATUSES as SERVABLE_LISTING_STATUSES } from '../propertyReview.js'

/**
 * Active sponsorships for a placement, filtered down to listings that are
 * still publicly visible and, when the request has one, in the city it asked
 * for.
 *
 * The listing check is a second query rather than a join because the campaign
 * and the listing can fall out of step at any moment — a suspension does not
 * write to the campaign.
 *
 * Every active campaign is considered before anything is cut. The old query
 * took the oldest nine and only then applied the city, so with more campaigns
 * than that a newer paid campaign in the searched city never served. Active
 * campaigns are a small, paid set, so reading them all is cheap.
 *
 * Rotation is least-shown first: among campaigns that qualify, the one with
 * the fewest impressions serves, so every advertiser gets a turn rather than
 * the earliest buyer taking the slot for good.
 *
 * `onPage` narrows candidates to listings already in the organic results for
 * this request. A sponsored listing is only ever hoisted from the page, so a
 * campaign whose listing isn't on it can't serve; without this, the three
 * least-shown campaigns could be off-page on every request, never gain an
 * impression, and hold every slot for good.
 */
export async function getSponsoredPlacements(
  placement: SponsoredPlacementName,
  opts: { city?: string; limit?: number; onPage?: string[] } = {},
): Promise<SponsoredPlacement[]> {
  const now = new Date()
  const limit = Math.min(opts.limit ?? 3, 10)

  const campaigns = await Sponsorship.find({
    placement,
    status: 'active',
    startAt: { $lte: now },
    endAt: { $gte: now },
  }).select('_id propertyId placement').sort({ 'metrics.impressions': 1, createdAt: 1 }).lean()

  const page = opts.onPage ? new Set(opts.onPage) : null
  const candidates = page ? campaigns.filter((c) => page.has(c.propertyId)) : campaigns
  if (candidates.length === 0) return []

  const propertyIds = candidates.map((c) => c.propertyId)
  const filter: Record<string, unknown> = {
    _id: { $in: propertyIds },
    listingStatus: { $in: SERVABLE_LISTING_STATUSES },
    isActive: { $ne: false },
  }
  // The organic filter's semantics (propertyService.listProperties): a
  // case-insensitive substring. An exact match served nothing for "accra"
  // while the organic results showed every Accra listing.
  if (opts.city) filter['address.city'] = { $regex: escapeRegex(opts.city), $options: 'i' }

  const servable = await Property.find(filter).select('_id').lean()
  const servableIds = new Set(servable.map((p) => String(p._id)))

  return candidates
    .filter((c) => servableIds.has(c.propertyId))
    .slice(0, limit)
    .map((c) => ({
      propertyId: c.propertyId,
      sponsorshipId: String(c._id),
      placement: c.placement,
    }))
}

/**
 * Merge sponsored listings into a result set.
 *
 * Sponsored entries are hoisted to the front and tagged. A listing already in
 * the organic results is tagged in place rather than duplicated — showing the
 * same property twice reads as a bug, not as advertising.
 */
export function applySponsoredPlacements<T extends { id: string }>(
  organic: T[],
  placements: SponsoredPlacement[],
): (T & { sponsored?: boolean; sponsorshipId?: string })[] {
  if (placements.length === 0) return organic

  const byProperty = new Map(placements.map((p) => [p.propertyId, p]))
  const promoted: (T & { sponsored?: boolean; sponsorshipId?: string })[] = []
  const rest: T[] = []

  for (const item of organic) {
    const placement = byProperty.get(item.id)
    if (placement) {
      promoted.push({ ...item, sponsored: true, sponsorshipId: placement.sponsorshipId })
    } else {
      rest.push(item)
    }
  }

  return [...promoted, ...rest]
}

/**
 * Count an impression. Best-effort: never block a page render on metrics.
 *
 * One aggregate counter per campaign and nothing else — no per-view row, no
 * viewer. That is what lets advertisers see delivery without Apple or Google
 * counting it as advertising data linked to a person. There is deliberately no
 * click counter: nothing called one, and a public endpoint that anyone can hit
 * to bump a campaign's clicks is not a number worth reporting.
 */
export function recordImpressions(sponsorshipIds: string[]): void {
  if (sponsorshipIds.length === 0) return
  Sponsorship.updateMany(
    { _id: { $in: sponsorshipIds } },
    { $inc: { 'metrics.impressions': 1 } },
  ).catch(() => undefined)
}

/**
 * Expire campaigns whose window has closed.
 *
 * Status moves to 'expired' rather than being deleted so spend history and the
 * billing record survive, which §9 requires.
 */
export async function expireFinishedCampaigns(): Promise<number> {
  const result = await Sponsorship.updateMany(
    { status: 'active', endAt: { $lt: new Date() } },
    { $set: { status: 'expired' } },
  )
  return result.modifiedCount ?? 0
}
