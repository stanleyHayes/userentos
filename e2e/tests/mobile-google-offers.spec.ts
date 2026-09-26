import { test, expect } from '@playwright/test'
import { googleStoreOffers } from '../../apps/mobile/lib/googleStoreOffers.js'
import { completeGooglePurchase, createGooglePurchaseCompleter, type GoogleBillingUpdate, type GoogleCompletion } from '../../apps/mobile/lib/googlePurchaseCompletion.js'
import type { ProductSubscriptionAndroid, Purchase } from '../../apps/mobile/node_modules/expo-iap/build/types.js'
const mapping = { id: 'mapping', productId: 'pro', basePlanId: 'monthly', package: { name: 'Pro', maxProperties: 8, benefits: ['Eight properties'] } }
const product: ProductSubscriptionAndroid = { id: 'pro', type: 'subs', platform: 'android', title: 'Pro', nameAndroid: 'Pro', description: '', currency: 'GHS', displayPrice: 'WRONG product-level price', subscriptionOffers: [{ id: 'intro', type: 'introductory', displayPrice: 'WRONG intro-only price', price: 0, basePlanIdAndroid: 'monthly', offerTokenAndroid: 'offer', pricingPhasesAndroid: { pricingPhaseList: [
  { billingCycleCount: 1, billingPeriod: 'P1M', formattedPrice: 'GH₵0.00', priceAmountMicros: '0', priceCurrencyCode: 'GHS', recurrenceMode: 2 },
  { billingCycleCount: 0, billingPeriod: 'P1M', formattedPrice: 'GH₵100.00', priceAmountMicros: '100000000', priceCurrencyCode: 'GHS', recurrenceMode: 1 },
] } }] }
test.describe('native Google subscription offers', () => {
  test('shows trial and recurring localized prices from the matched base plan', () => {
    const offers = googleStoreOffers([mapping], [product])
    expect(offers).toHaveLength(1)
    expect(offers[0].terms).toBe('GH₵0.00 per month for 1 period(s), then GH₵100.00 per month, auto-renewing')
    expect(offers[0].offerToken).toBe('offer')
    expect(JSON.stringify(offers)).not.toContain('WRONG')
  })
  test('does not offer a mismatched base plan, missing token, or unsupported installment plan', () => {
    expect(googleStoreOffers([{ ...mapping, basePlanId: 'yearly' }], [product])).toEqual([])
    const copy = structuredClone(product)
    copy.subscriptionOffers[0].offerTokenAndroid = null
    expect(googleStoreOffers([mapping], [copy])).toEqual([])
    copy.subscriptionOffers[0] = { ...product.subscriptionOffers[0], installmentPlanDetailsAndroid: { commitmentPaymentsCount: 12, subsequentCommitmentPaymentsCount: 12 } }
    expect(googleStoreOffers([mapping], [copy])).toEqual([])
  })
  test('does not invent prices when the store provides no pricing phases', () => {
    const copy = structuredClone(product)
    copy.subscriptionOffers[0].pricingPhasesAndroid = null
    expect(googleStoreOffers([mapping], [copy])).toEqual([])
  })
})

test.describe('Google Play purchase completion', () => {
  const purchase = { id: 'GPA.1', store: 'google', purchaseState: 'purchased', purchaseToken: 'token-1', productId: 'pro', quantity: 1, transactionDate: 1, isAutoRenewing: true } as Purchase
  const pendingOnServer: GoogleCompletion = { purchaseState: 'SUBSCRIPTION_STATE_PENDING', entitlementState: 'pending', acknowledged: false }

  test('a pending purchase is posted so the server can acknowledge it later, and never reads as active', async () => {
    const posted: string[] = []
    const completion = await completeGooglePurchase({ ...purchase, purchaseState: 'pending' }, { current: () => true, verify: async token => { posted.push(token); return pendingOnServer } })
    expect(posted).toEqual(['token-1'])
    expect(completion?.message).toBe('Payment is pending in Google Play. Your plan activates after confirmation.')
    expect(completion?.message).not.toContain('active.')
  })

  test('only an active, acknowledged server result reads as active', async () => {
    const verify = (result: GoogleCompletion) => async () => result
    expect((await completeGooglePurchase(purchase, { current: () => true, verify: verify({ purchaseState: 'SUBSCRIPTION_STATE_ACTIVE', entitlementState: 'active', acknowledged: true }) }))?.message).toBe('Your Google Play subscription is active.')
    expect((await completeGooglePurchase(purchase, { current: () => true, verify: verify({ purchaseState: 'SUBSCRIPTION_STATE_ACTIVE', entitlementState: 'active', acknowledged: false }) }))?.message).toBe('No active subscription access was confirmed.')
  })

  test('a purchase in an unknown state still goes to the server, which decides', async () => {
    const posted: string[] = []
    const completion = await completeGooglePurchase({ ...purchase, purchaseState: 'unknown' }, { current: () => true, verify: async token => { posted.push(token); return { purchaseState: 'SUBSCRIPTION_STATE_UNSPECIFIED', entitlementState: 'none', acknowledged: false } } })
    expect(posted).toEqual(['token-1'])
    expect(completion?.message).toBe('No active subscription access was confirmed.')
  })

  test('another store, a missing token or an account change posts or reports nothing', async () => {
    let posts = 0
    const verify = async () => { posts++; return pendingOnServer }
    expect(await completeGooglePurchase({ ...purchase, store: 'apple' } as Purchase, { current: () => true, verify })).toBeNull()
    expect(await completeGooglePurchase({ ...purchase, purchaseToken: null }, { current: () => true, verify })).toBeNull()
    expect(await completeGooglePurchase(purchase, { current: () => false, verify })).toBeNull()
    expect(posts).toBe(0)
    let current = true
    expect(await completeGooglePurchase(purchase, { current: () => current, verify: async () => { current = false; return pendingOnServer } })).toBeNull()
  })

  test('a server failure surfaces for retry', async () => {
    await expect(completeGooglePurchase(purchase, { current: () => true, verify: async () => { throw new Error('Google verification unavailable') } })).rejects.toThrow('unavailable')
  })
})

test.describe('Google Play checkout state', () => {
  const purchase = { id: 'GPA.1', store: 'google', purchaseState: 'purchased', purchaseToken: 'token-1', productId: 'pro', quantity: 1, transactionDate: 1, isAutoRenewing: true } as Purchase
  const active: GoogleCompletion = { purchaseState: 'SUBSCRIPTION_STATE_ACTIVE', entitlementState: 'active', acknowledged: true }
  function fixture(verify: (token: string) => Promise<GoogleCompletion> = async () => active) {
    const updates: GoogleBillingUpdate[] = []
    let current = true
    const complete = createGooglePurchaseCompleter({ current: () => current, verify, update: state => { if (current) updates.push(state) }, revision: () => 4 })
    return { updates, complete, end: () => { current = false } }
  }

  test('a purchase the listener delivers with nothing to post still re-enables checkout', async () => {
    const { updates, complete } = fixture(async () => { throw new Error('must not post') })
    await complete({ ...purchase, purchaseToken: null }, true)
    await complete({ ...purchase, store: 'apple' } as Purchase, true)
    expect(updates).toEqual([{ busy: false }, { busy: false }])
  })

  test('a delivered purchase is posted once and its result re-enables checkout', async () => {
    const posted: string[] = []
    const { updates, complete } = fixture(async token => { posted.push(token); return active })
    await complete({ ...purchase, purchaseState: 'unknown' }, true)
    expect(posted).toEqual(['token-1'])
    expect(updates).toEqual([{ busy: false, error: '', message: 'Your Google Play subscription is active.', revision: 5 }])
  })

  test('a skipped purchase found by a restore leaves busy to the restore', async () => {
    const { updates, complete } = fixture()
    await complete({ ...purchase, purchaseToken: null })
    expect(updates).toEqual([])
  })

  test('the listener and a restore delivering the same token post it once', async () => {
    let answer!: (result: GoogleCompletion) => void
    let posts = 0
    const { updates, complete } = fixture(() => { posts++; return new Promise(resolve => { answer = resolve }) })
    const first = complete(purchase)
    await complete(purchase, true)
    answer(active)
    await first
    expect(posts).toBe(1)
    expect(updates).toHaveLength(1)
  })

  test('a server failure re-enables checkout with a retry message', async () => {
    const { updates, complete } = fixture(async () => { throw new Error('Google verification unavailable') })
    await complete(purchase, true)
    expect(updates).toEqual([{ busy: false, error: 'Google verification unavailable' }])
  })
})
