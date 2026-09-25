import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { config } from '../config/index.js'
import { DeductionMandate } from '../models/DeductionMandate.js'

vi.mock('../models/User.js', () => ({ User: { exists: vi.fn().mockResolvedValue({ _id: 'active-user' }) } }))
vi.mock('../models/Employment.js', () => ({ Employment: { find: vi.fn().mockResolvedValue([]) } }))
vi.mock('../models/DeductionMandate.js', () => ({ DeductionMandate: { create: vi.fn() } }))

const { default: employersRouter } = await import('../routes/employers.js')

describe('payroll deduction rules', () => {
  let server: Server
  let base = ''
  beforeAll(async () => {
    const app = express(); app.use(express.json()); app.use('/', employersRouter)
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)) })

  it('rejects a percentage mandate above 100% before anything is stored', async () => {
    const res = await fetch(`${base}/mandates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ userId: 'u1', roles: ['tenant'], permissions: [], purpose: 'session' }, config.jwtSecret)}` },
      body: JSON.stringify({ allocationType: 'wallet_topup', amountType: 'percentage', amount: 150, startDate: '2026-02-01', signature: 'Ama Mensah' }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/100%/)
    expect(vi.mocked(DeductionMandate.create)).not.toHaveBeenCalled()
  })

  it('does not present the one-third cap as a statutory rule', () => {
    const source = readFileSync(new URL('../services/payroll.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/statutory|Labour Act/i)
    expect(source).toMatch(/policy limit/i)
  })
})
