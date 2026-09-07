import { ReviewerOrganization } from '../models/ReviewerOrganization.js'

/**
 * Routing policy for submitted properties.
 *
 * Returns the RentOS-only default whenever no organization is configured with
 * a blocking mode, which is what keeps external review entirely optional.
 */
export async function resolveReviewRouting(property: { address?: { region?: string; city?: string } }): Promise<{
  mode: 'rentos_only' | 'advisory' | 'required' | 'delegated'
  organizationId?: string
}> {
  const active = await ReviewerOrganization.find({ isActive: true }).lean()
  if (active.length === 0) return { mode: 'rentos_only' }

  const region = property.address?.region
  const city = property.address?.city
  const inScope = active.filter((org) => {
    const regionOk = org.scope.regions.length === 0 || (region ? org.scope.regions.includes(region) : false)
    const cityOk = org.scope.cities.length === 0 || (city ? org.scope.cities.includes(city) : false)
    return regionOk && cityOk
  })
  if (inScope.length === 0) return { mode: 'rentos_only' }

  // The strictest configured mode wins.
  const delegated = inScope.find((o) => o.reviewMode === 'delegated')
  if (delegated) return { mode: 'delegated', organizationId: String(delegated._id) }
  const required = inScope.find((o) => o.reviewMode === 'required')
  if (required) return { mode: 'required', organizationId: String(required._id) }
  return { mode: 'advisory', organizationId: String(inScope[0]._id) }
}
