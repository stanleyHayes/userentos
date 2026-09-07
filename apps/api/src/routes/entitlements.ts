/**
 * Plan entitlements — admin authoring (spec §7.2) and self-service read (§7.3).
 *
 * The admin surface writes feature-key rows rather than columns, so a
 * commercial change is data, not a deploy. Every write is audit logged because
 * the spec requires pricing and fee changes to be reconstructable.
 */
import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireRole, requirePermission } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { PlanEntitlement } from '../models/PlanEntitlement.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'
import { FEATURE_REGISTRY, isFeatureKey, resolveEntitlements } from '../services/entitlements.js'

const router = Router()

/** The capability catalogue, so the admin editor renders itself from the source of truth. */
router.get('/features', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (_req, res) => {
  success(res, {
    items: Object.entries(FEATURE_REGISTRY).map(([key, meta]) => ({
      key,
      type: meta.type,
      default: meta.default,
      label: meta.label,
      hint: 'hint' in meta ? meta.hint : undefined,
    })),
  })
}))

/** What the signed-in user's plan currently allows. */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  success(res, await resolveEntitlements(req.user!.userId))
}))

/** Entitlements authored on one plan version. */
router.get('/plans/:planId', authenticate, requireRole('admin', 'super_admin'), asyncHandler(async (req, res) => {
  const planId = param(req.params.planId)
  const plan = await SubscriptionPackage.findById(planId).lean()
  if (!plan) { error(res, 'Plan not found', 404); return }

  const version = Number(req.query.version) || (plan as { version?: number }).version || 1
  const rows = await PlanEntitlement.find({ planId, planVersion: version }).lean()

  success(res, {
    planId,
    planName: (plan as { name?: string }).name,
    planVersion: version,
    items: rows.map((r) => ({ featureKey: r.featureKey, value: r.value })),
  })
}))

const setSchema = z.object({
  featureKey: z.string().min(1),
  value: z.union([z.boolean(), z.number(), z.string()]),
  version: z.number().int().min(1).optional(),
})

/** Author or update one grant. */
router.put('/plans/:planId', authenticate, requirePermission('system:settings'), asyncHandler(async (req, res) => {
  const parsed = setSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const { featureKey, value } = parsed.data

  if (!isFeatureKey(featureKey)) {
    error(res, `Unknown feature "${featureKey}". Add it to the feature registry first.`, 400)
    return
  }

  const planId = param(req.params.planId)
  const plan = await SubscriptionPackage.findById(planId)
  if (!plan) { error(res, 'Plan not found', 404); return }

  const planVersion = parsed.data.version ?? plan.version ?? 1
  const meta = FEATURE_REGISTRY[featureKey]
  if (typeof value !== meta.type) {
    error(res, `"${featureKey}" expects a ${meta.type}`, 400)
    return
  }

  const before = await PlanEntitlement.findOne({ planId, planVersion, featureKey }).lean()
  await PlanEntitlement.findOneAndUpdate(
    { planId, planVersion, featureKey },
    { $set: { value } },
    { upsert: true },
  )

  await recordAudit(req, 'plan.entitlement_changed', 'SubscriptionPackage', planId, {
    featureKey, planVersion, before: before?.value ?? null, after: value,
  })

  success(res, { planId, planVersion, featureKey, value }, 'Entitlement saved')
}))

router.delete('/plans/:planId/:featureKey', authenticate, requirePermission('system:settings'), asyncHandler(async (req, res) => {
  const planId = param(req.params.planId)
  const featureKey = param(req.params.featureKey)
  const plan = await SubscriptionPackage.findById(planId).lean()
  if (!plan) { error(res, 'Plan not found', 404); return }

  const planVersion = Number(req.query.version) || (plan as { version?: number }).version || 1
  await PlanEntitlement.deleteOne({ planId, planVersion, featureKey })
  await recordAudit(req, 'plan.entitlement_removed', 'SubscriptionPackage', planId, { featureKey, planVersion })

  success(res, null, 'Entitlement removed — the plan falls back to the default')
}))

/**
 * Publish a new plan version.
 *
 * Existing subscribers keep the version they bought (grandfathering); the new
 * version starts as a copy so an admin edits from the current terms rather than
 * an empty sheet.
 */
router.post('/plans/:planId/versions', authenticate, requirePermission('system:settings'), asyncHandler(async (req, res) => {
  const planId = param(req.params.planId)
  const plan = await SubscriptionPackage.findById(planId)
  if (!plan) { error(res, 'Plan not found', 404); return }

  const from = plan.version ?? 1
  const to = from + 1
  const rows = await PlanEntitlement.find({ planId, planVersion: from }).lean()
  if (rows.length) {
    await PlanEntitlement.insertMany(
      rows.map((r) => ({ planId, planVersion: to, featureKey: r.featureKey, value: r.value })),
    )
  }

  plan.version = to
  await plan.save()
  await recordAudit(req, 'plan.version_published', 'SubscriptionPackage', planId, { from, to, copied: rows.length })

  success(res, { planId, planVersion: to, copied: rows.length }, `Version ${to} published — existing subscribers stay on ${from}`)
}))

export default router
