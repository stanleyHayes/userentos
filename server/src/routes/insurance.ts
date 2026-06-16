import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate, requireRole, requirePermission } from '../middleware/auth.js'
import { InsuranceProduct } from '../models/InsuranceProduct.js'
import { InsurancePolicy } from '../models/InsurancePolicy.js'
import { User } from '../models/User.js'
import { Wallet } from '../models/Wallet.js'
import { notify } from '../services/notify.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

const CATEGORIES = ['renters', 'landlord', 'rent_guarantee', 'property_damage', 'tenant_default'] as const

function genPolicyNumber() {
  return `POL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function genClaimId() {
  return `CLM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

// ─── Products ───

// List active products (auth required, optional category filter)
router.get('/products', authenticate, async (req, res) => {
  const filter: Record<string, unknown> = { active: true }
  const category = req.query.category as string | undefined
  if (category && CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    filter.category = category
  }
  // Admin sees all (active + inactive) when ?all=true
  const userRoles = req.user?.roles ?? []
  const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin')
  if (isAdmin && req.query.all === 'true') {
    delete filter.active
  }

  const products = await InsuranceProduct.find(filter).sort({ category: 1, monthlyPremium: 1 }).lean()
  const items = products.map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() }))
  success(res, { items, total: items.length })
})

// Create product (admin/super_admin only)
router.post('/products', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  const schema = z.object({
    providerId: z.string().min(1),
    providerName: z.string().min(1),
    productName: z.string().min(1),
    category: z.enum(['renters', 'landlord', 'rent_guarantee', 'property_damage', 'tenant_default']),
    description: z.string().min(1),
    coverageDetails: z.string().min(1),
    monthlyPremium: z.number().min(0),
    coverageLimit: z.number().min(0),
    excessAmount: z.number().min(0).default(0),
    terms: z.string().default(''),
    active: z.boolean().default(true),
    commissionPct: z.number().min(0).max(15).default(5),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

  const product = await InsuranceProduct.create(parsed.data)
  success(res, { ...product.toObject(), id: product._id.toString() }, 'Insurance product created', 201)
})

// Update product (admin/super_admin only)
router.patch('/products/:id', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  const schema = z.object({
    providerName: z.string().optional(),
    productName: z.string().optional(),
    category: z.enum(['renters', 'landlord', 'rent_guarantee', 'property_damage', 'tenant_default']).optional(),
    description: z.string().optional(),
    coverageDetails: z.string().optional(),
    monthlyPremium: z.number().min(0).optional(),
    coverageLimit: z.number().min(0).optional(),
    excessAmount: z.number().min(0).optional(),
    terms: z.string().optional(),
    active: z.boolean().optional(),
    commissionPct: z.number().min(0).max(15).optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

  const product = await InsuranceProduct.findByIdAndUpdate(param(req.params.id), parsed.data, { new: true })
  if (!product) { error(res, 'Product not found', 404); return }

  success(res, { ...product.toObject(), id: product._id.toString() }, 'Product updated')
})

// ─── Policies ───

// List my policies
router.get('/policies', authenticate, async (req, res) => {
  const policies = await InsurancePolicy.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).lean()
  const items = policies.map((p) => ({ ...p, id: (p._id as Types.ObjectId).toString() }))
  success(res, { items, total: items.length })
})

// Buy policy (auth) — debits first premium from wallet
router.post('/policies', authenticate, async (req, res) => {
  const schema = z.object({
    productId: z.string(),
    agreementId: z.string().optional(),
    propertyId: z.string().optional(),
    termMonths: z.number().int().min(1).max(36).default(12),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

  const { productId, agreementId, propertyId, termMonths } = parsed.data

  const product = await InsuranceProduct.findById(productId)
  if (!product || !product.active) { error(res, 'Insurance product is unavailable'); return }

  const premium = product.monthlyPremium
  const now = new Date()
  const startDate = now.toISOString().slice(0, 10)
  const endDt = new Date(now)
  endDt.setMonth(endDt.getMonth() + termMonths)
  const endDate = endDt.toISOString().slice(0, 10)
  const policyNumber = genPolicyNumber()
  const ref = `INS-${policyNumber}`

  // Atomic conditional debit — single operation that only succeeds when the
  // balance covers the premium, so concurrent purchases can't double-spend or
  // drive the balance negative (previously a read-then-write race).
  const wallet = await Wallet.findOneAndUpdate(
    { userId: req.user!.userId, balance: { $gte: premium } },
    { $inc: { balance: -premium } },
    { new: true },
  )
  if (!wallet) {
    const exists = await Wallet.exists({ userId: req.user!.userId })
    if (!exists) { error(res, 'Wallet not found. Please set up your wallet first.', 404); return }
    error(res, `Insufficient wallet balance. You need GHS ${premium.toFixed(2)} for the first premium.`)
    return
  }

  // Create + activate the policy. If this fails, refund the debit so the user is
  // never charged without a policy (previously a partial-failure lost the money).
  const policy = await InsurancePolicy.create({
    userId: req.user!.userId,
    productId: product._id.toString(),
    agreementId,
    propertyId,
    startDate,
    endDate,
    monthlyPremium: premium,
    status: 'active',
    lastPaidAt: new Date().toISOString(),
    policyNumber,
    claims: [],
  }).catch(async () => {
    await Wallet.updateOne({ userId: req.user!.userId }, { $inc: { balance: premium } })
    return null
  })
  if (!policy) { error(res, 'Could not create policy; your wallet has been refunded.', 500); return }

  // Record the ledger entry atomically (balanceAfter reflects the atomic debit).
  await Wallet.updateOne(
    { userId: req.user!.userId },
    { $push: { transactions: {
      type: 'withdrawal',
      amount: premium,
      balanceAfter: wallet.balance,
      reference: ref,
      description: `Insurance premium — ${product.productName}`,
      createdAt: new Date().toISOString(),
    } } },
  )

  notify({
    userId: req.user!.userId,
    title: 'Insurance Policy Active',
    message: `Your ${product.productName} policy (${policyNumber}) is now active. First premium of GHS ${product.monthlyPremium.toFixed(2)} debited.`,
    actionUrl: '/insurance',
  })

  success(
    res,
    {
      policy: { ...policy.toObject(), id: policy._id.toString() },
      wallet: { balance: wallet.balance },
    },
    'Policy purchased and activated',
    201,
  )
})

// File a claim
router.post('/policies/:id/claim', authenticate, async (req, res) => {
  const schema = z.object({
    amount: z.number().min(1),
    description: z.string().min(10),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

  const policy = await InsurancePolicy.findById(param(req.params.id))
  if (!policy) { error(res, 'Policy not found', 404); return }
  if (policy.userId !== req.user!.userId) { error(res, 'Not authorized', 403); return }
  if (policy.status !== 'active' && policy.status !== 'claimed') {
    error(res, 'Claims can only be filed on active policies')
    return
  }

  const claim = {
    id: genClaimId(),
    filedAt: new Date().toISOString(),
    amount: parsed.data.amount,
    status: 'pending' as const,
    description: parsed.data.description,
  }
  policy.claims.push(claim)
  policy.status = 'claimed'
  await policy.save()

  notify({
    userId: req.user!.userId,
    title: 'Claim Filed',
    message: `Claim ${claim.id} for GHS ${claim.amount.toFixed(2)} has been received and is pending review.`,
    actionUrl: '/insurance',
  })

  success(
    res,
    { policy: { ...policy.toObject(), id: policy._id.toString() }, claim },
    'Claim filed',
    201,
  )
})

// ─── Admin Claims Review ───

// List all claims across policies, with applicant + product enrichment.
// Restricted to admin/super_admin via requireRole + requirePermission.
router.get('/claims', authenticate, requireRole('admin', 'super_admin'), requirePermission('insurance:review_claims'), async (req, res) => {
  const statusFilter = req.query.status as string | undefined

  const policies = await InsurancePolicy.find({ 'claims.0': { $exists: true } }).lean()

  const userIds = [...new Set(policies.map((p) => p.userId))]
  const productIds = [...new Set(policies.map((p) => p.productId))]

  const [users, products] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select('firstName lastName email').lean(),
    InsuranceProduct.find({ _id: { $in: productIds } }).select('productName providerName category coverageLimit').lean(),
  ])

  const userMap = new Map(users.map((u) => [u._id.toString(), u]))
  const productMap = new Map(products.map((p) => [(p._id as { toString(): string }).toString(), p]))

  const items: Record<string, unknown>[] = []
  for (const p of policies) {
    const u = userMap.get(p.userId)
    const prod = productMap.get(p.productId)
    for (const c of p.claims) {
      if (statusFilter && c.status !== statusFilter) continue
      items.push({
        ...c,
        policyId: (p._id as { toString(): string }).toString(),
        policyNumber: p.policyNumber,
        policyHolderId: p.userId,
        policyHolderName: u ? `${u.firstName} ${u.lastName}` : undefined,
        policyHolderEmail: u?.email,
        productId: p.productId,
        productName: prod?.productName,
        providerName: prod?.providerName,
        category: prod?.category,
        coverageLimit: prod?.coverageLimit,
      })
    }
  }

  // Sort newest first
  items.sort((a, b) => String(b.filedAt).localeCompare(String(a.filedAt)))

  success(res, { items, total: items.length })
})

// Approve or reject a claim
router.post('/policies/:policyId/claims/:claimId/decide', authenticate, requireRole('admin', 'super_admin'), requirePermission('insurance:review_claims'), async (req, res) => {
  const schema = z.object({
    decision: z.enum(['approved', 'rejected']),
    notes: z.string().optional(),
    payoutAmount: z.number().min(0).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.errors[0].message); return }

  const policy = await InsurancePolicy.findById(param(req.params.policyId))
  if (!policy) { error(res, 'Policy not found', 404); return }

  const existing = policy.claims.find((c) => c.id === req.params.claimId)
  if (!existing) { error(res, 'Claim not found', 404); return }
  if (existing.status !== 'pending') { error(res, `Claim is already ${existing.status}`); return }

  const decidedAt = new Date().toISOString()
  const payoutAmount = parsed.data.decision === 'approved'
    ? (parsed.data.payoutAmount ?? existing.amount)
    : undefined

  // Atomically decide the still-pending claim. Only one concurrent/duplicate
  // request can match the { status: 'pending' } array element, so the payout
  // below runs at most once — no double-payout under concurrency or retry.
  const setFields: Record<string, unknown> = {
    'claims.$.status': parsed.data.decision,
    'claims.$.notes': parsed.data.notes,
    'claims.$.decidedBy': req.user!.userId,
    'claims.$.decidedAt': decidedAt,
  }
  if (payoutAmount !== undefined) setFields['claims.$.payoutAmount'] = payoutAmount

  const claimed = await InsurancePolicy.findOneAndUpdate(
    { _id: policy._id, claims: { $elemMatch: { id: req.params.claimId, status: 'pending' } } },
    { $set: setFields },
    { new: true },
  )
  if (!claimed) { error(res, 'Claim is no longer pending', 409); return }

  // If no pending claims remain and the policy was in 'claimed', return it to active.
  if (claimed.status === 'claimed' && !claimed.claims.some((c) => c.status === 'pending')) {
    await InsurancePolicy.updateOne({ _id: policy._id }, { $set: { status: 'active' } })
    claimed.status = 'active'
  }

  const product = await InsuranceProduct.findById(claimed.productId).select('productName').lean()
  const claim = claimed.claims.find((c) => c.id === req.params.claimId)!

  // On approval, disburse the payout. The atomic decision above guarantees this
  // runs at most once per claim.
  if (parsed.data.decision === 'approved') {
    const payout = payoutAmount ?? claim.amount
    try {
      const credited = await Wallet.findOneAndUpdate(
        { userId: claimed.userId },
        { $inc: { balance: payout } },
        { new: true, upsert: true },
      )
      await Wallet.updateOne(
        { userId: claimed.userId },
        { $push: { transactions: {
          type: 'deposit',
          amount: payout,
          balanceAfter: credited?.balance ?? payout,
          reference: `CLAIM-${claim.id}`,
          description: `Insurance claim payout — ${product?.productName ?? 'policy'}`,
          createdAt: new Date().toISOString(),
        } } },
      )
    } catch (e) {
      console.error(`[insurance] claim ${claim.id} approved but payout credit FAILED:`, (e as Error).message)
    }
  }

  try {
    if (parsed.data.decision === 'approved') {
      await notify({
        userId: claimed.userId,
        title: 'Insurance Claim Approved',
        message: `Your claim ${claim.id} on policy ${claimed.policyNumber} (${product?.productName ?? 'policy'}) was approved for GHS ${(claim.payoutAmount ?? claim.amount).toFixed(2)}.${parsed.data.notes ? ` Notes: ${parsed.data.notes}` : ''}`,
        actionUrl: '/insurance',
      })
    } else {
      await notify({
        userId: claimed.userId,
        title: 'Insurance Claim Rejected',
        message: `Your claim ${claim.id} on policy ${claimed.policyNumber} (${product?.productName ?? 'policy'}) was rejected.${parsed.data.notes ? ` Notes: ${parsed.data.notes}` : ''}`,
        actionUrl: '/insurance',
      })
    }
  } catch (e) {
    console.warn('[insurance] notify failed:', (e as Error).message)
  }

  success(res, {
    policy: { ...claimed.toObject(), id: claimed._id.toString() },
    claim,
  }, `Claim ${parsed.data.decision}`)
})

export default router
