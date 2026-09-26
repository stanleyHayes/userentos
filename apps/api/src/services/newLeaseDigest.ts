/**
 * Weekly "new leases in your city" note for approved local businesses.
 *
 * This replaces a notice sent the moment each lease went live ("A tenant just
 * activated a lease nearby") to every business in the property's city,
 * approved or not. In a small town the city plus the minute was enough to
 * point at one household, and pending or rejected businesses received it too.
 *
 * Now each city gets one count per week, only once there are enough leases
 * that the number cannot single anyone out, and only approved businesses see
 * it. The notice carries no agreement, property or tenant reference and no
 * timing finer than "this week". It stays in-app ('promotion' category).
 */
import { Agreement } from '../models/Agreement.js'
import { Property } from '../models/Property.js'
import { Business } from '../models/Business.js'
import { notify } from './notify.js'
import { escapeRegex } from '../utils/params.js'

/** Fewer leases than this in a city in a week: say nothing about that city. */
export const MIN_LEASES_PER_CITY = 5
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export interface NewLeaseDigestResult {
  /** Cities that met the threshold and had at least one approved business. */
  cities: number
  /** Business owners notified. */
  notified: number
}

export async function sendWeeklyNewLeaseDigest(now = new Date()): Promise<NewLeaseDigestResult> {
  const since = new Date(now.getTime() - WINDOW_MS)
  const leases = await Agreement.find({ activatedAt: { $gte: since, $lte: now } }).select('propertyId').lean()
  if (leases.length === 0) return { cities: 0, notified: 0 }

  const propertyIds = [...new Set(leases.map((lease) => lease.propertyId))]
  const properties = await Property.find({ _id: { $in: propertyIds } }).select('address.city').lean()
  const cityOf = new Map(properties.map((p) => [String(p._id), p.address?.city?.trim()]))

  // Grouped case-insensitively, the way the directory matches a business city.
  const byCity = new Map<string, { city: string; count: number }>()
  for (const lease of leases) {
    const city = cityOf.get(lease.propertyId)
    if (!city) continue
    const entry = byCity.get(city.toLowerCase()) ?? { city, count: 0 }
    entry.count += 1
    byCity.set(city.toLowerCase(), entry)
  }

  let cities = 0
  let notified = 0
  for (const { city, count } of byCity.values()) {
    if (count < MIN_LEASES_PER_CITY) continue
    const businesses = await Business.find({
      approvalStatus: 'approved',
      city: new RegExp(`^${escapeRegex(city)}$`, 'i'),
    }).select('ownerId').lean()
    const owners = [...new Set(businesses.map((b) => b.ownerId))]
    if (owners.length === 0) continue
    cities += 1
    const sent = await Promise.allSettled(owners.map((userId) => notify({
      userId,
      title: `${count} new leases in ${city} this week`,
      message: 'People who have just moved often need furniture, internet, moving and cleaning help. Offers you tag for new movers are shown to everyone browsing Local Services.',
      actionUrl: '/role-capabilities',
      category: 'promotion',
    })))
    notified += sent.filter((result) => result.status === 'fulfilled').length
  }
  return { cities, notified }
}
