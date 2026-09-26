import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { MongoClient, ObjectId } from 'mongodb'
import { acceptance } from '../fixtures/legalAcceptance'

test('suspended accounts retain only their own existing tenancy obligations', async ({ page, request }) => {
  test.skip(process.env.MONGO_URI !== 'mongodb://localhost:28018/rentos_compliance_e2e', 'Requires isolated compliance database')
  const client = new MongoClient(process.env.MONGO_URI!)
  await client.connect()
  const db = client.db()
  const accounts = []
  const agreementIds = [new ObjectId(), new ObjectId(), new ObjectId()]
  const foreignPaymentId = new ObjectId()
  const suffix = Date.now()
  try {
    for (const name of ['RestrictedTenant', 'Landlord', 'OtherTenant']) {
      const registered = await request.post('/api/auth/register', { data: { email: `${name}-${suffix}@rentos.test`, phone: '0241234567', password: 'E2e!Password123', firstName: name, lastName: String(suffix), role: 'tenant', acceptance } })
      expect(registered.status()).toBe(201)
      accounts.push((await registered.json()).data)
    }
    const [tenant, landlord, other] = accounts
    const headers = { Authorization: `Bearer ${tenant.token}` }
    const propertyId = new ObjectId().toString()
    await db.collection('agreements').insertMany(agreementIds.map((_id, index) => ({
      _id, propertyId, landlordId: landlord.user.id, tenantId: index === 2 ? other.user.id : tenant.user.id,
      // Rent is only payable on a lease the tenant signed (the signature field holds
      // when). The second one has ended, so during suspension it is refused even
      // though it is the tenant's own.
      status: index === 1 ? 'expired' : 'active', tenantSignature: '2026-08-25', startDate: '2026-09-01', endDate: '2027-08-31', rentAmount: 1000,
      securityDeposit: 0, advanceMonths: 0, terms: [], specialConditions: [], complianceFlags: [], version: 1,
      renewalStatus: 'none', createdAt: new Date(), updatedAt: new Date(),
    })))
    await db.collection('payments').insertOne({ _id: foreignPaymentId, agreementId: agreementIds[2].toString(), tenantId: other.user.id, landlordId: landlord.user.id, amount: 1000, status: 'completed', method: 'mtn_momo', reference: `FOREIGN-${suffix}`, createdAt: new Date() })
    await db.collection('delegations').insertOne({ propertyId, ownerId: landlord.user.id, delegateId: tenant.user.id, scopes: ['payments'], status: 'active' })
    expect((await request.get(`/api/payments/${foreignPaymentId}`, { headers })).status()).toBe(200)
    await db.collection('users').updateOne({ _id: new ObjectId(tenant.user.id) }, { $set: { suspendedAt: new Date(), suspensionReason: 'Safety test restriction' } })
    const ownList = await request.get('/api/agreements', { headers })
    expect(ownList.status()).toBe(200)
    expect((await ownList.json()).data.items.map((item: { id: string }) => item.id).sort()).toEqual(agreementIds.slice(0, 2).map(String).sort())
    expect((await request.get(`/api/agreements/${agreementIds[0]}`, { headers })).status()).toBe(200)
    expect((await request.get(`/api/agreements/${agreementIds[2]}`, { headers })).status()).toBe(403)
    const link = await request.post(`/api/agreements/${agreementIds[0]}/document-link`, { headers })
    expect(link.status()).toBe(200)
    const downloadToken = (await link.json()).data.token
    const pdf = await request.get(`/api/agreements/${agreementIds[0]}/document.pdf`, { params: { token: downloadToken } })
    expect(pdf.status()).toBe(200)
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
    expect((await request.get(`/api/agreements/${agreementIds[2]}/document.pdf`, { params: { token: downloadToken } })).status()).toBe(403)
    expect((await request.post(`/api/agreements/${agreementIds[2]}/document-link`, { headers })).status()).toBe(403)
    const methods = await request.get('/api/payments/methods', { headers })
    expect(methods.status()).toBe(200)
    expect((await methods.json()).data.mode).toBe('simulated')
    const paymentData = { rentPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, agreementId: agreementIds[0].toString(), method: 'mtn_momo', phone: '0241234567', amount: 1000 }
    // A checkout needs an Idempotency-Key (428 without one); a fresh key per attempt.
    const checkoutHeaders = () => ({ ...headers, 'Idempotency-Key': randomUUID() })
    const created = await request.post('/api/payments', { headers: checkoutHeaders(), data: paymentData })
    expect(created.status()).toBe(201)
    const payment = (await created.json()).data.payment
    expect((await request.get(`/api/payments/${payment.id}`, { headers })).status()).toBe(200)
    expect((await request.get(`/api/payments/${foreignPaymentId}`, { headers })).status()).toBe(403)
    const payments = (await (await request.get('/api/payments', { headers })).json()).data.items
    expect(payments.map((item: { id: string }) => item.id)).toEqual([payment.id])
    for (const agreementId of agreementIds.slice(1)) expect((await request.post('/api/payments', { headers: checkoutHeaders(), data: { ...paymentData, agreementId: agreementId.toString() } })).status()).toBe(403)
    expect((await request.post('/api/agreements', { headers, data: {} })).status()).toBe(403)
    expect((await request.post(`/api/agreements/${agreementIds[0]}/sign`, { headers, data: {} })).status()).toBe(403)

    const login = await request.post('/api/auth/login', { data: { email: tenant.user.email, password: 'E2e!Password123' } })
    expect(login.status()).toBe(200)
    await page.addInitScript(data => localStorage.setItem('rentos-auth', JSON.stringify({ state: { ...data, isAuthenticated: true }, version: 0 })), (await login.json()).data)
    await page.goto('/payments')
    await page.getByRole('button', { name: 'Skip tour', exact: true }).click()
    await expect(page.getByText(payment.reference, { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'view your agreements', exact: true })).toBeVisible()

    // A role in a freshly issued token must not bypass suspension ownership.
    await db.collection('users').updateOne({ _id: new ObjectId(tenant.user.id) }, { $set: { roles: ['government'], activeRole: 'government' } })
    const governmentLogin = await request.post('/api/auth/login', { data: { email: tenant.user.email, password: 'E2e!Password123' } })
    expect(governmentLogin.status()).toBe(200)
    const governmentHeaders = { Authorization: `Bearer ${(await governmentLogin.json()).data.token}` }
    expect((await request.get(`/api/agreements/${agreementIds[2]}`, { headers: governmentHeaders })).status()).toBe(403)
    expect((await (await request.get('/api/agreements', { headers: governmentHeaders })).json()).data.total).toBe(2)
  } finally {
    await db.collection('delegations').deleteMany({ delegateId: { $in: accounts.map(account => account.user.id) } })
    await db.collection('payments').deleteMany({ agreementId: { $in: agreementIds.map(String) } })
    await db.collection('agreements').deleteMany({ _id: { $in: agreementIds } })
    for (const account of accounts) await request.delete('/api/users/me', { headers: { Authorization: `Bearer ${account.token}` } })
    await client.close()
  }
})
