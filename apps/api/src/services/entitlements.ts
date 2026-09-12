/**
 * Entitlement engine (spec §7.3).
 *
 * Two rules the spec is explicit about:
 *
 *  - Enforcement happens here, in the domain layer. Hiding a button is UX, not
 *    security, so every premium path calls `requireEntitlement` server-side.
 *  - Nothing branches on a plan's name. Capability is always a feature key
 *    looked up against the subscriber's plan version, which is what lets an
 *    admin change commercial terms without a deploy.
 */
import { PlanEntitlement } from '../models/PlanEntitlement.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { User } from '../models/User.js'

export type FeatureValue = boolean | number | string

/**
 * Every capability the platform can sell, with the value used when a plan says
 * nothing. Defaults are deliberately the free tier: a missing grant must never
 * accidentally unlock a paid capability.
 */
export const FEATURE_REGISTRY = {
  'property.limit': { type: 'number', default: 3, label: 'Active property limit', hint: '-1 for unlimited' },
  'storefront.enabled': { type: 'boolean', default: false, label: 'Storefront' },
  'storefront.custom_branding': { type: 'boolean', default: false, label: 'Custom branding' },
  'storefront.custom_domain': { type: 'boolean', default: false, label: 'Custom domain' },
  'storefront.remove_rentos_branding': { type: 'boolean', default: false, label: 'Remove RentOS branding' },
  'storefront.theme_count': { type: 'number', default: 1, label: 'Selectable themes' },
  'storefront.analytics': { type: 'string', default: 'none', label: 'Storefront analytics', hint: 'none | basic | advanced' },
  'blog.limit': { type: 'number', default: 0, label: 'Blog post limit', hint: '-1 for unlimited' },
  'sponsorship.quota': { type: 'number', default: 0, label: 'Included sponsored listings' },
  'promotion.enabled': { type: 'boolean', default: false, label: 'Promotions & coupons' },
  'affiliate.enabled': { type: 'boolean', default: false, label: 'Affiliate tools' },
  'platform.fee_percent': { type: 'number', default: 5, label: 'Platform fee %', hint: 'Retained by RentOS on eligible payments' },
} as const

export type FeatureKey = keyof typeof FEATURE_REGISTRY

export function isFeatureKey(key: string): key is FeatureKey {
  return key in FEATURE_REGISTRY
}

/** Thrown when a caller lacks a capability. Routes map this to 402/403. */
export class EntitlementError extends Error {
  constructor(
    public readonly featureKey: string,
    message: string,
    public readonly upgradeRequired = true,
  ) {
    super(message)
    this.name = 'EntitlementError'
  }
}

export interface ResolvedEntitlements {
  planId: string | null
  planName: string
  planVersion: number
  features: Record<string, FeatureValue>
}

function defaults(): Record<string, FeatureValue> {
  const out: Record<string, FeatureValue> = {}
  for (const [key, meta] of Object.entries(FEATURE_REGISTRY)) {
    out[key] = meta.default as FeatureValue
  }
  return out
}

/**
 * Resolve the effective feature set for a user.
 *
 * A user with no subscription still gets a complete, valid entitlement set —
 * the registry defaults — so callers never deal with undefined.
 */
export async function resolveEntitlements(userId: string): Promise<ResolvedEntitlements> {
  const features = defaults()

  const user = await User.findById(userId).lean()
  const packageId = (user as { subscriptionPackageId?: string } | null)?.subscriptionPackageId

  // No subscription: fall back to the plan marked default rather than the bare
  // registry defaults. The free tier is a real, admin-editable plan, and
  // skipping it here would silently ignore the limits an admin configured.
  if (!packageId) {
    const defaultPlan = await SubscriptionPackage.findOne({ isDefault: true, isActive: true }).lean()
    if (!defaultPlan) return { planId: null, planName: 'Free', planVersion: 1, features }
    return applyPlan(defaultPlan as PlanLike, features)
  }

  // An expired subscription degrades to the free defaults rather than keeping
  // paid capability alive (§7.3 downgrade policy: degrade, never delete).
  const endDate = (user as { subscriptionEndDate?: Date } | null)?.subscriptionEndDate
  if (endDate && new Date(endDate) < new Date()) {
    return { planId: packageId, planName: 'Expired', planVersion: 1, features }
  }

  const plan = await SubscriptionPackage.findById(packageId).lean()
  if (!plan) return { planId: null, planName: 'Free', planVersion: 1, features }

  // Resolve against the version this subscriber bought, not the plan's latest.
  return applyPlan(
    plan as PlanLike,
    features,
    (user as { subscriptionPlanVersion?: number } | null)?.subscriptionPlanVersion,
  )
}

interface PlanLike {
  _id: unknown
  name?: string
  version?: number
  maxProperties?: number
  platformFeePercent?: number
}

/** Overlay a plan's legacy columns and then its explicit entitlement grants. */
async function applyPlan(
  plan: PlanLike,
  features: Record<string, FeatureValue>,
  subscribedVersion?: number,
): Promise<ResolvedEntitlements> {
  /*
   * Resolve against the version the subscriber bought.
   *
   * This read plan.version — the plan's CURRENT version — so publishing v2 of
   * a plan re-priced every existing subscriber on that plan the instant it
   * went live. Versioned entitlements exist to prevent exactly that; nobody
   * was grandfathered. A subscriber with no recorded version (anyone who
   * signed up before this was tracked) still falls back to the plan's current
   * version, which is the behaviour they already had.
   */
  const planVersion = subscribedVersion ?? plan.version ?? 1

  // Legacy plan columns still feed the engine so existing subscribers keep
  // working before an admin has authored explicit entitlement rows.
  if (typeof plan.maxProperties === 'number') features['property.limit'] = plan.maxProperties
  if (typeof plan.platformFeePercent === 'number') features['platform.fee_percent'] = plan.platformFeePercent

  // Explicit grants win over the legacy columns.
  const grants = await PlanEntitlement.find({ planId: String(plan._id), planVersion }).lean()
  for (const grant of grants) {
    if (isFeatureKey(grant.featureKey)) {
      features[grant.featureKey] = grant.value as FeatureValue
    }
  }

  return {
    planId: String(plan._id),
    planName: plan.name ?? 'Plan',
    planVersion,
    features,
  }
}

export async function getFeature(userId: string, key: FeatureKey): Promise<FeatureValue> {
  const { features } = await resolveEntitlements(userId)
  return features[key] ?? (FEATURE_REGISTRY[key].default as FeatureValue)
}

/** Boolean gate. Throws EntitlementError when the plan does not include it. */
export async function requireEntitlement(userId: string, key: FeatureKey, label?: string): Promise<void> {
  const value = await getFeature(userId, key)
  if (value === true) return
  throw new EntitlementError(key, `${label ?? FEATURE_REGISTRY[key].label} is not included in your plan.`)
}

/**
 * Quota gate. `-1` means unlimited, matching the existing maxProperties
 * convention rather than inventing a second sentinel.
 */
export async function requireQuota(userId: string, key: FeatureKey, currentUsage: number, label?: string): Promise<void> {
  const { features, planName } = await resolveEntitlements(userId)
  const limit = features[key]
  if (typeof limit !== 'number' || limit === -1) return
  if (currentUsage < limit) return

  // Name the plan in the error: "upgrade" is only actionable if the seller can
  // see which plan they are currently on.
  const noun = `${label ?? FEATURE_REGISTRY[key].label}`.toLowerCase()
  throw new EntitlementError(
    key,
    `Your ${planName} plan allows up to ${limit} ${noun === 'active property limit' ? `propert${limit === 1 ? 'y' : 'ies'}` : noun}. Upgrade to add more.`,
  )
}

/** Numeric feature read with a guaranteed number result. */
export async function getNumericFeature(userId: string, key: FeatureKey): Promise<number> {
  const value = await getFeature(userId, key)
  return typeof value === 'number' ? value : Number(FEATURE_REGISTRY[key].default)
}
