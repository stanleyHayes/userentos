import { Router } from 'express'
import type { Types } from 'mongoose'
import { z } from 'zod'
import { authenticate, requireRole, requirePermission } from '../middleware/auth.js'
import { Investment } from '../models/Investment.js'
import { InvestmentPartner } from '../models/InvestmentPartner.js'
import { InvestmentProduct } from '../models/InvestmentProduct.js'
import { Wallet } from '../models/Wallet.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { recordAudit } from '../utils/audit.js'
import { creditWallet, debitWallet } from '../services/payments/walletLedger.js'
import { round2 } from '../utils/money.js'

const router = Router()

/*
 * RentOS is not an investment firm. Products are configured by an admin against a
 * partner whose licence was checked with the regulator; the partner holds the money
 * and pays any return. A wallet credit only ever follows a settlement the partner
 * actually made, recorded with its reference — never an automatic platform payout.
 */

const DISCLAIMER = 'Investments are placed with, and held by, the regulated partner named on each product — not by RentOS. '
  + 'Returns are not guaranteed: rates shown are the partner\'s indicative rates, the value of an investment can fall, and early redemption may return less than you put in. '
  + 'Your money is paid out only when the partner settles.'

// Admin actions that move money or define what is sold.
const admin = [requireRole('admin', 'super_admin'), requirePermission('payments:process')]

const idOf = <T extends { _id: unknown }>(doc: T) => ({ ...doc, id: (doc._id as Types.ObjectId).toString() })
const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000

async function verifiedPartners(ids?: string[]) {
  return InvestmentPartner.find({ active: true, verifiedAt: { $exists: true }, ...(ids ? { _id: { $in: ids } } : {}) }).lean()
}

// Products currently on offer — only those of an active, verified partner.
router.get('/options', authenticate, async (_req, res) => {
  const products = await InvestmentProduct.find({ active: true }).lean()
  const partners = products.length ? await verifiedPartners([...new Set(products.map((p) => p.partnerId))]) : []
  const partnerMap = new Map(partners.map((p) => [p._id.toString(), p]))
  const items = products
    .filter((p) => partnerMap.has(p.partnerId))
    .map((p) => {
      const partner = partnerMap.get(p.partnerId)!
      return { ...idOf(p), partnerName: partner.name, regulator: partner.regulator, partnerLicenseNumber: partner.licenseNumber }
    })
  success(res, { products: items, disclaimer: DISCLAIMER })
})

// Get my investments
router.get('/', authenticate, async (req, res) => {
  const investments = await Investment.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).lean()
  const items = investments.map(idOf)
  success(res, { items, total: items.length, page: 1, pageSize: 50, totalPages: 1 })
})

// Place an order. Funds leave the wallet for the partner; the order stays
// pending until an admin records the partner's confirmation.
router.post('/', authenticate, async (req, res) => {
  const schema = z.object({
    productId: z.string().min(1),
    amount: z.number().positive(),
    riskDisclosureAccepted: z.boolean().refine((v) => v, 'You must accept the risk disclosure'),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const { productId, amount } = parsed.data

  const product = await InvestmentProduct.findOne({ _id: productId, active: true }).lean()
  const partner = product ? await InvestmentPartner.findOne({ _id: product.partnerId, active: true, verifiedAt: { $exists: true } }).lean() : null
  if (!product || !partner) { error(res, 'This investment product is not available'); return }
  if (amount < product.minAmount) { error(res, `The minimum for this product is GHS ${product.minAmount}`); return }

  const indicativeRate = product.indicativeAnnualRate ?? 0
  const now = new Date()
  const maturityDate = new Date(now.getTime() + product.tenureDays * 24 * 60 * 60 * 1000)
  const reference = `INV-${Date.now()}`

  // Debit first; the investment create below refunds on failure.
  const debited = await debitWallet(req.user!.userId, amount, {
    type: 'investment_order',
    reference,
    description: `Investment order: ${product.name} with ${partner.name}`,
  })
  if (!debited) {
    const exists = await Wallet.exists({ userId: req.user!.userId })
    error(res, exists ? 'Insufficient wallet balance' : 'Wallet not found', exists ? 400 : 404)
    return
  }

  const investment = await Investment.create({
    userId: req.user!.userId,
    type: product.type,
    amount,
    interestRate: indicativeRate,
    tenure: product.tenureDays,
    startDate: now.toISOString(),
    maturityDate: maturityDate.toISOString(),
    status: 'pending',
    expectedReturn: round2(amount * (indicativeRate / 100) * (product.tenureDays / 365)),
    partnerId: partner._id.toString(),
    productId: product._id.toString(),
    partnerName: partner.name,
  }).catch(async () => {
    await creditWallet(req.user!.userId, amount, { type: 'refund', reference: `${reference}-REV`, description: 'Reversal of failed investment order' })
    return null
  })
  if (!investment) { error(res, 'Could not place the order; your wallet has been refunded.', 500); return }

  const wallet = await Wallet.findOne({ userId: req.user!.userId }).lean()
  success(res, { investment: idOf(investment.toObject() as { _id: unknown }), wallet: { balance: wallet?.balance ?? 0 } }, `Order sent to ${partner.name} — pending their confirmation`, 201)
})

// Investor: ask the partner to redeem. Nothing is paid here — the partner settles.
router.post('/:id/withdraw', authenticate, async (req, res) => {
  const claimed = await Investment.findOneAndUpdate(
    { _id: param(req.params.id), userId: req.user!.userId, status: 'active' },
    { $set: { status: 'redemption_requested', redemptionRequestedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!claimed) { error(res, 'Only an active investment can be redeemed', 409); return }
  success(res, { investment: idOf(claimed.toObject() as { _id: unknown }) }, 'Redemption requested — you will be paid when the partner settles')
})

// ─── Admin: partners, products, and recording what partners actually did ───

router.get('/partners', authenticate, ...admin, async (_req, res) => {
  const partners = await InvestmentPartner.find().sort({ createdAt: -1 }).lean()
  success(res, { items: partners.map(idOf), total: partners.length })
})

// The admin attests they checked this licence with the regulator.
router.post('/partners', authenticate, ...admin, async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2), regulator: z.enum(['SEC', 'BoG']), licenseNumber: z.string().trim().min(3) }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const partner = await InvestmentPartner.create({ ...parsed.data, verifiedBy: req.user!.userId, verifiedAt: new Date(), active: true })
  await recordAudit(req, 'investment.partner.verify', 'InvestmentPartner', partner._id.toString(), parsed.data)
  success(res, idOf(partner.toObject() as { _id: unknown }), 'Partner recorded', 201)
})

router.post('/partners/:id/deactivate', authenticate, ...admin, async (req, res) => {
  const partner = await InvestmentPartner.findOneAndUpdate({ _id: param(req.params.id) }, { $set: { active: false } }, { returnDocument: 'after' })
  if (!partner) { error(res, 'Partner not found', 404); return }
  await recordAudit(req, 'investment.partner.deactivate', 'InvestmentPartner', partner._id.toString())
  success(res, idOf(partner.toObject() as { _id: unknown }))
})

const productSchema = z.object({
  partnerId: z.string().min(1),
  name: z.string().trim().min(2),
  type: z.enum(['treasury_bill', 'government_bond']),
  tenureDays: z.number().int().positive(),
  indicativeAnnualRate: z.number().min(0).max(100).optional(),
  minAmount: z.number().positive(),
  description: z.string().default(''),
  riskWarning: z.string().trim().min(10),
  active: z.boolean().default(false),
})

router.post('/products', authenticate, ...admin, async (req, res) => {
  const parsed = productSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const [partner] = await verifiedPartners([parsed.data.partnerId])
  if (!partner) { error(res, 'Products must belong to an active, verified partner'); return }
  const product = await InvestmentProduct.create(parsed.data)
  await recordAudit(req, 'investment.product.create', 'InvestmentProduct', product._id.toString())
  success(res, idOf(product.toObject() as { _id: unknown }), 'Product created', 201)
})

router.patch('/products/:id', authenticate, ...admin, async (req, res) => {
  const parsed = productSchema.omit({ partnerId: true }).partial().safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const product = await InvestmentProduct.findOneAndUpdate({ _id: param(req.params.id) }, { $set: parsed.data }, { returnDocument: 'after' })
  if (!product) { error(res, 'Product not found', 404); return }
  await recordAudit(req, 'investment.product.update', 'InvestmentProduct', product._id.toString())
  success(res, idOf(product.toObject() as { _id: unknown }))
})

// Orders and redemptions waiting on a partner.
router.get('/admin/pending', authenticate, ...admin, async (_req, res) => {
  const items = await Investment.find({ status: { $in: ['pending', 'redemption_requested'] } }).sort({ createdAt: 1 }).lean()
  success(res, { items: items.map(idOf), total: items.length })
})

router.post('/:id/confirm', authenticate, ...admin, async (req, res) => {
  const parsed = z.object({ partnerReference: z.string().trim().min(3) }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const existing = await Investment.findById(param(req.params.id)).lean()
  if (!existing) { error(res, 'Investment not found', 404); return }
  // Tenure runs from the partner's placement, not from the order.
  const start = new Date()
  const maturity = new Date(start.getTime() + existing.tenure * 24 * 60 * 60 * 1000)
  const investment = await Investment.findOneAndUpdate(
    { _id: existing._id, status: 'pending' },
    { $set: { status: 'active', partnerReference: parsed.data.partnerReference, confirmedBy: req.user!.userId, confirmedAt: start, startDate: start.toISOString(), maturityDate: maturity.toISOString() } },
    { returnDocument: 'after' },
  )
  if (!investment) { error(res, 'Investment is not awaiting confirmation', 409); return }
  await recordAudit(req, 'investment.confirm', 'Investment', investment._id.toString(), parsed.data)
  success(res, idOf(investment.toObject() as { _id: unknown }), 'Placement confirmed')
})

router.post('/:id/reject', authenticate, ...admin, async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().min(3) }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const investment = await Investment.findOneAndUpdate(
    { _id: param(req.params.id), status: 'pending' },
    { $set: { status: 'rejected', rejectionReason: parsed.data.reason } },
    { returnDocument: 'after' },
  )
  if (!investment) { error(res, 'Investment is not awaiting confirmation', 409); return }
  // The order never reached the partner — return the investor's own money.
  await creditWallet(investment.userId, investment.amount, { type: 'refund', reference: `INV-REJ-${investment._id.toString()}`, description: 'Investment order declined by partner' })
  await recordAudit(req, 'investment.reject', 'Investment', investment._id.toString(), parsed.data)
  success(res, idOf(investment.toObject() as { _id: unknown }), 'Order rejected and refunded')
})

// Record the partner's payout (maturity or redemption) and pass it to the investor.
router.post('/:id/settle', authenticate, ...admin, async (req, res) => {
  const parsed = z.object({ settlementReference: z.string().trim().min(3).max(120), amount: z.number().positive() }).safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }
  const existing = await Investment.findById(param(req.params.id)).lean()
  if (!existing) { error(res, 'Investment not found', 404); return }

  const amount = round2(parsed.data.amount)
  const matured = new Date() >= new Date(existing.maturityDate)
  let claimed
  try {
    claimed = await Investment.findOneAndUpdate(
      { _id: existing._id, status: { $in: ['active', 'redemption_requested'] }, settlementReference: { $exists: false } },
      { $set: {
        status: matured ? 'matured' : 'withdrawn',
        settlementReference: parsed.data.settlementReference,
        settledAmount: amount,
        actualReturn: round2(amount - existing.amount),
        settledBy: req.user!.userId,
        settledAt: new Date(),
      } },
      { returnDocument: 'after' },
    )
  } catch (err) {
    if (isDuplicateKey(err)) { error(res, 'That settlement reference has already been used', 409); return }
    throw err
  }
  if (!claimed) { error(res, 'Investment is not awaiting settlement', 409); return }

  try {
    await creditWallet(existing.userId, amount, {
      type: 'investment_settlement',
      reference: parsed.data.settlementReference,
      description: `${existing.partnerName ?? 'Partner'} settlement: ${existing.type.replace('_', ' ')}`,
    })
  } catch (err) {
    await Investment.updateOne({ _id: existing._id }, { $set: { status: existing.status }, $unset: { settlementReference: 1, settledAmount: 1, actualReturn: 1, settledBy: 1, settledAt: 1 } })
    throw err
  }
  await recordAudit(req, 'investment.settle', 'Investment', existing._id.toString(), { ...parsed.data, amount })
  success(res, idOf(claimed.toObject() as { _id: unknown }), 'Settlement recorded')
})

export default router
