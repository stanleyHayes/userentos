import type { Purchase } from 'expo-iap'
/** Active entitlement inventory alone omits expired unfinished transactions.
 * If either query fails, do not treat the partial inventory as safe for checkout.
 */
export async function loadAppleRestorations(source: {
  getAvailablePurchases: () => Promise<Purchase[]>
  getPendingTransactionsIOS: () => Promise<Purchase[]>
}): Promise<Purchase[]> {
  const [active, unfinished] = await Promise.all([source.getAvailablePurchases(), source.getPendingTransactionsIOS()])
  const transactions = new Map<string, Purchase>()
  for (const purchase of [...active, ...unfinished]) {
    if (purchase.store === 'apple') transactions.set(purchase.id, purchase)
  }
  return [...transactions.values()]
}
