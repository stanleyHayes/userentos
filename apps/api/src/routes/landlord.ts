import { Router } from 'express'
import { z } from 'zod'
import type { Types } from 'mongoose'
import { authenticate, requireRole } from '../middleware/auth.js'
import { PropertyExpense } from '../models/PropertyExpense.js'
import { Property } from '../models/Property.js'
import { Agreement } from '../models/Agreement.js'
import { success, error } from '../utils/response.js'
import { param } from '../utils/params.js'
import { round2 } from '../utils/money.js'

const router = Router()

const idOf = <T extends { _id: unknown }>(doc: T) => ({
  ...doc,
  id: (doc._id as Types.ObjectId).toString(),
})

const LANDLORD_ROLES = ['landlord', 'property_manager'] as const

/* ================================================================
   EXPENSES — per-property cost tracking (repairs, levies, utilities…)
   ================================================================ */
const expenseSchema = z.object({
  propertyId: z.string().min(1),
  type: z.enum(['repair', 'levy', 'utility', 'tax', 'insurance', 'other']),
  amount: z.number().positive(),
  date: z.string().min(4),
  note: z.string().max(300).optional(),
})

router.post('/expenses', authenticate, requireRole(...LANDLORD_ROLES), async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  // Expenses can only attach to properties the landlord owns.
  const property = await Property.findOne({ _id: param(parsed.data.propertyId), landlordId: req.user!.userId }).lean()
  if (!property) { error(res, 'Property not found', 404); return }

  const expense = await PropertyExpense.create({
    ...parsed.data,
    amount: round2(parsed.data.amount),
    landlordId: req.user!.userId,
  })
  success(res, idOf(expense.toObject()), 'Expense recorded', 201)
})

// GET /api/landlord/expenses?propertyId=&months= — list + summary
router.get('/expenses', authenticate, requireRole(...LANDLORD_ROLES), async (req, res) => {
  const filter: Record<string, unknown> = { landlordId: req.user!.userId }
  if (typeof req.query.propertyId === 'string' && req.query.propertyId) filter.propertyId = req.query.propertyId

  const months = Math.min(12, Math.max(1, Number(req.query.months) || 6))
  const since = new Date()
  since.setMonth(since.getMonth() - months)
  filter.createdAt = { $gte: since }

  const expenses = await PropertyExpense.find(filter).sort({ date: -1 }).limit(300).lean()

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const byTypeMap = new Map<string, number>()
  const byPropertyMap = new Map<string, number>()
  const byMonthMap = new Map<string, number>()
  for (const e of expenses) {
    byTypeMap.set(e.type, (byTypeMap.get(e.type) ?? 0) + e.amount)
    byPropertyMap.set(e.propertyId, (byPropertyMap.get(e.propertyId) ?? 0) + e.amount)
    const month = e.date.slice(0, 7)
    byMonthMap.set(month, (byMonthMap.get(month) ?? 0) + e.amount)
  }

  const propertyIds = [...byPropertyMap.keys()]
  const properties = await Property.find({ _id: { $in: propertyIds } }).select('title').lean()
  const titleOf = new Map(properties.map((p) => [(p._id as Types.ObjectId).toString(), p.title]))

  success(res, {
    items: expenses.map((e) => ({ ...idOf(e), propertyTitle: titleOf.get(e.propertyId) ?? null })),
    summary: {
      total: round2(total),
      months,
      byType: [...byTypeMap.entries()].map(([type, amount]) => ({ type, total: round2(amount) })),
      byProperty: [...byPropertyMap.entries()].map(([propertyId, amount]) => ({ propertyId, propertyTitle: titleOf.get(propertyId) ?? null, total: round2(amount) })),
      byMonth: [...byMonthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, total: round2(amount) })),
    },
  })
})

router.delete('/expenses/:id', authenticate, requireRole(...LANDLORD_ROLES), async (req, res) => {
  const expense = await PropertyExpense.findById(param(req.params.id))
  if (!expense || expense.landlordId !== req.user!.userId) { error(res, 'Expense not found', 404); return }
  await expense.deleteOne()
  success(res, null, 'Expense deleted')
})

/* ================================================================
   VACANCY — per-listing days on market + portfolio occupancy
   ================================================================ */
router.get('/vacancy', authenticate, requireRole(...LANDLORD_ROLES), async (req, res) => {
  const properties = await Property.find({ landlordId: req.user!.userId })
    .select('title status address createdAt updatedAt rentAmount')
    .lean()

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000

  // Active agreements mark a property as occupied even if the flag lags.
  const activeAgreements = await Agreement.find({
    landlordId: req.user!.userId,
    status: 'active',
  }).select('propertyId').lean()
  const occupiedIds = new Set(activeAgreements.map((a) => a.propertyId))

  const items = properties.map((p) => {
    const occupied = occupiedIds.has((p._id as Types.ObjectId).toString()) || p.status === 'occupied'
    return {
      id: (p._id as Types.ObjectId).toString(),
      title: p.title,
      city: (p.address as { city?: string } | undefined)?.city ?? null,
      status: occupied ? 'occupied' : 'vacant',
      daysListed: occupied ? 0 : Math.max(0, Math.floor((now - new Date((p as { createdAt?: Date }).createdAt ?? Date.now()).getTime()) / dayMs)),
      rentAmount: p.rentAmount,
    }
  })

  const vacant = items.filter((i) => i.status === 'vacant')
  success(res, {
    items,
    summary: {
      total: items.length,
      occupied: items.length - vacant.length,
      vacant: vacant.length,
      occupancyRate: items.length ? Math.round(((items.length - vacant.length) / items.length) * 100) : 0,
      avgDaysVacant: vacant.length ? Math.round(vacant.reduce((s, i) => s + i.daysListed, 0) / vacant.length) : 0,
      // Monthly rent currently uncollected because of vacancies.
      vacantRentValue: round2(vacant.reduce((s, i) => s + (i.rentAmount ?? 0), 0)),
    },
  })
})

export default router
