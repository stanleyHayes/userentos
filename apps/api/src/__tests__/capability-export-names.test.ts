import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const chain = (rows: unknown[]) => ({ sort: () => ({ limit: () => ({ lean: async () => rows }), lean: async () => rows }) })
vi.mock('../models/User.js', () => ({ User: { exists: vi.fn().mockResolvedValue({ _id: 'u' }) } }))
vi.mock('../models/FinancingContract.js', () => ({ FinancingContract: { find: () => chain([]) } }))
vi.mock('../models/Employer.js', () => ({ Employer: { findOne: () => ({ lean: async () => ({ _id: 'employer-1', tin: 'C0000000000', ssnitEmployerNumber: 'E1' }) }) } }))
vi.mock('../models/PayrollRun.js', () => ({ PayrollRun: { find: () => chain([]) } }))

const { config } = await import('../config/index.js')
const { default: capabilitiesRouter } = await import('../routes/capabilities.js')

describe('capability CSV exports', () => {
  let server: Server
  let base = ''
  const get = (path: string, role: string) => fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${jwt.sign({ userId: '6aa5e860ed2f39b2f1054b10', roles: [role], permissions: [], purpose: 'session' }, config.jwtSecret)}` } })
  beforeAll(async () => {
    const app = express()
    app.use('/capabilities', capabilitiesRouter)
    server = await new Promise<Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  // Names like "bog-securitized" or "ssnit-tax" read as regulator filings RentOS does not produce.
  it.each([
    ['/capabilities/financier/securitized-report.csv', 'financier', 'rentos-portfolio-export.csv'],
    ['/capabilities/employer/compliance.csv', 'employer', 'rentos-payroll-deduction-export.csv'],
  ])('%s downloads under a neutral file name', async (path, role, filename) => {
    const res = await get(path, role)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${filename}"`)
  })
})
