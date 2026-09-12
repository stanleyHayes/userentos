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
 */
import { Sponsorship } from '../../models/Sponsorship.js'
import { Property } from '../../models/Property.js'

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
 * still publicly visible.
 *
 * The listing check is a second query rather than a join because the campaign
 * and the listing can fall out of step at any moment — a suspension does not
 * write to the campaign.
 */
export async function getSponsoredPlacements(
  placement: string,
  opts: { city?: string; limit?: number } = {},
): Promise<SponsoredPlacement[]> {
  const now = new Date()
  const limit = Math.min(opts.limit ?? 3, 10)

  const campaigns = await Sponsorship.find({
    placement,
    status: 'active',
    startAt: { $lte: now },
    endAt: { $gte: now },
  }).sort({ createdAt: 1 }).limit(limit * 3).lean()

  if (campaigns.length === 0) return []

  const propertyIds = campaigns.map((c) => c.propertyId)
  const filter: Record<string, unknown> = {
    _id: { $in: propertyIds },
    listingStatus: { $in: SERVABLE_LISTING_STATUSES },
    isActive: { $ne: false },
  }
  if (opts.city) filter['address.city'] = opts.city

  const servable = await Property.find(filter).select('_id').lean()
  const servableIds = new Set(servable.map((p) => String(p._id)))

  return campaigns
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

/** Count an impression. Best-effort: never block a page render on metrics. */
export function recordImpressions(sponsorshipIds: string[]): void {
  if (sponsorshipIds.length === 0) return
  Sponsorship.updateMany(
    { _id: { $in: sponsorshipIds } },
    { $inc: { 'metrics.impressions': 1 } },
  ).catch(() => undefined)
}

export function recordClick(sponsorshipId: string): void {
  Sponsorship.updateOne({ _id: sponsorshipId }, { $inc: { 'metrics.clicks': 1 } }).catch(() => undefined)
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
