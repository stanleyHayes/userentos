import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { testMongoUri, hasTestMongo } from './testMongo.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(true), notifyWelcome: vi.fn() }))
vi.mock('../services/webhooks.js', () => ({ dispatchWebhook: vi.fn() }))

const { config } = await import('../config/index.js')
const { User } = await import('../models/User.js')
const { Agreement } = await import('../models/Agreement.js')
const { Payment } = await import('../models/Payment.js')
const { SavingsPlan } = await import('../models/SavingsPlan.js')
const { Application } = await import('../models/Application.js')
const { FinancingContract } = await import('../models/FinancingContract.js')
const { Employer } = await import('../models/Employer.js')
const { ROLE_DEFAULT_PERMISSIONS } = await import('../types/index.js')
const { grantSelfRegisteredRoleDefaults } = await import('../scripts/grantSelfRegisteredRoleDefaults.js')
const { AuditLog } = await import('../models/AuditLog.js')
const { errorHandler } = await import('../middleware/errorHandler.js')
const { default: analyticsRouter } = await import('../routes/analytics.js')
const { default: applicationsRouter } = await import('../routes/applications.js')
const { default: financingRouter } = await import('../routes/financing.js')
const { default: adminViewsRouter } = await import('../routes/adminViews.js')

const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(Date.now() - days * DAY)
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

describe.skipIf(!hasTestMongo)('dashboard figures match the records behind them', () => {
  const ids = { landlord: '', tenant: '', otherLandlord: '', appsLandlord: '', financier: '', admin: '', employer: '', fin: '', both: '', granted: '' }
  for (const key of Object.keys(ids) as (keyof typeof ids)[]) ids[key] = String(new mongoose.Types.ObjectId())
  const tag = ids.landlord.slice(-8)
  let server: Server
  let base = ''
  const as = (userId: string, roles: string[], permissions: string[] = []) => ({ Authorization: `Bearer ${jwt.sign({ userId, roles, permissions, purpose: 'session' }, config.jwtSecret, { expiresIn: '10m' })}` })
  const get = async (path: string, headers: Record<string, string>) => {
    const response = await fetch(`${base}${path}`, { headers })
    return { status: response.status, data: (await response.json() as { data?: Record<string, unknown> }).data! }
  }
  // timestamps: true always stamps createdAt as now, so age records directly.
  const backdate = (collection: string, id: unknown, createdAt: Date) =>
    mongoose.connection.collection(collection).updateOne({ _id: id as mongoose.Types.ObjectId }, { $set: { createdAt } })
  let reference = 0
  const payment = (extra: Record<string, unknown>) => ({ method: 'mtn_momo', reference: `dash-${tag}-${reference++}`, purpose: 'rent' as const, ...extra })

  beforeAll(async () => {
    await mongoose.connect(testMongoUri)
    const user = (id: string, roles: string[], permissions: string[] = []) => ({ _id: id, email: `dash-${id}@rentos.test`, phone: '0240001234', firstName: `Dash${tag}`, lastName: roles[0], passwordHash: 'fixture', roles, activeRole: roles[0], permissions })
    await User.create([
      user(ids.landlord, ['landlord', 'tenant']),
      user(ids.tenant, ['tenant']),
      user(ids.otherLandlord, ['landlord']),
      user(ids.appsLandlord, ['landlord']),
      user(ids.financier, ['financier']),
      user(ids.admin, ['admin']),
      user(ids.employer, ['employer']),
      user(ids.fin, ['financier']),
      user(ids.both, ['employer', 'financier']),
      user(ids.granted, ['employer'], ['users:view']),
    ])

    // A 12-month-style lease that started long before the 90-day window, and
    // ends in 30 days; plus one where the landlord is the tenant.
    const signed = { tenantSignature: ago(200).toISOString(), landlordSignature: ago(200).toISOString() }
    await Agreement.create([
      { propertyId: `dash-prop-${tag}`, landlordId: ids.landlord, tenantId: ids.tenant, status: 'active', startDate: isoDay(ago(200)), endDate: isoDay(ago(-30)), rentAmount: 1000, ...signed },
      { propertyId: `dash-prop2-${tag}`, landlordId: ids.otherLandlord, tenantId: ids.landlord, status: 'active', startDate: isoDay(ago(300)), endDate: isoDay(ago(-65)), rentAmount: 700, ...signed },
    ])

    // Four rent payments inside the window (one month paid twice) and older ones before it.
    const rent = { tenantId: ids.tenant, landlordId: ids.landlord, amount: 1000, status: 'completed' }
    await Payment.create([5, 35, 36, 65, 100, 130, 160].map((d) => payment({ ...rent, paidAt: ago(d).toISOString() })))
    const [overdue, fresh, topUp] = await Payment.create([
      payment({ tenantId: ids.tenant, landlordId: ids.landlord, amount: 1000, status: 'pending' }),
      payment({ tenantId: ids.tenant, landlordId: ids.landlord, amount: 500, status: 'pending' }),
      payment({ tenantId: ids.tenant, amount: 50, status: 'pending', purpose: 'wallet_deposit' }),
    ])
    await backdate(Payment.collection.collectionName, overdue._id, ago(10))
    await backdate(Payment.collection.collectionName, fresh._id, ago(1))
    await backdate(Payment.collection.collectionName, topUp._id, ago(20))

    const [plan] = await SavingsPlan.create([{ userId: ids.tenant, targetAmount: 1000, currentAmount: 300, frequency: 'monthly', contributionAmount: 100, startDate: isoDay(ago(200)), targetDate: isoDay(ago(-200)) }])
    await backdate(SavingsPlan.collection.collectionName, plan._id, ago(200))

    // Still waiting for an answer, but received before the window.
    const [oldApp] = await Application.create([{ tenantId: ids.tenant, propertyId: `dash-prop-${tag}`, landlordId: ids.landlord, moveInDate: ago(90), duration: 12 }])
    await backdate(Application.collection.collectionName, oldApp._id, ago(120))

    // 9 pending + 2 approved applications for the paging landlord (the list
    // looks property and tenant ids up, so they must be ObjectIds).
    await Application.create(Array.from({ length: 11 }, (_, i) => ({
      tenantId: String(new mongoose.Types.ObjectId()), propertyId: String(new mongoose.Types.ObjectId()), landlordId: ids.appsLandlord, moveInDate: ago(-10), duration: 12, status: i < 9 ? 'pending' : 'approved',
    })))

    const contract = { financierId: ids.financier, applicantId: ids.tenant, productType: 'rent_advance' as const, annualInterestRate: 20, tenureMonths: 6, monthlyPayment: 100 }
    await FinancingContract.create([
      { ...contract, applicationId: `dash-app-${tag}-0`, principal: 5000, totalRepayable: 5500, status: 'pending_disbursement' },
      { ...contract, applicationId: `dash-app-${tag}-1`, principal: 1000, totalRepayable: 1200, amountRepaid: 200, status: 'active' },
      { ...contract, applicationId: `dash-app-${tag}-2`, principal: 800, totalRepayable: 900, amountRepaid: 900, status: 'settled' },
    ])

    await Employer.create((['verified', 'pending', 'rejected'] as const).map((verificationStatus, i) => ({
      ownerId: ids.employer, legalName: `Dash${tag} Holdings ${i}`, tin: `DASH${tag}${i}`, address: { street: '1 Ring Rd', city: 'Accra', region: 'Greater Accra' },
      contactEmail: `dash-employer-${tag}-${i}@rentos.test`, contactPhone: '0240001234', verificationStatus,
    })))

    const app = express()
    app.use(express.json())
    app.use('/analytics', analyticsRouter)
    app.use('/applications', applicationsRouter)
    app.use('/financing', financingRouter)
    app.use('/admin', adminViewsRouter)
    app.use(errorHandler)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await Promise.all([
      User.deleteMany({ _id: { $in: Object.values(ids) } }),
      Agreement.deleteMany({ $or: [{ landlordId: ids.landlord }, { tenantId: ids.landlord }] }),
      Payment.deleteMany({ tenantId: ids.tenant }),
      SavingsPlan.deleteMany({ userId: ids.tenant }),
      Application.deleteMany({ landlordId: { $in: [ids.landlord, ids.appsLandlord] } }),
      FinancingContract.deleteMany({ financierId: ids.financier }),
      Employer.deleteMany({ ownerId: ids.employer }),
    ])
    await mongoose.disconnect()
  })

  it('counts a lease that started before the window as current, and caps the collection rate', async () => {
    const { status, data } = await get('/analytics/me', as(ids.landlord, ['landlord', 'tenant']))
    expect(status).toBe(200)
    expect(data).toMatchObject({ activeAgreements: 1, activeTenants: 1, expiringLeases: 1, totalAgreements: 1 })
    // 4 payments against 3 expected months: 100%, never 133%.
    expect(data.collectionRate).toBe(100)
    expect(data.totalRevenue).toBe(4000)
    // The six-month chart reaches past the 90-day window.
    expect(Object.keys(data.monthlyIncome as object)).toContain(ago(100).toISOString().slice(0, 7))
  })

  it('reports pending and overdue payments, and pending applications received before the window', async () => {
    const landlord = (await get('/analytics/me', as(ids.landlord, ['landlord', 'tenant']))).data
    expect(landlord).toMatchObject({ pendingPayments: 1, pendingAmount: 500, overduePayments: 1, overdueAmount: 1000, pendingApplications: 1, totalApplications: 1 })

    // A stale wallet top-up is pending, but it is not overdue rent.
    const tenant = (await get('/analytics/me', as(ids.tenant, ['tenant']))).data
    expect(tenant).toMatchObject({ pendingPayments: 2, pendingAmount: 550, overduePayments: 1, overdueAmount: 1000 })
    expect(tenant).toMatchObject({ activeAgreements: 1, nextPaymentAmount: 1000, totalSaved: 300, savingsTarget: 1000, activePlans: 1, pendingApplications: 1 })
  })

  it('gives a user holding both roles the view for the role they ask for', async () => {
    const headers = as(ids.landlord, ['landlord', 'tenant'])
    const asTenant = (await get('/analytics/me?as=tenant', headers)).data
    expect(asTenant).toHaveProperty('totalPaid')
    expect(asTenant).not.toHaveProperty('totalProperties')
    expect(asTenant).toMatchObject({ activeAgreements: 1, nextPaymentAmount: 700 })

    expect((await get('/analytics/me?as=landlord', headers)).data).toHaveProperty('totalProperties')
    // A role the caller doesn't hold is ignored.
    expect((await get('/analytics/me?as=admin', headers)).data).toHaveProperty('totalProperties')
  })

  it('pages applications on the server and counts statuses over all of them', async () => {
    const { status, data } = await get('/applications?status=pending&page=2&pageSize=8', as(ids.appsLandlord, ['landlord']))
    expect(status).toBe(200)
    expect((data.items as unknown[]).length).toBe(1)
    expect(data).toMatchObject({ total: 9, totalPages: 2, summary: { total: 11, pending: 9, approved: 2 } })
  })

  it('leaves contracts awaiting disbursement out of the financier\'s disbursed and outstanding totals', async () => {
    const { status, data } = await get('/financing/portfolio', as(ids.financier, ['financier']))
    expect(status).toBe(200)
    expect(data).toMatchObject({ totalDisbursed: 1800, outstanding: 1000, totalRepaid: 1100, contractCount: 3 })
  })

  it('searches employers on the server and reports platform-wide counts', async () => {
    const { status, data } = await get(`/admin/employers?q=Dash${tag}`, as(ids.admin, ['admin'], ['analytics:view']))
    expect(status).toBe(200)
    expect(data.total).toBe(3)
    const summary = data.summary as Record<string, number>
    expect(summary.employers).toBeGreaterThanOrEqual(3)
    expect(summary.verified).toBeGreaterThanOrEqual(1)
    expect(summary.needsReview).toBeGreaterThanOrEqual(2)
  })

  it('backfills role defaults for self-registered employers and financiers only', async () => {
    // An admin revoked this lender's access by setting [] (audited), and this
    // employer was invited: neither may be re-granted anything.
    const revoked = String(new mongoose.Types.ObjectId()), invited = String(new mongoose.Types.ObjectId())
    await User.create([
      { _id: revoked, email: `revoked-${revoked}@example.test`, phone: 'fixture', firstName: 'Revoked', lastName: 'Lender', passwordHash: 'fixture', roles: ['financier'], activeRole: 'financier', permissions: [] },
      { _id: invited, email: `invited-${invited}@example.test`, phone: 'fixture', firstName: 'Invited', lastName: 'Employer', passwordHash: 'fixture', roles: ['employer'], activeRole: 'employer', permissions: [], invitedBy: ids.admin },
    ])
    await AuditLog.create({ userId: ids.admin, action: 'users.permissions.update', entityType: 'User', entityId: revoked, details: '{"permissions":[]}' })
    const scope = [ids.employer, ids.fin, ids.both, ids.granted, revoked, invited]
    expect(await grantSelfRegisteredRoleDefaults({ userIds: scope })).toEqual({ users: 3 })
    const perms = async (id: string) => ((await User.findById(id).lean())!.permissions ?? []).slice().sort()
    expect(await perms(revoked)).toEqual([])
    expect(await perms(invited)).toEqual([])
    expect(await perms(ids.employer)).toEqual([...ROLE_DEFAULT_PERMISSIONS.employer!].sort())
    expect(await perms(ids.fin)).toEqual([...ROLE_DEFAULT_PERMISSIONS.financier!].sort())
    expect(await perms(ids.both)).toEqual([...new Set([...ROLE_DEFAULT_PERMISSIONS.employer!, ...ROLE_DEFAULT_PERMISSIONS.financier!])].sort())
    // An admin already set this account's permissions.
    expect(await perms(ids.granted)).toEqual(['users:view'])
    // Re-running changes nothing.
    expect(await grantSelfRegisteredRoleDefaults({ userIds: scope })).toEqual({ users: 0 })
    await Promise.all([User.deleteMany({ _id: { $in: [revoked, invited] } }), AuditLog.deleteMany({ entityId: revoked })])
  })
})
