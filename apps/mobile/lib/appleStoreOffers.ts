import type { ProductOrSubscription } from 'expo-iap'
import type { AppleOffer } from '../stores/appleBillingStore'
export type AppleStoreMapping = { id: string; productId: string; package: { name: string; maxProperties: number; benefits: string[] } }
/** Recurring prices come exclusively from StoreKit. Introductory eligibility is
 * confirmed in the store sheet; never advertise an unverified trial entitlement.
 */
export function appleStoreOffers(mappings: AppleStoreMapping[], products: ProductOrSubscription[]): AppleOffer[] {
  return mappings.flatMap(mapping => {
    const product = products.find(item => item.id === mapping.productId && item.platform === 'ios' && item.type === 'subs')
    if (!product || product.platform !== 'ios' || product.type !== 'subs' || product.typeIOS !== 'auto-renewable-subscription') return []
    const count = Number(product.subscriptionPeriodNumberIOS)
    const unit = product.subscriptionPeriodUnitIOS
    if (!product.displayPrice || !Number.isInteger(count) || count < 1 || !unit || unit === 'empty' || product.pricingTermsIOS?.length || product.bundledSubscriptionsIOS?.length) return []
    return [{ key: mapping.id, productId: mapping.productId, name: mapping.package.name, maxProperties: mapping.package.maxProperties, benefits: mapping.package.benefits,
      terms: `${product.displayPrice} per ${count === 1 ? unit : `${count} ${unit}s`}, auto-renewing` }]
  })
}
