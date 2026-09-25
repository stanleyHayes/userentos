import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { Employer } from '../models/Employer.js'
import { Employment } from '../models/Employment.js'
import { DeductionMandate } from '../models/DeductionMandate.js'
import { PayrollRun } from '../models/PayrollRun.js'
import { errorHandler } from '../middleware/errorHandler.js'
import router from '../routes/employers.js'

vi.mock('../services/notify.js', () => ({ notify: vi.fn().mockResolvedValue(undefined) }))

const uri = 'mongodb://localhost:28018/rentos_compliance_e2e'
describe.skipIf(process.env.RENTOS_TEST_MONGO_URI !== uri)('employee consent to payroll links', () => {
  const tag = new mongoose.Types.ObjectId().toString()
  const owners = [`owner-a-${tag}`, `owner-b-${tag}`]
  const employerIds: string[] = []
  const userIds: string[] = []
  let server: Server
  let base = ''

  const token = (userId: string, roles: string[]) =>
    jwt.sign({ userId, roles, permissions: roles.includes('employer') ? ['employer:view_employees', 'employer:invite_employees', 'employer:run_payroll'] : [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
  const ownerToken = (i: number) => token(owners[i], ['employer'])
  const call = (path: string, auth: string, body?: unknown, method?: string) => fetch(`${base}${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  async function employee(firstName = 'Kofi') {
    const email = `emp-${new mongoose.Types.ObjectId()}@example.com`
    const user = await User.collection.insertOne({ email, firstName, lastName: 'Secret', phone: '0240000000', roles: ['tenant'] })
    const id = user.insertedId.toString(); userIds.push(id)
    return { id, email, auth: token(id, ['tenant']) }
  }
  const invite = (i: number, email: string) => call('/api/employers/employees', ownerToken(i), { email, netMonthlySalary: 3000, startDate: '2026-01-01' })

  beforeAll(async () => {
    await mongoose.connect(uri)
    await Promise.all([Employment.init(), Employer.init()])
    vi.spyOn(User, 'exists').mockResolvedValue({ _id: new mongoose.Types.ObjectId() })
    for (const [i, ownerId] of owners.entries()) {
      const e = await Employer.create({ ownerId, legalName: `Fixture Employer ${i} ${tag}`, tin: `TIN-${i}-${tag}`, address: { street: 's', city: 'Accra', region: 'GA' }, contactEmail: `hr${i}-${tag}@example.com`, contactPhone: '0300000000' })
      employerIds.push(e._id.toString())
    }
    const app = express(); app.use(express.json()); app.use('/api/employers', router); app.use(errorHandler)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    vi.restoreAllMocks()
    await Promise.all([
      Employment.deleteMany({ employerId: { $in: employerIds } }), Employer.deleteMany({ _id: { $in: employerIds } }),
      DeductionMandate.deleteMany({ employerId: { $in: employerIds } }), PayrollRun.deleteMany({ employerId: { $in: employerIds } }),
      User.collection.deleteMany({ _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } }),
    ])
    await mongoose.disconnect()
  })

  it('an invite is pending, reveals no name, and is excluded from payroll until accepted', async () => {
    const emp = await employee('Abena')
    const res = await invite(0, emp.email)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('Abena')
    expect(body.data.status).toBe('pending')
    const list = await (await call('/api/employers/employees', ownerToken(0))).json()
    const row = list.data.items.find((e: { userId: string }) => e.userId === emp.id)
    expect(row.employeeName).toBeUndefined()
    expect(row.inviteEmail).toBe(emp.email)

    const run = await (await call('/api/employers/payroll/runs', ownerToken(0), { periodLabel: `P-${tag}-1`, periodStart: '2026-01-01', periodEnd: '2026-01-31', scheduledPayDate: '2026-01-31' })).json()
    expect(run.data.employeeCount).toBe(0)
  })

  it('the employer cannot activate a link the employee has not accepted', async () => {
    const emp = await employee()
    const created = await (await invite(0, emp.email)).json()
    expect((await call(`/api/employers/employees/${created.data.id}`, ownerToken(0), { status: 'active' }, 'PATCH')).status).toBe(409)
    expect((await Employment.findById(created.data.id).lean())?.status).toBe('pending')
  })

  it('the employee accepts or declines their own invites only', async () => {
    const emp = await employee()
    const other = await employee()
    const created = await (await invite(0, emp.email)).json()
    const mine = await (await call('/api/employers/employments/mine', emp.auth)).json()
    expect(mine.data.items.map((e: { id: string }) => e.id)).toContain(created.data.id)
    expect((await call(`/api/employers/employments/${created.data.id}/accept`, other.auth, {})).status).toBe(404)
    expect((await call(`/api/employers/employments/${created.data.id}/accept`, emp.auth, {})).status).toBe(200)
    const stored = await Employment.findById(created.data.id).lean()
    expect(stored?.status).toBe('active')
    expect(stored?.employeeAcceptedAt).toBeInstanceOf(Date)
  })

  it('bulk import creates pending links and never returns names', async () => {
    const a = await employee('Yaw')
    const res = await call('/api/employers/employees/bulk', ownerToken(1), { rows: [
      { email: a.email, netMonthlySalary: 2000, startDate: '2026-01-01' },
      { email: `nobody-${tag}@example.com`, netMonthlySalary: 2000, startDate: '2026-01-01' },
    ] })
    const text = await res.text()
    expect(res.status).toBe(201)
    expect(text).not.toContain('Yaw')
    expect((await Employment.findOne({ employerId: employerIds[1], userId: a.id }).lean())?.status).toBe('pending')
  })

  it('a mandate must name an employment the employee accepted, and a percentage is at most 100', async () => {
    const emp = await employee()
    const first = await (await invite(0, emp.email)).json()
    const second = await (await invite(1, emp.email)).json()
    const mandate = (body: Record<string, unknown>) => call('/api/employers/mandates', emp.auth, { allocationType: 'wallet_topup', amountType: 'fixed', amount: 100, startDate: '2026-02-01', signature: 'Kofi Secret', ...body })

    expect((await mandate({ employmentId: first.data.id })).status).toBe(400)
    await call(`/api/employers/employments/${first.data.id}/accept`, emp.auth, {})
    await call(`/api/employers/employments/${second.data.id}/accept`, emp.auth, {})
    expect((await mandate({})).status).toBe(400)
    expect((await mandate({ employmentId: first.data.id, amountType: 'percentage', amount: 150 })).status).toBe(400)

    const stranger = await employee()
    const strangerLink = await (await invite(1, stranger.email)).json()
    await call(`/api/employers/employments/${strangerLink.data.id}/accept`, stranger.auth, {})
    expect((await mandate({ employmentId: strangerLink.data.id })).status).toBe(400)

    const ok = await mandate({ employmentId: second.data.id })
    expect(ok.status).toBe(201)
    expect((await ok.json()).data.employerId).toBe(employerIds[1])
  })
})
