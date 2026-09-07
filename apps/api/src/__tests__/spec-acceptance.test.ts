import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { canReview, canTransition, TRANSITIONS } from '../services/propertyReview.js'
import { FEATURE_REGISTRY } from '../services/entitlements.js'
import { RESERVED_SLUGS, validateSlug } from '../services/storefront.js'
import { calculateSplit } from '../services/marketplace/split.js'

const root = join(process.cwd(), 'src')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/**
 * Structural audit of the specification.
 *
 * These are not a substitute for the behavioural tests in the other files —
 * they assert that each required capability EXISTS and is wired, so a
 * regression that deletes a whole area is caught rather than silently
 * reducing coverage.
 */
describe('spec acceptance matrix (§18) and definition of done (§19)', () => {
  it('§5.2 implements every documented review state', () => {
    const required = [
      'draft', 'pending_review', 'in_review', 'changes_requested',
      'approved', 'rejected', 'published', 'suspended', 'archived', 'withdrawn',
    ]
    for (const state of required) {
      expect(Object.keys(TRANSITIONS), `${state} must exist`).toContain(state)
    }
    // The owner's route back from a rejection, per the state table.
    expect(canTransition('rejected', 'pending_review')).toBe(true)
    expect(canTransition('changes_requested', 'pending_review')).toBe(true)
  })

  it('§5.4 super admin is always authorized and uniquely holds override', () => {
    const su = { roles: ['super_admin'], permissions: [] }
    for (const perm of ['property.review.read', 'property.review.approve', 'property.review.reject', 'property.review.request_changes', 'property.review.assign', 'property.review.override'] as const) {
      expect(canReview(su, perm), `super admin must hold ${perm}`).toBe(true)
    }
    expect(canReview({ roles: ['admin'], permissions: [] }, 'property.review.override')).toBe(false)
  })

  it('§7 no premium capability depends on a hard-coded plan name', () => {
    const engine = read('services/entitlements.ts')
    // The engine must not branch on commercial plan names.
    for (const planName of ['Starter', 'Pro', 'Enterprise', 'Premium', 'Basic']) {
      expect(engine.includes(`'${planName}'`), `entitlements must not branch on "${planName}"`).toBe(false)
    }
    expect(Object.keys(FEATURE_REGISTRY).length).toBeGreaterThan(8)
  })

  it('§7.3 every boolean capability defaults to withheld', () => {
    for (const [key, meta] of Object.entries(FEATURE_REGISTRY)) {
      if (meta.type === 'boolean') expect(meta.default, key).toBe(false)
    }
  })

  it('§4.1 reserved slugs cannot be assigned', () => {
    for (const s of ['www', 'admin', 'api', 'app', 'studio', 'auth', 'support', 'system']) {
      expect(RESERVED_SLUGS.has(s)).toBe(true)
      expect(validateSlug(s).ok).toBe(false)
    }
  })

  it('§8.2 fee snapshot fields exist on the transaction record', () => {
    const model = read('models/MarketplaceTransaction.ts')
    for (const field of ['platformFeePercent', 'platformFeeAmount', 'sellerExpectedAmount', 'processorFeeAmount', 'feeBearer']) {
      expect(model, `transaction must snapshot ${field}`).toContain(field)
    }
  })

  it('§8.2 the platform fee is not conflated with the processor fee', () => {
    const split = calculateSplit({ grossAmount: 1000, platformFeePercent: 5 })
    expect(split.platformFeeAmount).toBe(50)
    // The processor fee is never inferred from the platform fee.
    expect(split).not.toHaveProperty('processorFeeAmount')
    expect(split.feeBearer).toBe('platform')
  })

  it('§8.4 webhooks verify signatures and dedupe by provider event id', () => {
    const webhook = read('routes/marketplaceWebhooks.ts')
    expect(webhook).toContain('verifyWebhookSignature')
    expect(webhook).toContain('processedEventIds')
    // Redirect success alone must never mark a transaction paid.
    expect(webhook).toContain('verifyTransaction')
  })

  it('§15 secret keys are never sent to a client', () => {
    const adapter = read('services/marketplace/paystack.ts')
    expect(adapter).toContain('PAYSTACK_SECRET_KEY')
    // The secret is read server-side only; no route echoes it.
    for (const file of ['routes/marketplacePayments.ts', 'routes/marketplaceWebhooks.ts']) {
      expect(read(file)).not.toContain('PAYSTACK_SECRET_KEY')
    }
  })

  it('§12 every suggested entity has a model', () => {
    const required = [
      'Storefront', 'StorefrontDomain', 'PlanEntitlement', 'PaymentAccount',
      'PropertyReview', 'Sponsorship', 'Promotion', 'Affiliate',
      'MarketplaceTransaction', 'ReviewerOrganization', 'WebhookEvent',
    ]
    for (const model of required) {
      expect(existsSync(join(root, 'models', `${model}.ts`)), `models/${model}.ts must exist`).toBe(true)
    }
  })

  it('§13 the API surface is mounted', () => {
    const index = read('index.ts')
    for (const mount of [
      '/api/storefronts', '/api/entitlements', '/api/marketplace/payments',
      '/api/marketplace', '/api/reviewer-organizations', '/api/authoring',
      '/api/webhooks/marketplace',
    ]) {
      expect(index, `${mount} must be mounted`).toContain(mount)
    }
  })

  it('§15 moderation, payouts, domains and plan changes are audited', () => {
    expect(read('routes/propertyModeration.ts')).toContain('recordAudit')
    expect(read('routes/storefronts.ts')).toContain('recordAudit')
    expect(read('routes/entitlements.ts')).toContain('recordAudit')
    expect(read('routes/marketplacePayments.ts')).toContain('recordAudit')
    expect(read('routes/marketplaceCommerce.ts')).toContain('recordAudit')
  })

  it('§17 entitlements are enforced in services, not only the UI', () => {
    const storefronts = read('routes/storefronts.ts')
    expect(storefronts).toContain('requireEntitlement')
    expect(read('services/propertyService.ts')).toContain('requireQuota')
    expect(read('routes/marketplaceCommerce.ts')).toContain('requireEntitlement')
  })
})
