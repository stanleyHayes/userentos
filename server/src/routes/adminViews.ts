import { Router } from 'express'
import type { Types } from 'mongoose'
import { authenticate, requireRole, requirePermission } from '../middleware/auth.js'
import { FinancingContract } from '../models/FinancingContract.js'
import { Employer } from '../models/Employer.js'
import { Employment } from '../models/Employment.js'
import { DeductionMandate } from '../models/DeductionMandate.js'
import { MaintenanceRequest } from '../models/MaintenanceRequest.js'
import { InsurancePolicy } from '../models/InsurancePolicy.js'
import { InsuranceProduct } from '../models/InsuranceProduct.js'
import { Property } from '../models/Property.js'
import { User } from '../models/User.js'
import { success, error } from '../utils/response.js'

const router = Router()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const idOf = (doc: any) => ({ ...doc, id: (doc._id ?? doc.id).toString() })

// ────────────────────────────────────────
// Pagination helpers
// ────────────────────────────────────────

function parsePage(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

function parsePageSize(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 50
  return Math.min(Math.floor(n), 200)
}

// Admin gate middleware list — applied to every route below
const adminAuth = authenticate
const adminRole = requireRole('admin', 'super_admin')
const adminPerm = requirePermission('analytics:view')

// ────────────────────────────────────────
// Helpers — batch user / property name lookups
// ────────────────────────────────────────

async function batchUserNames(ids: Array<string | undefined>): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter((v): v is string => Boolean(v))))
  if (unique.length === 0) return {}
  const users = await User.find({ _id: { $in: unique } }).select('firstName lastName').lean()
  const map: Record<string, string> = {}
  for (const u of users) {
    map[(u._id as Types.ObjectId).toString()] = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
  }
  return map
}

async function batchPropertyTitles(ids: Array<string | undefined>): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter((v): v is string => Boolean(v))))
  if (unique.length === 0) return {}
  const props = await Property.find({ _id: { $in: unique } }).select('title').lean()
  const map: Record<string, string> = {}
  for (const p of props) {
    map[(p._id as Types.ObjectId).toString()] = (p as { title?: string }).title ?? ''
  }
  return map
}

// ────────────────────────────────────────
// 1. ADMIN — All financing contracts
// ────────────────────────────────────────

const FINANCING_STATUSES = [
  'pending_disbursement',
  'active',
  'in_grace',
  'in_arrears',
  'closed',
  'defaulted',
  'settled',
] as const

router.get('/financing/contracts', adminAuth, adminRole, adminPerm, async (req, res) => {
  const status = (req.query.status as string | undefined)?.trim()
  const filter: Record<string, unknown> = {}
  if (status) {
    if (!FINANCING_STATUSES.includes(status as typeof FINANCING_STATUSES[number])) {
      error(res, `Invalid status. Allowed: ${FINANCING_STATUSES.join(', ')}`); return
    }
    filter.status = status
  }
  const page = parsePage(req.query.page ?? 1)
  const pageSize = parsePageSize(req.query.pageSize ?? 50)
  const skip = (page - 1) * pageSize

  const [total, contracts] = await Promise.all([
    FinancingContract.countDocuments(filter),
    FinancingContract.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
  ])

  const userIds: string[] = []
  for (const c of contracts) {
    if (c.applicantId) userIds.push(c.applicantId.toString())
    if (c.financierId) userIds.push(c.financierId.toString())
  }
  const userNames = await batchUserNames(userIds)

  const items = contracts.map((c) => ({
    ...idOf(c),
    applicantName: c.applicantName ?? userNames[c.applicantId] ?? undefined,
    financierName: userNames[c.financierId] ?? undefined,
  }))

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  success(res, { items, total, page, pageSize, totalPages })
})

// ────────────────────────────────────────
// 2. ADMIN — All employers
// ────────────────────────────────────────

router.get('/employers', adminAuth, adminRole, adminPerm, async (req, res) => {
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.pageSize) || 20)))
  const skip = (page - 1) * pageSize

  const [total, employers] = await Promise.all([
    Employer.countDocuments({}),
    Employer.find({}).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
  ])

  const employerIds = employers.map((e) => (e._id as Types.ObjectId).toString())

  // Batch counts via aggregation
  const [employmentCounts, mandateCounts] = await Promise.all([
    Employment.aggregate([
      { $match: { employerId: { $in: employerIds }, status: 'active' } },
      { $group: { _id: '$employerId', count: { $sum: 1 } } },
    ]),
    DeductionMandate.aggregate([
      { $match: { employerId: { $in: employerIds }, status: 'active' } },
      { $group: { _id: '$employerId', count: { $sum: 1 } } },
    ]),
  ])

  const empMap: Record<string, number> = {}
  for (const row of employmentCounts) empMap[row._id] = row.count
  const mandateMap: Record<string, number> = {}
  for (const row of mandateCounts) mandateMap[row._id] = row.count

  const items = employers.map((e) => {
    const id = (e._id as Types.ObjectId).toString()
    return {
      ...idOf(e),
      activeEmployees: empMap[id] ?? 0,
      activeMandates: mandateMap[id] ?? 0,
    }
  })

  success(res, { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
})

// ────────────────────────────────────────
// 3. ADMIN — All maintenance requests
// ────────────────────────────────────────

const MAINTENANCE_STATUSES = [
  'requested',
  'acknowledged',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
] as const

router.get('/maintenance', adminAuth, adminRole, adminPerm, async (req, res) => {
  const status = (req.query.status as string | undefined)?.trim()
  const filter: Record<string, unknown> = {}
  if (status) {
    if (!MAINTENANCE_STATUSES.includes(status as typeof MAINTENANCE_STATUSES[number])) {
      error(res, `Invalid status. Allowed: ${MAINTENANCE_STATUSES.join(', ')}`); return
    }
    filter.status = status
  }
  const page = parsePage(req.query.page ?? 1)
  const pageSize = parsePageSize(req.query.pageSize ?? 50)
  const skip = (page - 1) * pageSize

  const [total, requests] = await Promise.all([
    MaintenanceRequest.countDocuments(filter),
    MaintenanceRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
  ])

  const propertyIds = requests.map((r) => r.propertyId).filter(Boolean)
  const tenantIds = requests.map((r) => r.tenantId).filter(Boolean)
  const [propertyTitles, tenantNames] = await Promise.all([
    batchPropertyTitles(propertyIds),
    batchUserNames(tenantIds),
  ])

  const items = requests.map((r) => ({
    ...idOf(r),
    propertyTitle: propertyTitles[r.propertyId] ?? undefined,
    tenantName: tenantNames[r.tenantId] ?? undefined,
  }))

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  success(res, { items, total, page, pageSize, totalPages })
})

// ────────────────────────────────────────
// 4. ADMIN — All insurance policies
// ────────────────────────────────────────

const INSURANCE_POLICY_STATUSES = [
  'pending',
  'active',
  'lapsed',
  'cancelled',
  'claimed',
] as const

router.get('/insurance/policies', adminAuth, adminRole, adminPerm, async (req, res) => {
  const status = (req.query.status as string | undefined)?.trim()
  const filter: Record<string, unknown> = {}
  if (status) {
    if (!INSURANCE_POLICY_STATUSES.includes(status as typeof INSURANCE_POLICY_STATUSES[number])) {
      error(res, `Invalid status. Allowed: ${INSURANCE_POLICY_STATUSES.join(', ')}`); return
    }
    filter.status = status
  }
  const page = parsePage(req.query.page ?? 1)
  const pageSize = parsePageSize(req.query.pageSize ?? 50)
  const skip = (page - 1) * pageSize

  const [total, policies] = await Promise.all([
    InsurancePolicy.countDocuments(filter),
    InsurancePolicy.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
  ])

  const userIds = policies.map((p) => p.userId).filter(Boolean)
  const productIds = Array.from(new Set(policies.map((p) => p.productId).filter(Boolean)))

  const [userNames, products] = await Promise.all([
    batchUserNames(userIds),
    productIds.length > 0
      ? InsuranceProduct.find({ _id: { $in: productIds } }).select('productName providerName category').lean()
      : Promise.resolve([] as never[]),
  ])

  const productMap: Record<string, { productName: string; providerName: string; category: string }> = {}
  for (const p of products) {
    productMap[(p._id as Types.ObjectId).toString()] = {
      productName: p.productName ?? '',
      providerName: p.providerName ?? '',
      category: p.category ?? '',
    }
  }

  const items = policies.map((p) => {
    const prod = productMap[p.productId]
    return {
      ...idOf(p),
      policyHolderName: userNames[p.userId] ?? undefined,
      productName: prod?.productName ?? undefined,
      providerName: prod?.providerName ?? undefined,
      category: prod?.category ?? undefined,
    }
  })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  success(res, { items, total, page, pageSize, totalPages })
})

export default router
