import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { User } from '../models/User.js'
import { Property } from '../models/Property.js'
import { Payment, type IPayment } from '../models/Payment.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'
import { getProvider } from '../services/payments/index.js'
import type { ProviderId } from '../services/payments/types.js'
import { round2 } from '../utils/money.js'

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

    const isExpired = !!user.subscriptionEndDate && new Date(user.subscriptionEndDate) < new Date()

    let pkg = null
    if (user.subscriptionPackageId && !isExpired) {
      pkg = await SubscriptionPackage.findById(user.subscriptionPackageId).lean()
      if (pkg) pkg = { ...pkg, id: (pkg._id as Types.ObjectId).toString() }
    }

    const propertyCount = await Property.countDocuments({ landlordId: req.user!.userId })

    success(res, {
      package: pkg,
      subscriptionStartDate: user.subscriptionStartDate,
      subscriptionEndDate: user.subscriptionEndDate,
      isExpired,
      propertyCount,
      maxProperties: pkg?.maxProperties ?? 0,
      canAddProperty: pkg ? (pkg.maxProperties === -1 || propertyCount < pkg.maxProperties) : false,
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

    const pkg = await SubscriptionPackage.findById(packageId)
    if (!pkg || !pkg.isActive) { error(res, 'Package not found or inactive', 404); return }

    const user = await User.findById(req.user!.userId)
    if (!user) { error(res, 'User not found', 404); return }

    // Free packages need no payment — activate immediately.
    if (pkg.price <= 0) {
      const now = new Date()
      const endDate = new Date(now)
      if (pkg.billingCycle === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1)
      } else {
        endDate.setMonth(endDate.getMonth() + 1)
      }

      user.subscriptionPackageId = pkg._id.toString()
      user.subscriptionStartDate = now
      user.subscriptionEndDate = endDate
      await user.save()

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

    // Idempotency: a retried request returns the original pending payment
    // instead of initiating a duplicate collection (same pattern as rent payments).
    // Scoped to the caller, and only a short-circuit when the retry is for the
    // SAME package — a key reused for a different package is a conflict.
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined
    if (idempotencyKey) {
      const existing = await Payment.findOne({ idempotencyKey, tenantId: req.user!.userId }).lean()
      if (existing) {
        const existingPackageId = (existing.purposeMeta as { packageId?: string } | undefined)?.packageId
        if (existingPackageId !== pkg._id.toString()) {
          error(res, 'Idempotency-Key was already used for a different subscription', 409)
          return
        }
        success(res, { payment: { ...existing, id: (existing._id as Types.ObjectId).toString() } }, 'Payment already initiated')
        return
      }
    }

    const reference = `SUB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    let payment: IPayment | undefined
    try {
      payment = await Payment.create({
        tenantId: req.user!.userId,
        amount: round2(pkg.price),
        method,
        status: 'pending',
        reference,
        purpose: 'subscription',
        purposeMeta: { packageId: pkg._id.toString() },
        ...(idempotencyKey ? { idempotencyKey } : {}),
      })

      const provider = getProvider(method as ProviderId)
      const result = await provider.initiateCollection({
        amount: round2(pkg.price),
        phone: phone ?? '',
        reference,
        narration: `RentOS subscription: ${pkg.name}`,
      })

      payment.providerRef = result.providerRef
      payment.providerStatus = result.status
      await payment.save()

      success(
        res,
        {
          payment: { ...payment.toObject(), id: payment._id.toString() },
          instructions: result.instructions,
        },
        'Payment initiated — your subscription activates once the payment is confirmed',
        201,
      )
    } catch (err) {
      // Lost the idempotency race — another request created it first.
      if (idempotencyKey && (err as { code?: number }).code === 11000) {
        const existing = await Payment.findOne({ idempotencyKey, tenantId: req.user!.userId }).lean()
        if (existing) {
          success(res, { payment: { ...existing, id: (existing._id as Types.ObjectId).toString() } }, 'Payment already initiated')
          return
        }
      }
      // The provider call failed AFTER the payment row was created — mark it
      // failed (same terminal state the finalizer uses) so the pending record
      // doesn't pin the idempotency key forever.
      if (payment) {
        payment.status = 'failed'
        payment.failureReason = (err as Error).message
        await payment.save().catch(() => undefined)
      }
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

    const now = new Date()
    const endDate = new Date(now)
    if (pkg.billingCycle === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1)
    } else {
      endDate.setMonth(endDate.getMonth() + 1)
    }

    user.subscriptionPackageId = pkg._id.toString()
    user.subscriptionStartDate = now
    user.subscriptionEndDate = endDate
    await user.save()

    await recordAudit(req, 'subscriptions.assign', 'User', user._id.toString(), { packageId: pkg._id.toString(), packageName: pkg.name })
    success(res, { userId, packageId, subscriptionEndDate: endDate }, 'Package assigned')
  },
}
