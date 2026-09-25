import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { requireApprovedEntity } from '../middleware/entityApproval.js'
import { InsuranceProviderProfile } from '../models/InsuranceProviderProfile.js'
import { InsuranceProduct } from '../models/InsuranceProduct.js'
import { InsurancePolicy } from '../models/InsurancePolicy.js'
import { creditWallet } from '../services/payments/walletLedger.js'
import { decideClaim, ClaimDecisionError } from '../services/insuranceClaims.js'
import { notify } from '../services/notify.js'
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
  // The NIC licence an admin must check before approving.
  licenseNumber: z.string().trim().min(3, 'Enter your NIC licence number'),
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
    { returnDocument: 'after' },
  )
  if (!product) { error(res, 'Product not found', 404); return }

  await recordAudit(req, 'insurance.provider_product.update', 'InsuranceProduct', product._id.toString())
  success(res, { ...product.toObject(), id: product._id.toString() }, 'Product updated')
}))

/* ================================================================
   Policies and claims on the provider's own products. The insurer issues
   the policy (premium is released to it only then) and decides claims,
   paying approved claims from its own wallet.
   ================================================================ */

const approvedProvider = [authenticate, requireApprovedEntity('insurance_provider')]

function addMonths(isoDate: string, months: number) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

router.get('/me/policies', ...approvedProvider, asyncHandler(async (req, res) => {
  const profile = await ownProfile(req.user!.userId)
  if (!profile) { error(res, 'Create your insurance provider profile before using this feature', 404); return }
  const policies = await InsurancePolicy.find({ providerId: profile._id.toString() }).sort({ createdAt: -1 }).lean()
  success(res, { items: policies.map((p) => ({ ...p, id: p._id.toString() })), total: policies.length })
}))

router.post('/me/policies/:id/issue', ...approvedProvider, asyncHandler(async (req, res) => {
  const parsed = z.object({ insurerPolicyNumber: z.string().trim().min(3) }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const profile = await ownProfile(req.user!.userId)
  if (!profile) { error(res, 'Create your insurance provider profile before using this feature', 404); return }

  const pending = await InsurancePolicy.findOne({ _id: param(req.params.id), providerId: profile._id.toString(), status: 'pending' }).lean()
  if (!pending) { error(res, 'Policy is not awaiting issuance', 409); return }
  // Cover runs from issuance for the term that was paid for.
  const startDate = new Date().toISOString().slice(0, 10)
  const policy = await InsurancePolicy.findOneAndUpdate(
    { _id: pending._id, status: 'pending' },
    { $set: { status: 'active', insurerPolicyNumber: parsed.data.insurerPolicyNumber, issuedBy: req.user!.userId, issuedAt: new Date().toISOString(), startDate, endDate: addMonths(startDate, pending.termMonths ?? 1) } },
    { returnDocument: 'after' },
  )
  if (!policy) { error(res, 'Policy is not awaiting issuance', 409); return }

  const premium = pending.premiumPaid ?? 0
  if (premium > 0) {
    try {
      await creditWallet(profile.userId, premium, { type: 'insurance_premium_received', reference: `INS-${pending.policyNumber}`, description: `Premium for policy ${parsed.data.insurerPolicyNumber}` })
    } catch (err) {
      await InsurancePolicy.updateOne({ _id: pending._id }, { $set: { status: 'pending', startDate: pending.startDate, endDate: pending.endDate }, $unset: { insurerPolicyNumber: 1, issuedBy: 1, issuedAt: 1 } })
      throw err
    }
  }
  await recordAudit(req, 'insurance.policy.issue', 'InsurancePolicy', pending._id.toString(), parsed.data)
  void notify({ userId: pending.userId, title: 'Insurance Policy Issued', message: `${profile.institutionName} issued your policy ${parsed.data.insurerPolicyNumber}. Cover runs to ${policy.endDate}.`, actionUrl: '/insurance' })
  success(res, { ...policy.toObject(), id: policy._id.toString() }, 'Policy issued')
}))

router.post('/me/policies/:id/decline', ...approvedProvider, asyncHandler(async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().min(3) }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const profile = await ownProfile(req.user!.userId)
  if (!profile) { error(res, 'Create your insurance provider profile before using this feature', 404); return }

  const policy = await InsurancePolicy.findOneAndUpdate(
    { _id: param(req.params.id), providerId: profile._id.toString(), status: 'pending' },
    { $set: { status: 'cancelled', declineReason: parsed.data.reason } },
    { returnDocument: 'after' },
  )
  if (!policy) { error(res, 'Policy is not awaiting issuance', 409); return }
  // The held premium never reached the insurer — return it.
  if ((policy.premiumPaid ?? 0) > 0) {
    await creditWallet(policy.userId, policy.premiumPaid!, { type: 'refund', reference: `INS-${policy.policyNumber}-DECLINED`, description: 'Insurance application declined — premium refunded' })
  }
  await recordAudit(req, 'insurance.policy.decline', 'InsurancePolicy', policy._id.toString(), parsed.data)
  void notify({ userId: policy.userId, title: 'Insurance Application Declined', message: `${profile.institutionName} declined your application: ${parsed.data.reason}. Your premium has been refunded.`, actionUrl: '/insurance' })
  success(res, { ...policy.toObject(), id: policy._id.toString() }, 'Application declined and refunded')
}))

router.post('/me/policies/:policyId/claims/:claimId/decide', ...approvedProvider, asyncHandler(async (req, res) => {
  const parsed = z.object({
    decision: z.enum(['approved', 'rejected']),
    notes: z.string().optional(),
    payoutAmount: z.number().positive().optional(),
  }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const profile = await ownProfile(req.user!.userId)
  if (!profile) { error(res, 'Create your insurance provider profile before using this feature', 404); return }

  try {
    const result = await decideClaim({
      policyId: param(req.params.policyId),
      claimId: param(req.params.claimId),
      providerId: profile._id.toString(),
      decision: parsed.data.decision,
      notes: parsed.data.notes,
      payoutAmount: parsed.data.payoutAmount,
      decidedBy: req.user!.userId,
      source: 'provider',
      funding: { kind: 'provider_wallet', providerUserId: profile.userId },
    })
    await recordAudit(req, `insurance.claim.${parsed.data.decision}`, 'InsurancePolicy', param(req.params.policyId), { claimId: param(req.params.claimId), payoutAmount: parsed.data.payoutAmount })
    success(res, { policy: { ...result.policy.toObject(), id: result.policy._id.toString() }, claim: result.claim }, `Claim ${parsed.data.decision}`)
  } catch (err) {
    if (err instanceof ClaimDecisionError) { error(res, err.message, err.status); return }
    throw err
  }
}))

export default router
