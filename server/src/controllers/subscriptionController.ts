import { Request, Response } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { SubscriptionPackage } from '../models/SubscriptionPackage.js'
import { User } from '../models/User.js'
import { Property } from '../models/Property.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

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
    success(res, null, 'Package deleted')
  },

  // Get current user's subscription info
  mySubscription: async (req: Request, res: Response) => {
    const user = await User.findById(req.user!.userId).lean()
    if (!user) { error(res, 'User not found', 404); return }

    let pkg = null
    if (user.subscriptionPackageId) {
      pkg = await SubscriptionPackage.findById(user.subscriptionPackageId).lean()
      if (pkg) pkg = { ...pkg, id: (pkg._id as Types.ObjectId).toString() }
    }

    const propertyCount = await Property.countDocuments({ landlordId: req.user!.userId })

    success(res, {
      package: pkg,
      subscriptionStartDate: user.subscriptionStartDate,
      subscriptionEndDate: user.subscriptionEndDate,
      propertyCount,
      maxProperties: pkg?.maxProperties ?? 0,
      canAddProperty: pkg ? (pkg.maxProperties === -1 || propertyCount < pkg.maxProperties) : false,
    })
  },

  // Subscribe to a package (landlord/manager)
  subscribe: async (req: Request, res: Response) => {
    const { packageId } = req.body
    if (!packageId) { error(res, 'Package ID is required'); return }

    const pkg = await SubscriptionPackage.findById(packageId)
    if (!pkg || !pkg.isActive) { error(res, 'Package not found or inactive', 404); return }

    const user = await User.findById(req.user!.userId)
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

    success(res, {
      package: { ...pkg.toObject(), id: pkg._id.toString() },
      subscriptionStartDate: now,
      subscriptionEndDate: endDate,
    }, 'Subscription activated')
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

    success(res, { userId, packageId, subscriptionEndDate: endDate }, 'Package assigned')
  },
}
