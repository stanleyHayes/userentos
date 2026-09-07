import { useMemo, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  AdminPagination,
  AdminStatCard,
  AdminStatGrid,
  AdminTableCard,
  AdminToolbar,
} from '@/components/admin/AdminPagePrimitives'
import { adminTableClassName } from '@/components/admin/adminPageUtils'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'
import {
  RECONCILE_CUTOFF_MINUTES,
  reconciliationSnapshot,
  summarizeTransactions,
  transactionSplit,
  useAdminMarketplaceTransactions,
  type MarketplaceTransactionStatus,
} from '@/hooks/useAdminTransactions'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import {
  AlertTriangle, Check, Clock3, Copy, CreditCard, Landmark, Percent,
  ReceiptText, ScanLine, ShieldAlert, Store, UserRound, Wallet, XCircle,
} from 'lucide-react'

const PAGE_SIZE = 25

const STATUS_FILTERS: { label: string; value: MarketplaceTransactionStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Paid', value: 'paid' },
  { label: 'Pending', value: 'pending' },
  { label: 'Started', value: 'initialized' },
  { label: 'Failed', value: 'failed' },
  { label: 'Refunded', value: 'refunded' },
  { label: 'Part refund', value: 'partially_refunded' },
  { label: 'Disputed', value: 'disputed' },
]

const statusVariant: Record<MarketplaceTransactionStatus, 'success' | 'warning' | 'danger' | 'muted' | 'default'> = {
  initialized: 'muted',
  pending: 'warning',
  paid: 'success',
  failed: 'danger',
  refunded: 'default',
  partially_refunded: 'warning',
  disputed: 'danger',
}

/**
 * Amounts are formatted to the pesewa here rather than with `formatCurrency`,
 * which rounds to whole cedis. Rounding is right for a dashboard and wrong for
 * reconciliation: an operator checking a 10% split on GHS 120.50 has to see
 * 12.05 and 108.45, not 12 and 108.
 */
const numberFormats = new Map<string, Intl.NumberFormat>()

function money(amount: number, currency = 'GHS'): string {
  let format = numberFormats.get(currency)
  if (!format) {
    try {
      format = new Intl.NumberFormat('en-GH', {
        style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
      })
    } catch {
      // A row with a currency code Intl does not know must still render.
      format = new Intl.NumberFormat('en-GH', {
        style: 'currency', currency: 'GHS', minimumFractionDigits: 2, maximumFractionDigits: 2,
      })
    }
    numberFormats.set(currency, format)
  }
  return format.format(amount)
}

/** Nothing on this route is populated, so ids are all we can show a human. */
function shortId(id: string) {
  return id.length > 10 ? `${id.slice(0, 10)}…` : id
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function label(value: string) {
  return value.replaceAll('_', ' ')
}

/**
 * References are the only handle an operator has when they open the Paystack
 * dashboard or reply to a support thread, and they are long enough that
 * retyping one is how a wrong transaction gets refunded.
 */
function CopyableReference({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      // navigator.clipboard is undefined in insecure contexts and can throw
      // synchronously, so guard before awaiting the write.
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(reference)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy the reference')
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy reference ${reference}`}
      title={reference}
      className="focus-ring -mx-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.04]"
    >
      <span className="truncate font-mono text-xs font-bold text-primary-dark dark:text-white">{reference}</span>
      {copied
        ? <Check size={12} className="shrink-0 text-success" />
        : <Copy size={12} className="shrink-0 text-muted dark:text-gray-500" />}
    </button>
  )
}

/**
 * Payments and reconciliation for the marketplace (spec §12/§13).
 *
 * Every amount here is a snapshot taken when the payment was created — the fee
 * percent included — so a seller changing plan tomorrow never rewrites what
 * this page says about yesterday.
 */
export function AdminTransactionsPage() {
  const [statusFilter, setStatusFilter] = useState<MarketplaceTransactionStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const {
    attach: statusPillAttach, style: statusPillStyle, visible: statusPillVisible,
  } = useSlidingIndicator<HTMLDivElement>(statusFilter)
  const { data, isLoading } = useAdminMarketplaceTransactions(
    useMemo(() => ({ status: statusFilter === 'all' ? undefined : statusFilter }), [statusFilter]),
  )

  const items = useMemo(() => data?.items ?? [], [data?.items])

  // Only `status` is a server filter; the date range and search narrow the
  // batch the endpoint returned, which the toolbar copy states plainly.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null
    const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null

    return items.filter((t) => {
      const created = new Date(t.createdAt).getTime()
      if (fromMs !== null && created < fromMs) return false
      if (toMs !== null && created > toMs) return false
      if (!q) return true
      return t.reference.toLowerCase().includes(q)
        || (t.providerReference ?? '').toLowerCase().includes(q)
        || t.buyerEmail.toLowerCase().includes(q)
    })
  }, [items, search, from, to])

  const totals = useMemo(() => summarizeTransactions(filtered), [filtered])
  const reconciliation = useMemo(() => reconciliationSnapshot(filtered), [filtered])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const filtersActive = Boolean(search.trim() || from || to || statusFilter !== 'all')

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Marketplace money"
        title="Payments & Reconciliation"
        description="Every split payment RentOS collected, the platform fee and seller net it computed, and where each one stands with Paystack."
        icon={<CreditCard size={22} />}
        accent="#0ea5e9"
        meta={`${items.length.toLocaleString()} loaded • ${filtered.length.toLocaleString()} in view`}
      />

      <AdminStatGrid>
        <AdminStatCard
          label="Gross volume"
          value={money(totals.grossVolume)}
          description={`Charged across ${totals.capturedCount.toLocaleString()} captured payment${totals.capturedCount === 1 ? '' : 's'}, after coupons.`}
          icon={<Wallet size={18} />}
          accent="#0ea5e9"
        />
        <AdminStatCard
          label="Platform revenue"
          value={money(totals.platformRevenue)}
          description={`${totals.effectiveFeePercent.toFixed(2)}% effective take rate on captured volume.`}
          icon={<Percent size={18} />}
          accent="#10b981"
        />
        <AdminStatCard
          label="Seller net"
          value={money(totals.sellerNet)}
          description={
            totals.processorFees > 0
              ? `${money(totals.processorFees)} of Paystack fees reported on top.`
              : 'What subaccounts are due before Paystack takes its own fee.'
          }
          icon={<Landmark size={18} />}
          accent="#8b5cf6"
        />
        <AdminStatCard
          label="Failed"
          value={totals.failedCount.toLocaleString()}
          description={`${totals.inFlightCount.toLocaleString()} still in flight${totals.unbalancedCount > 0 ? ` • ${totals.unbalancedCount} split${totals.unbalancedCount === 1 ? '' : 's'} do not add up` : ''}.`}
          icon={<XCircle size={18} />}
          accent="#f43f5e"
        />
      </AdminStatGrid>

      <section className="surface-card rounded-2xl border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-primary-dark dark:text-white">
              <ScanLine size={16} /> Settlement watch
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted dark:text-gray-500">
              The API reconciles itself: a sweep re-verifies unresolved payments against Paystack and retries
              dead-lettered webhooks every 15 minutes. It runs on the scheduler with no HTTP trigger, so this panel
              reports what it has already settled rather than offering a button that does not exist.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReconTile
            label="Awaiting settlement"
            value={reconciliation.awaitingSettlement.toLocaleString()}
            note="Captured, not yet paid out by Paystack"
            icon={<Clock3 size={14} />}
          />
          <ReconTile
            label="Settled"
            value={reconciliation.settled.toLocaleString()}
            note="Confirmed landed in the subaccount"
            icon={<Check size={14} />}
          />
          <ReconTile
            label="Settlement unknown"
            value={reconciliation.settlementUnknown.toLocaleString()}
            note="Provider never reported either way"
            icon={<ShieldAlert size={14} />}
            alert={reconciliation.settlementUnknown > 0}
          />
          <ReconTile
            label={`Stuck over ${RECONCILE_CUTOFF_MINUTES}m`}
            value={reconciliation.stuck.length.toLocaleString()}
            note="Old enough that a webhook should have landed"
            icon={<AlertTriangle size={14} />}
            alert={reconciliation.stuck.length > 0}
          />
        </div>

        {reconciliation.stuck.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/70 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
              {reconciliation.stuck.length} payment{reconciliation.stuck.length === 1 ? '' : 's'} the sweep has not resolved
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {reconciliation.stuck.slice(0, 6).map((t) => (
                <span key={t.id} className="font-mono text-[11px] text-amber-800/80 dark:text-amber-200/80">
                  {t.reference} · {ago(t.createdAt)}
                </span>
              ))}
              {reconciliation.stuck.length > 6 && (
                <span className="text-[11px] font-semibold text-amber-800/80 dark:text-amber-200/80">
                  +{reconciliation.stuck.length - 6} more
                </span>
              )}
            </div>
          </div>
        )}

        {reconciliation.missingProviderEvents > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted dark:text-gray-500">
            <AlertTriangle size={12} />
            {reconciliation.missingProviderEvents} captured payment{reconciliation.missingProviderEvents === 1 ? ' carries' : 's carry'} no
            provider event id — marked paid by direct verification rather than a webhook.
          </p>
        )}
      </section>

      <AdminToolbar
        title="Transaction filters"
        description="Status is applied by the API. The date range and search narrow the 200 most recent transactions it returns."
        resultLabel={`${filtered.length.toLocaleString()} in view`}
      >
        <div className="flex w-full flex-col gap-4">
          <div ref={statusPillAttach} className="relative isolate flex flex-wrap gap-2">
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-primary shadow-sm transition-[transform,width,height] duration-300 ease-out"
              style={{ ...statusPillStyle, opacity: statusPillVisible ? 1 : 0 }}
            />
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                data-tab-key={f.value}
                onClick={() => { setStatusFilter(f.value); setPage(1) }}
                className={`relative z-10 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === f.value
                    ? 'text-white'
                    : 'border border-border/60 bg-surface text-muted hover:text-foreground dark:border-[#252a3a] dark:bg-[#161927] dark:text-white/60 dark:hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="w-full sm:w-72">
              <Input
                id="transaction-search"
                label="Search"
                placeholder="Reference or buyer email"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
            <div className="flex gap-3">
              <Input
                id="transaction-from"
                type="date"
                label="From"
                value={from}
                onChange={(e) => { setFrom(e.target.value); setPage(1) }}
              />
              <Input
                id="transaction-to"
                type="date"
                label="To"
                value={to}
                onChange={(e) => { setTo(e.target.value); setPage(1) }}
              />
            </div>
          </div>
        </div>
      </AdminToolbar>

      {isLoading ? (
        <AdminLoadingState
          title="Loading transactions"
          description="Pulling the marketplace payment ledger and its splits."
          cols={7}
        />
      ) : visible.length === 0 ? (
        <AdminEmptyState
          title="No transactions found"
          description={filtersActive
            ? 'Nothing matches these filters. Try a wider date range, a different status, or clear the search.'
            : 'No marketplace payments have been collected yet.'}
          icon={<ReceiptText size={22} />}
        />
      ) : (
        <>
          <AdminTableCard
            title="Payment ledger"
            description="Reference, both sides of the trade, and the split RentOS computed at the moment of the charge."
          >
            <table className={adminTableClassName('min-w-[1180px]')}>
              <thead>
                <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted dark:border-[#252a3a]/70 dark:text-gray-500">
                  <th className="px-4 py-3 font-bold">Reference</th>
                  <th className="px-4 py-3 font-bold">Buyer</th>
                  <th className="px-4 py-3 font-bold">Seller / storefront</th>
                  <th className="px-4 py-3 text-right font-bold">Gross</th>
                  <th className="px-4 py-3 text-right font-bold">Split</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 dark:divide-[#252a3a]/50">
                {visible.map((t) => {
                  const split = transactionSplit(t)

                  return (
                    <tr key={t.id} className="align-top transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.03]">
                      <td className="max-w-[220px] px-4 py-4">
                        <CopyableReference reference={t.reference} />
                        {t.providerReference && t.providerReference !== t.reference && (
                          <div className="mt-1 truncate font-mono text-[11px] text-muted dark:text-gray-500" title={t.providerReference}>
                            Paystack {t.providerReference}
                          </div>
                        )}
                        <Badge variant="muted" className="mt-1.5 text-[10px] capitalize">{label(t.purpose)}</Badge>
                      </td>

                      <td className="max-w-[200px] px-4 py-4">
                        <div className="truncate font-semibold text-primary-dark dark:text-white" title={t.buyerEmail}>
                          {t.buyerEmail}
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted dark:text-gray-500">
                          <UserRound size={12} />
                          {t.buyerId ? shortId(t.buyerId) : 'Guest checkout'}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-mono text-xs font-semibold text-primary-dark dark:text-white" title={t.sellerId}>
                          {shortId(t.sellerId)}
                        </div>
                        <div className="mt-1 flex items-center gap-1 font-mono text-[11px] text-muted dark:text-gray-500">
                          <Store size={12} />
                          {t.storefrontId ? shortId(t.storefrontId) : 'No storefront'}
                        </div>
                        {t.subaccountCode && (
                          <div className="mt-1 truncate font-mono text-[11px] text-muted dark:text-gray-500" title={t.subaccountCode}>
                            {t.subaccountCode}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4 text-right">
                        <div className="font-bold text-primary-dark dark:text-white">{money(t.grossAmount, t.currency)}</div>
                        {t.discountAmount > 0 && (
                          <>
                            <div className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              −{money(t.discountAmount, t.currency)}{t.couponCode ? ` ${t.couponCode}` : ''}
                            </div>
                            <div className="text-[11px] text-muted dark:text-gray-500">
                              {money(split.payableAmount, t.currency)} charged
                            </div>
                          </>
                        )}
                      </td>

                      <td className="px-4 py-4 text-right">
                        <div className="text-xs font-semibold text-primary-dark dark:text-white">
                          Platform {money(split.platformFeeAmount, t.currency)}
                          <span className="ml-1 font-normal text-muted dark:text-gray-500">({t.platformFeePercent}%)</span>
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-primary-dark dark:text-white">
                          Seller {money(split.sellerExpectedAmount, t.currency)}
                        </div>
                        <div className="mt-1 text-[11px] text-muted dark:text-gray-500">
                          {split.processorFeeAmount !== undefined
                            ? `${money(split.processorFeeAmount, t.currency)} processor fee`
                            : 'Processor fee'} on the {split.feeBearer}
                        </div>
                        {!split.balances && (
                          <div className="mt-1 flex items-center justify-end gap-1 text-[11px] font-semibold text-danger">
                            <AlertTriangle size={11} /> Does not reconcile
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <Badge variant={statusVariant[t.status]} className="text-[10px] capitalize">{label(t.status)}</Badge>
                        <div className="mt-2 text-[11px] capitalize text-muted dark:text-gray-500">
                          Settlement {t.settlementStatus}
                        </div>
                        {t.verifiedAt && (
                          <div className="text-[11px] text-muted dark:text-gray-500">
                            Verified {ago(t.verifiedAt)}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold text-primary-dark dark:text-white">{formatDate(t.createdAt)}</div>
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted dark:text-gray-500">
                          <Clock3 size={12} /> {ago(t.createdAt)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </AdminTableCard>

          <AdminPagination
            page={safePage}
            totalPages={totalPages}
            onPrevious={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        </>
      )}
    </div>
  )
}

interface ReconTileProps {
  label: string
  value: string
  note: string
  icon: ReactNode
  alert?: boolean
}

function ReconTile({ label: tileLabel, value, note, icon, alert }: ReconTileProps) {
  return (
    <div className={`rounded-xl border p-3 ${
      alert
        ? 'border-amber-200/70 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/10'
        : 'border-border/60 bg-surface dark:border-[#252a3a] dark:bg-white/[0.02]'
    }`}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted dark:text-gray-500">
        {icon} {tileLabel}
      </div>
      <div className="mt-1.5 text-xl font-extrabold text-primary-dark dark:text-white">{value}</div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-muted dark:text-gray-500">{note}</div>
    </div>
  )
}
