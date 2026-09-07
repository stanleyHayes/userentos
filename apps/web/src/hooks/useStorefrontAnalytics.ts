import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useMyEntitlements } from '@/hooks/useApi'

// ─────────────────────────────────────────────
// SELLER STOREFRONT ANALYTICS (spec §4)
// Shapes mirror GET /storefronts/me/analytics in apps/api/src/routes/storefronts.ts.
// ─────────────────────────────────────────────

/** One counter with its own previous-window comparison. */
export interface StorefrontMetric {
  value: number
  previous: number
  /** null when the previous window was empty — 0 → 12 has no percentage. */
  changePercent: number | null
}

export interface StorefrontAnalyticsDay {
  /** UTC calendar day, `YYYY-MM-DD`. Every day in the range is present. */
  date: string
  views: number
  uniqueVisitors: number
  listingImpressions: number
  contactClicks: number
}

export interface StorefrontTopListing {
  propertyId: string
  title: string
  views: number
}

export interface StorefrontAnalytics {
  /** 'basic' | 'advanced' — the plan tier that unlocked this report. */
  tier: string
  range: { days: number; from: string; to: string; previousFrom: string }
  headline: {
    views: StorefrontMetric
    uniqueVisitors: StorefrontMetric
    listingImpressions: StorefrontMetric
    contactClicks: StorefrontMetric
  }
  contactChannels: { phone: number; email: number; whatsapp: number }
  daily: StorefrontAnalyticsDay[]
  topListings: StorefrontTopListing[]
}

/** The ranges the range selector offers. 90 is the server's ceiling. */
export const STOREFRONT_ANALYTICS_RANGES = [7, 30, 90] as const
export type StorefrontAnalyticsRange = (typeof STOREFRONT_ANALYTICS_RANGES)[number]

/**
 * Was this failure "your plan does not cover it" rather than "it broke"?
 *
 * The API answers 402 with EntitlementError's wording, but api.get() throws a
 * plain Error and the status never reaches the caller — the message is all
 * there is to read. Every entitlement refusal in the API ends in this phrase.
 */
export function isPlanDenied(err: unknown): boolean {
  return err instanceof Error && /not included in your plan/i.test(err.message)
}

/** The seller has the plan but has not claimed a storefront yet (404). */
export function isMissingStorefront(err: unknown): boolean {
  return err instanceof Error && /create your storefront first/i.test(err.message)
}

/**
 * GET /storefronts/me/analytics?days=N — the seller's own traffic report.
 *
 * `storefront.analytics` is a tier string ('none' | 'basic' | 'advanced'), not
 * a boolean, so the check below mirrors the server's: anything that is not a
 * real tier is a refusal. Reading the plan first means a seller without it sees
 * the upgrade prompt without spending a request on a 402 we already know is
 * coming — but the server stays the gate, so an entitlements read that itself
 * failed asks anyway rather than showing a paywall we cannot substantiate.
 */
export function useStorefrontAnalytics(days: StorefrontAnalyticsRange) {
  const { data: entitlements, isLoading: planLoading, isError: planFailed } = useMyEntitlements()
  const feature = entitlements?.features['storefront.analytics']
  const tier = typeof feature === 'string' && feature !== '' && feature !== 'none' ? feature : undefined
  const entitled = tier !== undefined

  const query = useQuery({
    queryKey: ['storefront-analytics', days],
    queryFn: () => api.get<StorefrontAnalytics>(`/storefronts/me/analytics?days=${days}`),
    enabled: planFailed || (!planLoading && entitled),
    // Neither refusal changes on a retry, and retrying a paywall just delays
    // the prompt by a round-trip.
    retry: (failureCount, err) =>
      !isPlanDenied(err) && !isMissingStorefront(err) && failureCount < 1,
  })

  return {
    ...query,
    // The page cannot decide anything until the plan is known.
    isLoading: planLoading || query.isLoading,
    planName: entitlements?.planName,
    tier,
    deniedByPlan: (entitlements !== undefined && !entitled) || isPlanDenied(query.error),
    needsStorefront: isMissingStorefront(query.error),
  }
}
