import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { requireApprovedEntity } from '../middleware/entityApproval.js'
import { InsuranceProviderProfile } from '../models/InsuranceProviderProfile.js'
import { InsuranceProduct } from '../models/InsuranceProduct.js'
import { recordAudit } from '../utils/audit.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

const idOf = <T extends { _id: { toString(): string } }>(doc: T) => ({ ...doc, id: doc._id.toString() })

// Get own insurance provider profile (null when not yet created).
// No dedicated role exists for providers — any authenticated account may
// register one; admin approval gates provider capabilities.
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const profile = await InsuranceProviderProfile.findOne({ userId: req.user!.userId }).lean()
  success(res, { profile: profile ? idOf(profile) : null })
}))

const upsertSchema = z.object({
  institutionName: z.string().min(2),
  licenseNumber: z.string().optional(),
  companyRegistrationNo: z.string().optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(7),
  address: z.string().optional(),
})

// Create or update own insurance provider profile. New profiles land as
// 'pending' and unlock once an admin approves them. Editing an approved
// profile re-queues it for review.
router.post('/me', authenticate, asyncHandler(async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const existing = await InsuranceProviderProfile.findOne({ userId: req.user!.userId })
  if (existing) {
    Object.assign(existing, parsed.data)
    if (existing.approvalStatus === 'approved') {
      existing.approvalStatus = 'pending'
      existing.approvedBy = undefined
      existing.approvedAt = undefined
    }
    await existing.save()
    success(res, { profile: idOf(existing.toObject()) }, 'Profile updated')
    return
  }
  const profile = await InsuranceProviderProfile.create({ ...parsed.data, userId: req.user!.userId })
  success(res, { profile: idOf(profile.toObject()) }, 'Insurance provider profile created — pending admin approval', 201)
}))

/* ================================================================
   Provider product management — the capability unlocked by approval.
   Products are always scoped to the caller's own provider profile:
   providerId/providerName come from the approved profile, never the body.
   ================================================================ */

const CATEGORY_ENUM = z.enum(['renters', 'landlord', 'rent_guarantee', 'property_damage', 'tenant_default'])

const productCreateSchema = z.object({
  productName: z.string().min(1),
  category: CATEGORY_ENUM,
  description: z.string().min(1),
  coverageDetails: z.string().min(1),
  monthlyPremium: z.number().min(0),
  coverageLimit: z.number().min(0),
  excessAmount: z.number().min(0).default(0),
  terms: z.string().default(''),
  active: z.boolean().default(true),
})

const productPatchSchema = z.object({
  productName: z.string().min(1).optional(),
  category: CATEGORY_ENUM.optional(),
  description: z.string().min(1).optional(),
  coverageDetails: z.string().min(1).optional(),
  monthlyPremium: z.number().min(0).optional(),
  coverageLimit: z.number().min(0).optional(),
  excessAmount: z.number().min(0).optional(),
  terms: z.string().optional(),
  active: z.boolean().optional(),
})

// Load the caller's provider profile after the approval gate. Non-admin
// callers without a profile never reach this (the gate 404s first); an admin
// bypassing the gate has no provider profile and belongs on the admin routes.
async function ownProfile(userId: string) {
  return InsuranceProviderProfile.findOne({ userId }).lean()
}

router.get('/me/products', authenticate, requireApprovedEntity('insurance_provider'), asyncHandler(async (req, res) => {
  const profile = await ownProfile(req.user!.userId)
  if (!profile) { error(res, 'Create your insurance provider profile before using this feature', 404); return }

  const products = await InsuranceProduct.find({ providerId: profile._id.toString() })
    .sort({ category: 1, monthlyPremium: 1 })
    .lean()
  const items = products.map((p) => ({ ...p, id: p._id.toString() }))
  success(res, { items, total: items.length })
}))

router.post('/me/products', authenticate, requireApprovedEntity('insurance_provider'), asyncHandler(async (req, res) => {
  const parsed = productCreateSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const profile = await ownProfile(req.user!.userId)
  if (!profile) { error(res, 'Create your insurance provider profile before using this feature', 404); return }

  const product = await InsuranceProduct.create({
    ...parsed.data,
    providerId: profile._id.toString(),
    providerName: profile.institutionName,
  })
  await recordAudit(req, 'insurance.provider_product.create', 'InsuranceProduct', product._id.toString())
  success(res, { ...product.toObject(), id: product._id.toString() }, 'Insurance product created', 201)
}))

router.patch('/me/products/:id', authenticate, requireApprovedEntity('insurance_provider'), asyncHandler(async (req, res) => {
  const parsed = productPatchSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const profile = await ownProfile(req.user!.userId)
  if (!profile) { error(res, 'Create your insurance provider profile before using this feature', 404); return }

  const product = await InsuranceProduct.findOneAndUpdate(
    { _id: param(req.params.id), providerId: profile._id.toString() },
    parsed.data,
    { new: true },
  )
  if (!product) { error(res, 'Product not found', 404); return }

  await recordAudit(req, 'insurance.provider_product.update', 'InsuranceProduct', product._id.toString())
  success(res, { ...product.toObject(), id: product._id.toString() }, 'Product updated')
}))

export default router
