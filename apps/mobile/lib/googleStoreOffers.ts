import type { ProductOrSubscription } from 'expo-iap'
import type { GoogleOffer } from '../stores/googleBillingStore'
export type GoogleStoreMapping = { id: string; productId: string; basePlanId: string; package: { name: string; maxProperties: number; benefits: string[] } }
const period = (value: string) => ({ P1W: 'week', P1M: 'month', P3M: '3 months', P6M: '6 months', P1Y: 'year' }[value] ?? value)
/** Match the store base plan, not just the product. All displayed monetary
 * values come from the SDK's localized pricing phases, never the web price.
 */
export function googleStoreOffers(mappings: GoogleStoreMapping[], products: ProductOrSubscription[]): GoogleOffer[] {
  const offers: GoogleOffer[] = []
  for (const mapping of mappings) {
    const product = products.find(item => item.id === mapping.productId && item.platform === 'android' && item.type === 'subs')
    if (!product || product.platform !== 'android' || product.type !== 'subs') continue
    for (const offer of product.subscriptionOffers) {
      const phases = offer.pricingPhasesAndroid?.pricingPhaseList
      if (offer.basePlanIdAndroid !== mapping.basePlanId || !offer.offerTokenAndroid || !phases?.length || offer.installmentPlanDetailsAndroid) continue
      if (phases.some(phase => !phase.formattedPrice || !phase.billingPeriod || ![1, 2, 3].includes(phase.recurrenceMode))) continue
      offers.push({ key: `${mapping.id}:${offer.offerTokenAndroid}`, productId: mapping.productId, offerToken: offer.offerTokenAndroid, name: mapping.package.name, maxProperties: mapping.package.maxProperties, benefits: mapping.package.benefits,
        terms: phases.map(phase => `${phase.formattedPrice} per ${period(phase.billingPeriod)}${phase.recurrenceMode === 1 ? ', auto-renewing' : phase.billingCycleCount ? ` for ${phase.billingCycleCount} period(s)` : ', prepaid'}`).join(', then ') })
    }
  }
  return offers
}
