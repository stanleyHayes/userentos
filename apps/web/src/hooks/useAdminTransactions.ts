import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

/* ================================================================
   Admin marketplace payments + reconciliation
   (apps/api/src/routes/marketplacePayments.ts → GET /admin/transactions)
   ================================================================ */

export type MarketplaceTransactionStatus =
  | 'initialized' | 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'disputed'

/**
 * Units: Paystack speaks pesewas, MarketplaceTransaction does not.
 *
 * The minor-unit boundary lives entirely inside the API's Paystack adapter —
 * `toMinorUnits()` on the way out of `initializeSplitTransaction`, `/ 100` on
 * the way back in `verifyTransaction` (including the processor `fees`). By the
 * time `calculateSplit` runs and the transaction is persisted, every amount is
 * already GHS **major** units, and so are the totals this endpoint sums.
 *
 * So there is deliberately no conversion below. Dividing by 100 here would
 * render every real payment at 1% of its value; multiplying would render it at
 * 100x. The single conversion already happened, server-side, at the wire.
 */
export interface AdminMarketplaceTransaction {
  id: string
  reference: string
  buyerId?: string
  buyerEmail: string
  /** Raw user id — the admin endpoint returns lean docs and does not populate. */
  sellerId: string
  storefrontId?: string
  propertyId?: string
  purpose: string
  currency: string
  grossAmount: number
  /** Snapshot of the seller's plan fee at the time of the payment. */
  platformFeePercent: number
  platformFeeAmount: number
  sellerExpectedAmount: number
  /** Only present once the provider has reported it on a verified payment. */
  processorFeeAmount?: number
  feeBearer: 'platform' | 'seller'
  discountAmount: number
  discountSource?: 'platform' | 'seller'
  couponCode?: string
  provider: 'paystack'
  providerReference?: string
  subaccountCode?: string
  status: MarketplaceTransactionStatus
  verifiedAt?: string
  processedEventIds: string[]
  settlementStatus: 'pending' | 'settled' | 'unknown'
  createdAt: string
  updatedAt: string
}

export interface AdminTransactionsResponse {
  items: AdminMarketplaceTransaction[]
  total: number
  grossTotal: number
  platformFeeTotal: number
}

/**
 * The endpoint filters on `status` and `sellerId` only, and hard-caps the
 * result at the 200 most recent transactions. Date range and free-text search
 * are therefore applied in the page, over what came back — the UI says so
 * rather than pretending the server did it.
 */
export function useAdminMarketplaceTransactions(params?: { status?: string; sellerId?: string }) {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.sellerId) query.set('sellerId', params.sellerId)
  const qs = query.toString()
  return useQuery({
    queryKey: ['admin-marketplace-transactions', params],
    queryFn: () =>
      api.get<AdminTransactionsResponse>(`/marketplace/payments/admin/transactions${qs ? `?${qs}` : ''}`),
  })
}

/** Statuses in which money actually left the buyer's account. */
const CAPTURED: MarketplaceTransactionStatus[] = ['paid', 'refunded', 'partially_refunded', 'disputed']

export interface TransactionSplit {
  /** What the buyer was charged: gross less any coupon. */
  payableAmount: number
  platformFeeAmount: number
  sellerExpectedAmount: number
  /** Whose side Paystack's own processing fee comes off. */
  feeBearer: 'platform' | 'seller'
  processorFeeAmount?: number
  /**
   * Whether platform fee + seller net still reconstructs the payable amount.
   * `calculateSplit` guarantees it at creation, so a false here means the row
   * was edited or written outside that service — worth an operator's eyes.
   */
  balances: boolean
}

/** Re-derives the split the platform computed, from the snapshot on the row. */
export function transactionSplit(t: AdminMarketplaceTransaction): TransactionSplit {
  const payableAmount = t.grossAmount - t.discountAmount
  return {
    payableAmount,
    platformFeeAmount: t.platformFeeAmount,
    sellerExpectedAmount: t.sellerExpectedAmount,
    feeBearer: t.feeBearer,
    processorFeeAmount: t.processorFeeAmount,
    // One pesewa of tolerance: the server rounds each leg to 2dp independently.
    balances: Math.abs(payableAmount - (t.platformFeeAmount + t.sellerExpectedAmount)) <= 0.01,
  }
}

export interface TransactionTotals {
  /** Captured gross, i.e. excluding attempts that never took money. */
  grossVolume: number
  platformRevenue: number
  sellerNet: number
  processorFees: number
  capturedCount: number
  failedCount: number
  /** Started but not yet resolved either way. */
  inFlightCount: number
  /** Effective take rate across the captured rows. */
  effectiveFeePercent: number
  unbalancedCount: number
}

export function summarizeTransactions(items: AdminMarketplaceTransaction[]): TransactionTotals {
  const captured = items.filter((t) => CAPTURED.includes(t.status))

  const grossVolume = captured.reduce((sum, t) => sum + (t.grossAmount - t.discountAmount), 0)
  const platformRevenue = captured.reduce((sum, t) => sum + t.platformFeeAmount, 0)
  const sellerNet = captured.reduce((sum, t) => sum + t.sellerExpectedAmount, 0)
  const processorFees = captured.reduce((sum, t) => sum + (t.processorFeeAmount ?? 0), 0)

  return {
    grossVolume,
    platformRevenue,
    sellerNet,
    processorFees,
    capturedCount: captured.length,
    failedCount: items.filter((t) => t.status === 'failed').length,
    inFlightCount: items.filter((t) => t.status === 'initialized' || t.status === 'pending').length,
    effectiveFeePercent: grossVolume > 0 ? (platformRevenue / grossVolume) * 100 : 0,
    unbalancedCount: items.filter((t) => !transactionSplit(t).balances).length,
  }
}

/**
 * The scheduler's reconciliation sweep only looks at transactions older than
 * this, so anything younger is still legitimately in flight and must not be
 * reported as stuck (services/scheduler.ts, `reconcilePendingTransactions`).
 */
export const RECONCILE_CUTOFF_MINUTES = 30

export interface ReconciliationSnapshot {
  /** Paid but the provider has not confirmed settlement yet. */
  awaitingSettlement: number
  settled: number
  settlementUnknown: number
  /** Old enough that a webhook should have landed, but still unresolved. */
  stuck: AdminMarketplaceTransaction[]
  /** Captured with no provider event id recorded against them. */
  missingProviderEvents: number
}

export function reconciliationSnapshot(items: AdminMarketplaceTransaction[]): ReconciliationSnapshot {
  const cutoff = Date.now() - RECONCILE_CUTOFF_MINUTES * 60_000
  const captured = items.filter((t) => CAPTURED.includes(t.status))

  return {
    awaitingSettlement: captured.filter((t) => t.settlementStatus === 'pending').length,
    settled: captured.filter((t) => t.settlementStatus === 'settled').length,
    settlementUnknown: captured.filter((t) => t.settlementStatus === 'unknown').length,
    stuck: items.filter(
      (t) => (t.status === 'initialized' || t.status === 'pending')
        && new Date(t.createdAt).getTime() < cutoff,
    ),
    missingProviderEvents: captured.filter((t) => (t.processedEventIds?.length ?? 0) === 0).length,
  }
}
