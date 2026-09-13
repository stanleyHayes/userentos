import { test, expect } from '@playwright/test'
import { appleStoreOffers } from '../../apps/mobile/lib/appleStoreOffers.js'
import { completeAppleTransaction } from '../../apps/mobile/lib/applePurchaseCompletion.js'
import type { ProductSubscriptionIOS, Purchase } from '../../apps/mobile/node_modules/expo-iap/build/types.js'
const mapping = { id: 'mapping', productId: 'pro', package: { name: 'Pro', maxProperties: 8, benefits: ['Eight properties'] } }
const product: ProductSubscriptionIOS = { id: 'pro', type: 'subs', platform: 'ios', typeIOS: 'auto-renewable-subscription', title: 'Pro', description: '', currency: 'GHS', displayPrice: 'GH₵100.00', displayNameIOS: 'Pro', introductoryPricePaymentModeIOS: 'empty', isFamilyShareableIOS: false, jsonRepresentationIOS: '{}', subscriptionPeriodNumberIOS: '1', subscriptionPeriodUnitIOS: 'month' }
const purchase = { id: '123456', store: 'apple', purchaseState: 'purchased', productId: 'pro', quantity: 1, transactionDate: 1, isAutoRenewing: true } as Purchase
test('Apple offers use localized recurring terms and exact product mapping', () => {
  expect(appleStoreOffers([mapping], [product])[0]).toMatchObject({ productId: 'pro', terms: 'GH₵100.00 per month, auto-renewing' })
  expect(appleStoreOffers([{ ...mapping, productId: 'other' }], [product])).toEqual([])
  expect(appleStoreOffers([mapping], [{ ...product, displayPrice: '' }])).toEqual([])
  expect(appleStoreOffers([mapping], [{ ...product, subscriptionPeriodUnitIOS: 'empty' }])).toEqual([])
  expect(appleStoreOffers([mapping], [{ ...product, typeIOS: 'subscription-bundle' }])).toEqual([])
})
test('StoreKit finishing follows successful server processing and does not expose receipt data', async () => {
  const calls: string[] = []
  const result = await completeAppleTransaction(purchase, { current: () => true, verify: async id => { calls.push(`verify:${id}`); return { purchaseState: 1, entitlementState: 'active' } }, finish: async item => { calls.push(`finish:${item.id}`) } })
  expect(calls).toEqual(['verify:123456', 'finish:123456'])
  expect(result).toEqual({ purchaseState: 1, entitlementState: 'active' })
})
test('pending purchases, account changes and failed or incomplete server processing never finish', async () => {
  let finishes = 0
  let verifies = 0
  let current = true
  const dependencies = { current: () => current, verify: async () => { verifies++; return { purchaseState: 1, entitlementState: 'active' } }, finish: async () => { finishes++ } }
  expect(await completeAppleTransaction({ ...purchase, purchaseState: 'pending' }, dependencies)).toBeNull()
  expect(verifies).toBe(0)
  await expect(completeAppleTransaction(purchase, { ...dependencies, verify: async () => { throw new Error('retry') } })).rejects.toThrow('retry')
  await expect(completeAppleTransaction(purchase, { ...dependencies, verify: async () => ({ purchaseState: 1, entitlementState: 'prepared' }) })).rejects.toThrow('incomplete')
  expect(await completeAppleTransaction(purchase, { ...dependencies, verify: async () => { current = false; return { purchaseState: 1, entitlementState: 'active' } } })).toBeNull()
  expect(finishes).toBe(0)
})
test('a finish failure can retry through fresh server verification', async () => {
  let verified = 0
  let finished = 0
  const dependencies = { current: () => true, verify: async () => { verified++; return { purchaseState: 5, entitlementState: 'revoked' } }, finish: async () => { if (++finished === 1) throw new Error('StoreKit interrupted') } }
  await expect(completeAppleTransaction(purchase, dependencies)).rejects.toThrow('StoreKit interrupted')
  expect(await completeAppleTransaction(purchase, dependencies)).toMatchObject({ entitlementState: 'revoked' })
  expect(verified).toBe(2)
})

test('Apple restore includes expired unfinished transactions and deduplicates active items', async () => {
  const { loadAppleRestorations } = await import('../../apps/mobile/lib/appleRestorations.js')
  const expired = { ...purchase, id: '123400', expirationDateIOS: 1 }
  const pending = { ...purchase, id: '123500', purchaseState: 'pending' as const }
  const items = await loadAppleRestorations({ getAvailablePurchases: async () => [purchase], getPendingTransactionsIOS: async () => [purchase, expired, pending] })
  expect(items.map(item => item.id)).toEqual(['123456', '123400', '123500'])
  let finished = 0
  expect(await completeAppleTransaction(items[2], { current: () => true, verify: async () => { throw new Error('must not verify pending payment') }, finish: async () => { finished++ } })).toBeNull()
  expect(finished).toBe(0)
})
test('an incomplete StoreKit inventory fails instead of enabling duplicate checkout', async () => {
  const { loadAppleRestorations } = await import('../../apps/mobile/lib/appleRestorations.js')
  await expect(loadAppleRestorations({ getAvailablePurchases: async () => [], getPendingTransactionsIOS: async () => { throw new Error('StoreKit unavailable') } })).rejects.toThrow('StoreKit unavailable')
})
