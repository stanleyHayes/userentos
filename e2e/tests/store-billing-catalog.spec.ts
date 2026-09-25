import { test, expect } from '@playwright/test'
import { MongoClient, ObjectId } from 'mongodb'
import { acceptance } from '../fixtures/legalAcceptance'

test('store product mappings preserve ownership and purchase-account identity', async ({ page, request }) => {
  test.skip(process.env.MONGO_URI !== 'mongodb://localhost:28018/rentos_compliance_e2e', 'Requires isolated compliance database')
  const client = new MongoClient(process.env.MONGO_URI!)
  await client.connect()
  const db = client.db()
  const accounts = []
  const packageId = new ObjectId()
  const suffix = Date.now()
  try {
    for (const name of ['StoreAdmin', 'Buyer', 'OtherBuyer', 'Tenant']) {
      const result = await request.post('/api/auth/register', { data: { email: `${name}-${suffix}@rentos.test`, phone: '0241234567', password: 'E2e!Password123', firstName: name, lastName: String(suffix), role: name === 'Tenant' ? 'tenant' : 'landlord', acceptance } })
      expect(result.status()).toBe(201)
      let account = (await result.json()).data
      if (name === 'StoreAdmin') {
        await db.collection('users').updateOne({ _id: new ObjectId(account.user.id) }, { $set: { roles: ['admin'], activeRole: 'admin', permissions: ['subscriptions:manage'] } })
        const login = await request.post('/api/auth/login', { data: { email: account.user.email, password: 'E2e!Password123' } })
        expect(login.status()).toBe(200)
        account = (await login.json()).data
      }
      accounts.push(account)
    }
    const [admin, buyer, other, tenant] = accounts
    const headers = (account: typeof admin) => ({ Authorization: `Bearer ${account.token}` })
    await db.collection('subscriptionpackages').insertOne({ _id: packageId, name: `Store plan ${suffix}`, slug: `store-${suffix}`, description: 'Isolated fixture', price: 120, billingCycle: 'yearly', maxProperties: 5, benefits: ['Five listings'], isActive: true, isDefault: false, version: 1, sortOrder: 0 })
    expect((await request.post('/api/store-billing/account')).status()).toBe(401)
    expect((await request.post('/api/store-billing/account', { headers: headers(tenant) })).status()).toBe(403)
    const identities = await Promise.all(Array.from({ length: 5 }, () => request.post('/api/store-billing/account', { headers: headers(buyer), data: { userId: other.user.id } })))
    expect(identities.map(result => result.status())).toEqual([200, 200, 200, 200, 200])
    const bindings = await Promise.all(identities.map(async result => (await result.json()).data))
    expect(new Set(bindings.map(binding => binding.appAccountToken)).size).toBe(1)
    expect(bindings[0].appAccountToken).toMatch(/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/)
    expect(bindings[0].obfuscatedAccountId).toMatch(/^[a-f\d]{64}$/)
    const otherBinding = (await (await request.post('/api/store-billing/account', { headers: headers(other) })).json()).data
    expect(otherBinding.appAccountToken).not.toBe(bindings[0].appAccountToken)
    expect((await (await request.get('/api/users/me', { headers: headers(buyer) })).json()).data.storeAccountToken).toBeUndefined()
    expect((await (await request.get('/api/users/me/export', { headers: headers(buyer) })).json()).data.user.storeAccountToken).toBe(bindings[0].appAccountToken)

    const product = { platform: 'apple', productId: `gh.rentos.fixture.${suffix}`, packageId: packageId.toString() }
    expect((await request.post('/api/store-billing/products', { headers: headers(buyer), data: product })).status()).toBe(403)
    await page.addInitScript(data => localStorage.setItem('rentos-auth', JSON.stringify({ state: { ...data, isAuthenticated: true }, version: 0 })), admin)
    await page.goto(`/admin/packages/edit/${packageId}`)
    await page.getByRole('button', { name: 'Skip tour', exact: true }).click()
    await page.getByLabel('Store product ID', { exact: true }).fill(product.productId)
    await page.getByRole('button', { name: 'Map store product', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Product mapped.' })).toBeVisible()
    const mapping = await db.collection('storeproducts').findOne({ productId: product.productId })
    expect(mapping).toBeTruthy()
    expect(mapping?.isActive).toBe(false)
    expect(mapping?.entitlementSnapshot.features['property.limit']).toBe(5)
    await db.collection('subscriptionpackages').updateOne({ _id: packageId }, { $set: { maxProperties: 1, version: 2 } })
    expect((await db.collection('storeproducts').findOne({ _id: mapping!._id }))?.entitlementSnapshot.features['property.limit']).toBe(5)
    await page.getByRole('button', { name: 'Include in catalogue', exact: true }).click()
    await expect(page.getByText('In catalogue', { exact: true })).toBeVisible()
    expect((await request.post('/api/store-billing/products', { headers: headers(admin), data: product })).status()).toBe(409)
    expect((await request.patch(`/api/store-billing/products/${mapping!._id}`, { headers: headers(admin), data: { packageId: new ObjectId().toString() } })).status()).toBe(400)
    expect((await request.delete(`/api/subscriptions/packages/${packageId}`, { headers: headers(admin) })).status()).toBe(409)
    const catalogue = (await (await request.get('/api/store-billing/catalog?platform=apple', { headers: headers(buyer) })).json()).data.items
    const item = catalogue.find((entry: { productId: string }) => entry.productId === product.productId)
    expect(item.package.id).toBe(packageId.toString())
    expect(item.package.price).toBeUndefined()
    expect(item.package.billingCycle).toBe('yearly')
    expect(item.package.maxProperties).toBe(5)
    expect(item.package.version).toBe(1)
    expect((await request.post('/api/store-billing/products', { headers: headers(admin), data: { ...product, platform: 'google' } })).status()).toBe(400)
    expect((await request.post('/api/store-billing/products', { headers: headers(admin), data: { ...product, platform: 'google', basePlanId: 'yearly' } })).status()).toBe(201)
    await page.getByRole('button', { name: 'Remove from catalogue', exact: true }).click()
    const hidden = (await (await request.get('/api/store-billing/catalog?platform=apple', { headers: headers(buyer) })).json()).data.items
    expect(hidden.some((entry: { productId: string }) => entry.productId === product.productId)).toBe(false)
    expect((await request.post('/api/store-billing/products', { headers: headers(admin), data: product })).status()).toBe(409)
    await request.delete('/api/users/me', { headers: headers(buyer) })
    expect((await request.post('/api/store-billing/account', { headers: headers(buyer) })).status()).toBe(401)
  } finally {
    await db.collection('storeproducts').deleteMany({ packageId: packageId.toString() })
    await db.collection('subscriptionpackages').deleteOne({ _id: packageId })
    for (const account of accounts) await request.delete('/api/users/me', { headers: { Authorization: `Bearer ${account.token}` } })
    await client.close()
  }
})
