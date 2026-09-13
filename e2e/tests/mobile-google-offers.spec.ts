import { test, expect } from '@playwright/test'
import { googleStoreOffers } from '../../apps/mobile/lib/googleStoreOffers.js'
import type { ProductSubscriptionAndroid } from '../../apps/mobile/node_modules/expo-iap/build/types.js'
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
