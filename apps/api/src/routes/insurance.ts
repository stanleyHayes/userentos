import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate, requireRole, requirePermission } from '../middleware/auth.js'
import { InsuranceProduct } from '../models/InsuranceProduct.js'
import { InsurancePolicy } from '../models/InsurancePolicy.js'
import { InsuranceProviderProfile, verifiedInsuranceProviderIds } from '../models/InsuranceProviderProfile.js'
import { User } from '../models/User.js'
import { Wallet } from '../models/Wallet.js'
import { demoInsuranceEnabled } from '../bootstrapInsurance.js'
import { notify } from '../services/notify.js'
import { creditWallet, debitWallet } from '../services/payments/walletLedger.js'
import { decideClaim, remainingCoverage, ClaimDecisionError } from '../services/insuranceClaims.js'
import { recordAudit } from '../utils/audit.js'
import { round2 } from '../utils/money.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'

const router = Router()

const CATEGORIES = ['renters', 'landlord', 'rent_guarantee', 'property_damage', 'tenant_default'] as const
const MAX_TERM_MONTHS = 12

function genPolicyReference() {
  return `POL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function genClaimId() {
  return `CLM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

const idOf = <T extends { _id: unknown }>(doc: T) => ({ ...doc, id: (doc._id as Types.ObjectId).toString() })

function addMonths(isoDate: string, months: number) {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

/** Only an approved, licence-verified insurer's products are sold (demo products outside production). */
async function sellableFilter(): Promise<Record<string, unknown>> {
  const providerIds = [...await verifiedInsuranceProviderIds()]
  return {
    active: true,
    $or: [
      { providerId: { $in: providerIds }, isDemo: { $ne: true } },
      ...(demoInsuranceEnabled() ? [{ isDemo: true }] : []),
    ],
  }
}

async function verifiedProvider(providerId: string) {
  const ids = await verifiedInsuranceProviderIds()
  if (!ids.has(providerId)) return null
  return InsuranceProviderProfile.findById(providerId).lean()
}

// ─── Products ───

// List sellable products (auth required, optional category filter)
router.get('/products', authenticate, async (req, res) => {
  const userRoles = req.user?.roles ?? []
  const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin')
  // Admin sees everything (including unsellable) when ?all=true
  const filter: Record<string, unknown> = isAdmin && req.query.all === 'true' ? {} : await sellableFilter()
  const category = req.query.category as string | undefined
  if (category && CATEGORIES.includes(category as typeof CATEGORIES[number])) filter.category = category

  const products = await InsuranceProduct.find(filter).sort({ category: 1, monthlyPremium: 1 }).lean()
  const items = products.map(idOf)
  success(res, { items, total: items.length })
})

const adminProductSchema = z.object({
  providerId: z.string().min(1),
  productName: z.string().min(1),
  category: z.enum(CATEGORIES),
  description: z.string().min(1),
  coverageDetails: z.string().min(1),
  monthlyPremium: z.number().positive(),
  coverageLimit: z.number().positive(),
  excessAmount: z.number().min(0).default(0),
  terms: z.string().default(''),
  active: z.boolean().default(true),
  commissionPct: z.number().min(0).max(15).default(5),
})

// Create product (admin) — only on behalf of an approved, licence-verified insurer.
router.post('/products', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = adminProductSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const provider = await verifiedProvider(parsed.data.providerId)
  if (!provider) { error(res, 'Products must belong to an approved insurer with a verified licence'); return }

  const product = await InsuranceProduct.create({ ...parsed.data, providerName: provider.institutionName })
  await recordAudit(req, 'insurance.product.create', 'InsuranceProduct', product._id.toString())
  success(res, idOf(product.toObject() as { _id: unknown }), 'Insurance product created', 201)
})

// Update product (admin)
router.patch('/products/:id', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = adminProductSchema.omit({ providerId: true }).partial().safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const existing = await InsuranceProduct.findById(param(req.params.id)).lean()
  if (!existing) { error(res, 'Product not found', 404); return }
  if (parsed.data.active && !existing.isDemo && !await verifiedProvider(existing.providerId)) {
    error(res, 'This insurer is not approved with a verified licence, so its products cannot be activated'); return
  }

  const product = await InsuranceProduct.findByIdAndUpdate(existing._id, { $set: parsed.data }, { returnDocument: 'after' })
  if (!product) { error(res, 'Product not found', 404); return }
  await recordAudit(req, 'insurance.product.update', 'InsuranceProduct', product._id.toString())
  success(res, idOf(product.toObject() as { _id: unknown }), 'Product updated')
})

// ─── Policies ───

// List my policies
router.get('/policies', authenticate, async (req, res) => {
  const policies = await InsurancePolicy.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).lean()
  success(res, { items: policies.map(idOf), total: policies.length })
})

// Apply for a policy. The whole term's premium is paid now (one monthly premium
// never buys a longer term) and held until the insurer issues the policy.
router.post('/policies', authenticate, async (req, res) => {
  const schema = z.object({
    productId: z.string(),
    agreementId: z.string().optional(),
    propertyId: z.string().optional(),
    termMonths: z.number().int().min(1).max(MAX_TERM_MONTHS).default(12),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const { productId, agreementId, propertyId, termMonths } = parsed.data
  const userId = req.user!.userId

  const product = await InsuranceProduct.findOne({ _id: productId, ...await sellableFilter() }).lean()
  if (!product) { error(res, 'Insurance product is unavailable'); return }

  const premiumTotal = round2(product.monthlyPremium * termMonths)
  const startDate = new Date().toISOString().slice(0, 10)
  const policyNumber = genPolicyReference()
  const reference = `INS-${policyNumber}`

  const debited = await debitWallet(userId, premiumTotal, { type: 'insurance_premium', reference, description: `Insurance premium (${termMonths} months) — ${product.productName}` })
  if (!debited) {
    const exists = await Wallet.exists({ userId })
    if (!exists) { error(res, 'Wallet not found. Please set up your wallet first.', 404); return }
    error(res, `Insufficient wallet balance. You need GHS ${premiumTotal.toFixed(2)} for ${termMonths} months of cover.`)
    return
  }

  // Demo products have no insurer behind them, so they activate at once.
  const policy = await InsurancePolicy.create({
    userId,
    productId: product._id.toString(),
    providerId: product.providerId,
    agreementId,
    propertyId,
    startDate,
    endDate: addMonths(startDate, termMonths),
    monthlyPremium: product.monthlyPremium,
    termMonths,
    premiumPaid: premiumTotal,
    status: product.isDemo ? 'active' : 'pending',
    ...(product.isDemo ? { insurerPolicyNumber: `DEMO-${policyNumber}`, issuedAt: new Date().toISOString() } : {}),
    lastPaidAt: new Date().toISOString(),
    policyNumber,
    claims: [],
  }).catch(async () => {
    await creditWallet(userId, premiumTotal, { type: 'refund', reference: `${reference}-REV`, description: 'Reversal of failed policy application' })
    return null
  })
  if (!policy) { error(res, 'Could not create policy; your wallet has been refunded.', 500); return }

  void notify({
    userId,
    title: product.isDemo ? 'Demo Policy Active' : 'Insurance Application Sent',
    message: product.isDemo
      ? `Demo policy ${policyNumber} is active. This is test data, not real cover.`
      : `Your application for ${product.productName} (${policyNumber}) was sent to ${product.providerName}. GHS ${premiumTotal.toFixed(2)} is held until they issue the policy; if they decline, it is refunded.`,
    actionUrl: '/insurance',
  })

  const wallet = await Wallet.findOne({ userId }).lean()
  success(res, { policy: idOf(policy.toObject() as { _id: unknown }), wallet: { balance: wallet?.balance ?? 0 } },
    product.isDemo ? 'Demo policy activated' : 'Application sent to the insurer', 201)
})

// File a claim — only for a loss inside the paid-for cover period and within the cover.
router.post('/policies/:id/claim', authenticate, async (req, res) => {
  const schema = z.object({
    amount: z.number().positive(),
    description: z.string().min(10),
    incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date of the incident'),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const policy = await InsurancePolicy.findById(param(req.params.id))
  if (!policy) { error(res, 'Policy not found', 404); return }
  if (policy.userId !== req.user!.userId) { error(res, 'Not authorized', 403); return }
  if (policy.status !== 'active' && policy.status !== 'claimed') {
    error(res, 'Claims can only be filed on active policies')
    return
  }

  const { incidentDate, amount } = parsed.data
  const today = new Date().toISOString().slice(0, 10)
  if (incidentDate > today) { error(res, 'The incident date cannot be in the future'); return }
  if (incidentDate < policy.startDate || incidentDate > policy.endDate) {
    error(res, `The incident must fall within the cover period (${policy.startDate} to ${policy.endDate})`); return
  }
  const product = await InsuranceProduct.findById(policy.productId).select('coverageLimit').lean()
  const remaining = product ? remainingCoverage(policy, product.coverageLimit) : 0
  if (amount > remaining) { error(res, `The claim exceeds the cover remaining on this policy (GHS ${remaining.toFixed(2)})`); return }

  const claim = {
    id: genClaimId(),
    filedAt: new Date().toISOString(),
    incidentDate,
    amount,
    status: 'pending' as const,
    description: parsed.data.description,
  }
  policy.claims.push(claim)
  policy.status = 'claimed'
  await policy.save()

  void notify({
    userId: req.user!.userId,
    title: 'Claim Filed',
    message: `Claim ${claim.id} for GHS ${claim.amount.toFixed(2)} was sent to your insurer for a decision.`,
    actionUrl: '/insurance',
  })

  success(res, { policy: idOf(policy.toObject() as { _id: unknown }), claim }, 'Claim filed', 201)
})

// ─── Admin Claims Review ───

// List all claims across policies, with applicant + product enrichment.
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
        insurerPolicyNumber: p.insurerPolicyNumber,
        policyHolderId: p.userId,
        policyHolderName: u ? `${u.firstName} ${u.lastName}` : undefined,
        policyHolderEmail: u?.email,
        productId: p.productId,
        productName: prod?.productName,
        providerName: prod?.providerName,
        category: prod?.category,
        coverageLimit: prod?.coverageLimit,
        remainingCoverage: prod ? remainingCoverage(p, prod.coverageLimit, c.id) : undefined,
      })
    }
  }

  // Sort newest first
  items.sort((a, b) => String(b.filedAt).localeCompare(String(a.filedAt)))

  success(res, { items, total: items.length })
})

// Record the insurer's decision on a claim. The decision is the insurer's; the
// admin supplies the insurer's decision reference and, for a payout, the reference
// of the settlement the insurer sent — the wallet credit is backed by that money.
router.post('/policies/:policyId/claims/:claimId/decide', authenticate, requireRole('admin', 'super_admin'), requirePermission('insurance:review_claims'), async (req, res) => {
  const schema = z.object({
    decision: z.enum(['approved', 'rejected']),
    providerReference: z.string().trim().min(3, 'Enter the insurer’s decision reference'),
    notes: z.string().optional(),
    payoutAmount: z.number().positive().optional(),
    settlementReference: z.string().trim().min(3).max(120).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  if (parsed.data.decision === 'approved' && !parsed.data.settlementReference) {
    error(res, 'Enter the reference of the insurer’s payout settlement'); return
  }

  try {
    const result = await decideClaim({
      policyId: param(req.params.policyId),
      claimId: param(req.params.claimId),
      decision: parsed.data.decision,
      notes: parsed.data.notes,
      payoutAmount: parsed.data.payoutAmount,
      decidedBy: req.user!.userId,
      source: 'admin_recorded',
      providerReference: parsed.data.providerReference,
      funding: parsed.data.settlementReference ? { kind: 'external_settlement', settlementReference: parsed.data.settlementReference } : undefined,
    })
    await recordAudit(req, `insurance.claim.record_${parsed.data.decision}`, 'InsurancePolicy', param(req.params.policyId), { claimId: param(req.params.claimId), providerReference: parsed.data.providerReference, settlementReference: parsed.data.settlementReference })
    success(res, { policy: idOf(result.policy.toObject() as { _id: unknown }), claim: result.claim }, `Insurer decision recorded: ${parsed.data.decision}`)
  } catch (err) {
    if (err instanceof ClaimDecisionError) { error(res, err.message, err.status); return }
    throw err
  }
})

export default router
