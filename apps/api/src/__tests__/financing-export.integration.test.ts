import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { config } from '../config/index.js'
import { User } from '../models/User.js'
import { FinancingApplication } from '../models/FinancingApplication.js'
import { FinancingContract } from '../models/FinancingContract.js'
import { Loan } from '../models/Loan.js'
import { CreditScore } from '../models/CreditScore.js'
import router from '../routes/users.js'
import { testMongoUri, hasTestMongo } from './testMongo.js'
const uri = testMongoUri
describe.skipIf(!hasTestMongo)('personal financing export', () => {
  const owner = String(new mongoose.Types.ObjectId()), outsider = String(new mongoose.Types.ObjectId())
  let server: Server
  beforeAll(async () => {
    await mongoose.connect(uri)
    vi.spyOn(User, 'exists').mockResolvedValue({ _id: new mongoose.Types.ObjectId(owner) })
    await Promise.all([
      FinancingApplication.collection.insertMany([owner, outsider].map(applicantId => ({ applicantId, financierId: owner, amountRequested: 1200, monthlyIncomeAtApply: 2000, monthlyIncomeCurrency: 'USD', purpose: `purpose-${applicantId}`, status: 'submitted' }))),
      FinancingContract.collection.insertMany([owner, outsider].map(applicantId => ({ applicantId, financierId: owner, principal: 1200, amountRepaid: 100, signedByApplicant: true, status: 'active', schedule: [{ installmentNumber: 1, amountDue: 120, amountPaid: 100, status: 'partial' }] }))),
      Loan.collection.insertMany([owner, outsider].map(userId => ({ userId, amount: 500, amountPaid: 50, status: 'active', reason: `reason-${userId}` }))),
      CreditScore.collection.insertMany([owner, outsider].map(userId => ({ userId, score: 70, factors: { paymentHistory: 30 }, insights: ['Payments on time'], history: [{ score: 60, date: '2026-08-01' }], calculatedAt: '2026-09-01' }))),
    ])
    const app = express(); app.use('/api/users', router)
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  })
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()))
    vi.restoreAllMocks()
    await Promise.all([
      FinancingApplication.deleteMany({ applicantId: { $in: [owner, outsider] } }), FinancingContract.deleteMany({ applicantId: { $in: [owner, outsider] } }),
      Loan.deleteMany({ userId: { $in: [owner, outsider] } }), CreditScore.deleteMany({ userId: { $in: [owner, outsider] } }),
    ])
    await mongoose.disconnect()
  })
  it.each([['tenant'], ['admin', 'financier']])('exports owned applicant data without treating role privileges as ownership (%j)', async (...roles) => {
    const token = jwt.sign({ userId: owner, roles, permissions: [], purpose: 'session' }, config.jwtSecret, { expiresIn: '5m' })
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/users/me/export?applicantId=${outsider}&userId=${outsider}`, { headers: { Authorization: `Bearer ${token}` } })
    expect(response.status).toBe(200)
    const { data } = await response.json()
    expect(data.financingApplications).toHaveLength(1)
    expect(data.financingApplications[0]).toMatchObject({ applicantId: owner, monthlyIncomeCurrency: 'USD', monthlyIncomeAtApply: 2000 })
    expect(data.financingContracts).toHaveLength(1)
    expect(data.financingContracts[0]).toMatchObject({ applicantId: owner, signedByApplicant: true, schedule: [{ amountDue: 120, amountPaid: 100 }] })
    expect(data.loans).toHaveLength(1)
    expect(data.loans[0]).toMatchObject({ userId: owner, amountPaid: 50 })
    expect(data.creditScore).toMatchObject({ userId: owner, score: 70, history: [{ score: 60 }] })
    expect(JSON.stringify([data.financingApplications, data.financingContracts, data.loans, data.creditScore])).not.toContain(outsider)
  })
})
