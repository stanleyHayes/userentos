type Product = { productId: string; basePlanId: string }
type PurchaseOrders = { voidedOrderIds?: string[]; items: Array<Product & { latestOrderId?: string | null }> }

/** Renewals have distinct order IDs. Never revoke a later paid renewal merely
 * because an older order sharing its purchase token was refunded.
 */
export function isVoidedStoreGrant(purchase: PurchaseOrders, product: Product) {
  return purchase.items.some(item => item.productId === product.productId && item.basePlanId === product.basePlanId
    && !!item.latestOrderId && purchase.voidedOrderIds?.includes(item.latestOrderId) === true)
}
