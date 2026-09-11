/**
 * Default feature grants per plan (spec §7.1, §7.3).
 *
 * The entitlement engine denies by default — a missing grant must never
 * accidentally unlock a paid capability — and it reads grants from
 * PlanEntitlement. Nothing ever wrote those rows, so on any fresh database
 * (including production) every plan resolved to the free defaults: an
 * Enterprise subscriber at GHS 150/month got storefront.enabled=false,
 * blog.limit=0, promotion.enabled=false and affiliate.enabled=false. The whole
 * storefront/marketplace surface was unreachable for everyone, on every plan.
 *
 * These are starting commercial terms, not policy set in stone. An admin edits
 * them in Admin → Plans & Entitlements without a deploy, which is the point of
 * the key/value design; this only makes the paid tiers mean something out of
 * the box.
 *
 * Idempotent and non-destructive: a plan that already has ANY grant is left
 * entirely alone, so an admin's edits are never overwritten by a restart.
 */
import { PlanEntitlement } from './models/PlanEntitlement.js'
import { SubscriptionPackage } from './models/SubscriptionPackage.js'
import { isFeatureKey, type FeatureKey, type FeatureValue } from './services/entitlements.js'
import { logger } from './utils/logger.js'

type Grants = Partial<Record<FeatureKey, FeatureValue>>

/**
 * Keyed by plan slug. `property.limit` and `platform.fee_percent` are left out
 * on purpose: applyPlan already derives those from the plan's own
 * maxProperties / platformFeePercent columns, and an explicit grant here would
 * silently override whatever an admin set on the plan itself.
 */
const DEFAULT_GRANTS: Record<string, Grants> = {
  starter: {
    'storefront.enabled': false,
    'storefront.custom_branding': false,
    'storefront.custom_domain': false,
    'storefront.remove_rentos_branding': false,
    'storefront.theme_count': 1,
    'storefront.analytics': 'none',
    'blog.limit': 0,
    'sponsorship.quota': 0,
    'promotion.enabled': false,
    'affiliate.enabled': false,
  },
  professional: {
    'storefront.enabled': true,
    'storefront.custom_branding': true,
    'storefront.custom_domain': false,
    'storefront.remove_rentos_branding': false,
    'storefront.theme_count': 4,
    'storefront.analytics': 'basic',
    'blog.limit': 10,
    'sponsorship.quota': 1,
    'promotion.enabled': true,
    'affiliate.enabled': false,
  },
  enterprise: {
    'storefront.enabled': true,
    'storefront.custom_branding': true,
    'storefront.custom_domain': true,
    'storefront.remove_rentos_branding': true,
    'storefront.theme_count': -1,
    'storefront.analytics': 'advanced',
    'blog.limit': -1,
    'sponsorship.quota': 5,
    'promotion.enabled': true,
    'affiliate.enabled': true,
  },
}

export async function bootstrapPlanEntitlements(): Promise<void> {
  const plans = await SubscriptionPackage.find({}).lean()
  let planned = 0
  let inserted = 0

  for (const plan of plans) {
    const grants = DEFAULT_GRANTS[plan.slug]
    if (!grants) continue

    const planId = String(plan._id)
    const planVersion = (plan as { version?: number }).version ?? 1

    // An admin who has authored even one grant owns this plan's terms now.
    const existing = await PlanEntitlement.countDocuments({ planId, planVersion })
    if (existing > 0) continue

    planned += 1
    for (const [featureKey, value] of Object.entries(grants)) {
      if (!isFeatureKey(featureKey)) continue
      await PlanEntitlement.updateOne(
        { planId, planVersion, featureKey },
        { $setOnInsert: { planId, planVersion, featureKey, value } },
        { upsert: true },
      )
      inserted += 1
    }
  }

  if (inserted > 0) {
    logger.info(`Bootstrapped ${inserted} entitlement grant(s) across ${planned} plan(s).`)
  }
}
