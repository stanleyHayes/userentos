import { recordCollectionInitiation, recordRefusedCollection, recordUncertainCollection } from '../services/payments/collectionInitiation.js'
import { resolveFreeSubscription, resolvePackageEntitlements } from '../services/entitlements.js'
import { assignSubscription } from '../services/assignSubscription.js'
import { effectiveStoreSubscription } from '../services/storeBilling/activeEntitlements.js'
import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { StoreProduct } from '../models/StoreProduct.js'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { User } from '../models/User.js'
import { Property } from '../models/Property.js'
import { Payment, type IPayment } from '../models/Payment.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'
import { collectionCorrelator, getProvider, isMethodAvailable } from '../services/payments/index.js'
import { isDuplicateKey, requireIdempotencyKey, respondCollectionInProgress, respondCollectionRefused } from '../services/payments/checkout.js'
import { CollectionRefusedError, type ProviderId } from '../services/payments/types.js'
import { captureSubscriptionTerms } from '../services/payments/subscriptionTerms.js'
import { currentPaidSubscription } from '../services/payments/paidSubscription.js'

const packageSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().min(1),
  price: z.number().min(0),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
  maxProperties: z.number().int().min(-1), // -1 = unlimited
  benefits: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
})

export const subscriptionController = {
  // List all packages (public - for landlords to see options)
  list: async (_req: Request, res: Response) => {
    const packages = await SubscriptionPackage.find({ isActive: true }).sort({ sortOrder: 1 }).lean()
    const items = packages.map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() }))
    success(res, { items, total: items.length })
  },

  // List all packages including inactive (admin)
  listAll: async (_req: Request, res: Response) => {
    const packages = await SubscriptionPackage.find().sort({ sortOrder: 1 }).lean()
    const items = packages.map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() }))
    success(res, { items, total: items.length })
  },

  // Get single package
  getById: async (req: Request, res: Response) => {
    const pkg = await SubscriptionPackage.findById(param(req.params.id)).lean()
    if (!pkg) { error(res, 'Package not found', 404); return }
    success(res, { ...pkg, id: (pkg._id as Types.ObjectId).toString() })
  },

  // Create package (admin)
  create: async (req: Request, res: Response) => {
    const parsed = packageSchema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    // If this is set as default, unset other defaults
    if (parsed.data.isDefault) {
      await SubscriptionPackage.updateMany({ isDefault: true }, { isDefault: false })
    }

    const pkg = await SubscriptionPackage.create(parsed.data)
    await recordAudit(req, 'subscriptions.package.create', 'SubscriptionPackage', pkg._id.toString(), { name: pkg.name, slug: pkg.slug })
    success(res, { ...pkg.toObject(), id: pkg._id.toString() }, 'Package created', 201)
  },

  // Update package (admin)
  update: async (req: Request, res: Response) => {
    const pkg = await SubscriptionPackage.findById(param(req.params.id))
    if (!pkg) { error(res, 'Package not found', 404); return }

    const parsed = packageSchema.partial().safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

    // If setting as default, unset other defaults
    if (parsed.data.isDefault) {
      await SubscriptionPackage.updateMany({ _id: { $ne: pkg._id }, isDefault: true }, { isDefault: false })
    }

    Object.assign(pkg, parsed.data)
    await pkg.save()

    await recordAudit(req, 'subscriptions.package.update', 'SubscriptionPackage', pkg._id.toString(), { changes: parsed.data })
    success(res, { ...pkg.toObject(), id: pkg._id.toString() }, 'Package updated')
  },

  // Delete package (admin)
  delete: async (req: Request, res: Response) => {
    const pkg = await SubscriptionPackage.findById(param(req.params.id))
    if (!pkg) { error(res, 'Package not found', 404); return }

    if (await StoreProduct.exists({ packageId: pkg._id.toString() })) {
      error(res, 'This package has store product mappings. Deactivate it to preserve purchase history.', 409); return
    }

    // Check if any users are on this package
    const subscriberCount = await User.countDocuments({ subscriptionPackageId: pkg._id.toString() })
    if (subscriberCount > 0) {
      error(res, `Cannot delete package with ${subscriberCount} active subscriber(s). Reassign them first or deactivate the package instead.`)
      return
    }

    await pkg.deleteOne()
    await recordAudit(req, 'subscriptions.package.delete', 'SubscriptionPackage', pkg._id.toString(), { name: pkg.name, slug: pkg.slug })
    success(res, null, 'Package deleted')
  },

  // Get current user's subscription info
  mySubscription: async (req: Request, res: Response) => {
    const user = await User.findById(req.user!.userId).lean()
    if (!user) { error(res, 'User not found', 404); return }

    const store = await effectiveStoreSubscription(req.user!.userId, user)
    if (store) {
      const propertyCount = await Property.countDocuments({ landlordId: req.user!.userId })
      const limit = Number(store.snapshot.features['property.limit'])
      success(res, {
        package: { id: store.snapshot.planId, name: store.snapshot.planName, version: store.snapshot.planVersion, billingCycle: store.snapshot.billingCycle, benefits: store.snapshot.benefits, maxProperties: limit },
        billingSource: store.billingSource, subscriptionStartDate: new Date(store.startedAt), subscriptionEndDate: store.expiresAt,
        isExpired: false, propertyCount, maxProperties: limit, canAddProperty: limit === -1 || propertyCount < limit,
      })
      return
    }

    const isExpired = !!user.subscriptionEndDate && (!Number.isFinite(new Date(user.subscriptionEndDate).getTime()) || new Date(user.subscriptionEndDate).getTime() <= Date.now())
    const paid = await currentPaidSubscription(user)
    if (paid?.active && 'terms' in paid) {
      const propertyCount = await Property.countDocuments({ landlordId: req.user!.userId })
      const limit = paid.active && 'terms' in paid ? Number(paid.features['property.limit']) : 0
      success(res, { package: paid.active && 'terms' in paid ? { id: paid.terms.packageId, name: paid.terms.packageName, version: paid.terms.packageVersion, price: paid.terms.amount, billingCycle: paid.terms.billingCycle, benefits: paid.terms.benefits, maxProperties: limit } : null, billingSource: 'provider', subscriptionStartDate: user.subscriptionStartDate, subscriptionEndDate: user.subscriptionEndDate, isExpired: !paid.active, propertyCount, maxProperties: limit, canAddProperty: paid.active && (limit === -1 || propertyCount < limit) })
      return
    }

    const assigned = !paid && user.subscriptionPackageId && !isExpired
      ? await SubscriptionPackage.findById(user.subscriptionPackageId).lean() : null
    const fallback = assigned ? null : await resolveFreeSubscription()
    const pkg = assigned ?? fallback?.plan ?? null
    const resolved = assigned ? await resolvePackageEntitlements(assigned, user.subscriptionPlanVersion) : fallback!.entitlements
    const limit = Number(resolved.features['property.limit'])
    const propertyCount = await Property.countDocuments({ landlordId: req.user!.userId })
    success(res, {
      package: pkg ? { ...pkg, id: String(pkg._id), version: resolved.planVersion, maxProperties: limit } : null,
      billingSource: fallback ? 'free' : undefined,
      subscriptionStartDate: fallback ? undefined : user.subscriptionStartDate,
      subscriptionEndDate: fallback ? undefined : user.subscriptionEndDate,
      isExpired: false,
      previousSubscriptionInactive: isExpired || !!paid || (!!user.subscriptionPackageId && !assigned),
      fallbackApplied: !!fallback,
      propertyCount,
      maxProperties: limit,
      canAddProperty: limit === -1 || propertyCount < limit,
    })
  },

  // Subscribe to a package (landlord/manager)
  // Paid packages initiate a REAL payment collection; the subscription is only
  // activated in the verified finalize path (see services/payments/finalize.ts).
  // Previously this activated any package instantly, for free.
  subscribe: async (req: Request, res: Response) => {
    const schema = z.object({
      packageId: z.string().min(1),
      method: z.enum(['mtn_momo', 'telecel_cash', 'airteltigo_money', 'bank_transfer']).optional(),
      phone: z.string().min(9).max(15).optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
    const { packageId, method, phone } = parsed.data

    // Resolve retries before reading today's package; saved purchases survive
    // catalogue changes and remain scoped to the original payer and method.
    const header = req.headers['idempotency-key']
    const idempotencyKey = typeof header === 'string' && header.trim() ? header.trim() : undefined
    const matchesRetry = (payment: { purpose: string; purposeMeta?: Record<string, unknown>; method: string; subscriptionTerms?: { packageId: string } }) => payment.purpose === 'subscription' && (payment.subscriptionTerms?.packageId ?? payment.purposeMeta?.packageId) === packageId && (!method || payment.method === method)
    const replayed = async () => {
      if (!idempotencyKey) return false
      const existing = await Payment.findOne({ idempotencyKey, tenantId: req.user!.userId }).lean()
      if (!existing) return false
      if (!matchesRetry(existing)) { error(res, 'Idempotency-Key was already used for a different subscription or payment method', 409); return true }
      success(res, { payment: { ...existing, id: (existing._id as Types.ObjectId).toString() }, instructions: existing.providerInstructions }, 'Payment already initiated')
      return true
    }
    if (await replayed()) return

    const pkg = await SubscriptionPackage.findById(packageId)
    if (!pkg || !pkg.isActive) { error(res, 'Package not found or inactive', 404); return }

    const user = await User.findById(req.user!.userId)
    if (!user) { error(res, 'User not found', 404); return }

    // Free packages need no payment — activate immediately.
    if (pkg.price <= 0) {
      const now = new Date()
      const assigned = await assignSubscription(user, pkg, now)
      if (!assigned) { error(res, 'Subscription changed. Refresh and try again.', 409); return }
      const endDate = assigned.subscriptionEndDate

      success(res, {
        package: { ...pkg.toObject(), id: pkg._id.toString() },
        subscriptionStartDate: now,
        subscriptionEndDate: endDate,
      }, 'Subscription activated')
      return
    }

    // Paid package — collect payment first.
    if (!method) { error(res, 'method is required for paid packages'); return }
    if (method !== 'bank_transfer' && !phone) { error(res, 'phone is required for mobile money payments'); return }
    // A paid checkout starts a real collection, so its retry key is required.
    if (!requireIdempotencyKey(req, res)) return

    if (!isMethodAvailable(method as ProviderId)) {
      error(res, 'That payment method is not available right now. Please choose another.', 422); return
    }

    // One in-flight paid checkout per subscriber; the next is allowed once it settles or fails.
    const openCollectionKey = `sub:${req.user!.userId}`
    const inFlight = async () => {
      const open = await Payment.findOne({ openCollectionKey, tenantId: req.user!.userId }).lean()
      if (!open) return false
      respondCollectionInProgress(res, open)
      return true
    }
    if (await inFlight()) return

    const reference = `SUB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const subscriptionTerms = await captureSubscriptionTerms(pkg)
    let payment: IPayment | undefined
    try {
      const provider = getProvider(method as ProviderId)
      // Saved before the provider is called, so an interrupted initiation is still reconcilable.
      const providerRef = collectionCorrelator(provider, reference)
      payment = await Payment.create({
        collectionSource: provider.source,
        providerRef,
        openCollectionKey,
        tenantId: req.user!.userId,
        amount: subscriptionTerms.amount,
        method,
        status: 'pending',
        reference,
        purpose: 'subscription',
        purposeMeta: { packageId: pkg._id.toString() },
        subscriptionTerms,
        idempotencyKey,
      })

      const result = await provider.initiateCollection({
        amount: subscriptionTerms.amount,
        phone: phone ?? '',
        reference,
        providerRef,
        narration: `RentOS subscription: ${pkg.name}`,
        payerEmail: req.user!.email,
      })

      const recorded = await recordCollectionInitiation(payment._id.toString(), result)
      if (!recorded) throw new Error('Payment record unavailable after initiation')

      success(
        res,
        {
          payment: { ...recorded, id: recorded._id.toString() },
          instructions: result.instructions,
        },
        'Payment initiated — your subscription activates once the payment is confirmed',
        201,
      )
    } catch (err) {
      // Lost a race: the same retry, or another paid checkout for this
      // subscriber, created its payment first. The replay is checked first.
      if (!payment && isDuplicateKey(err)) {
        if (await replayed()) return
        if (isDuplicateKey(err, 'openCollectionKey') && await inFlight()) return
      }
      // A clear refusal created no charge: free the subscriber's checkout now.
      if (payment && err instanceof CollectionRefusedError) {
        const refused = await recordRefusedCollection(payment._id.toString(), err.reason).catch(() => null)
        if (refused) { respondCollectionRefused(res, refused, err.reason); return }
      }
      // A timeout may follow provider acceptance. Keep the original key and
      // payment available for reconciliation; never downgrade a raced webhook.
      if (payment) await recordUncertainCollection(payment._id.toString()).catch(() => undefined)
      throw err
    }
  },

  // Admin: assign package to a user
  assignPackage: async (req: Request, res: Response) => {
    const { userId, packageId } = req.body
    if (!userId || !packageId) { error(res, 'userId and packageId are required'); return }

    const pkg = await SubscriptionPackage.findById(packageId)
    if (!pkg) { error(res, 'Package not found', 404); return }

    const user = await User.findById(userId)
    if (!user) { error(res, 'User not found', 404); return }

    const assigned = await assignSubscription(user, pkg)
    if (!assigned) { error(res, 'Subscription changed. Refresh and try again.', 409); return }
    const endDate = assigned.subscriptionEndDate

    await recordAudit(req, 'subscriptions.assign', 'User', user._id.toString(), { packageId: pkg._id.toString(), packageName: pkg.name })
    success(res, { userId, packageId, subscriptionEndDate: endDate }, 'Package assigned')
  },
}
