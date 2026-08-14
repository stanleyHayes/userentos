import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
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
import { useAdminInsurancePolicies } from '@/hooks/useApi'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertTriangle, CalendarClock, FileSearch, ReceiptText, ShieldCheck, ShieldPlus, Siren } from 'lucide-react'
import type { InsurancePolicyStatus } from '@/types'

const STATUS_FILTERS: { label: string; value: InsurancePolicyStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Active', value: 'active' },
  { label: 'Lapsed', value: 'lapsed' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Claimed', value: 'claimed' },
]

const statusVariant: Record<InsurancePolicyStatus, 'success' | 'warning' | 'danger' | 'muted' | 'default'> = {
  pending: 'warning',
  active: 'success',
  lapsed: 'danger',
  cancelled: 'muted',
  claimed: 'default',
}

function label(value: string) {
  return value.replaceAll('_', ' ')
}

export function AdminInsurancePoliciesPage() {
  const [statusFilter, setStatusFilter] = useState<InsurancePolicyStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const { attach: statusPillAttach, style: statusPillStyle, visible: statusPillVisible } = useSlidingIndicator<HTMLDivElement>(statusFilter)
  const queryParams = useMemo(
    () => ({ status: statusFilter === 'all' ? undefined : statusFilter, page }),
    [statusFilter, page],
  )
  const { data, isLoading } = useAdminInsurancePolicies(queryParams)
  const items = useMemo(() => data?.items ?? [], [data?.items])

  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const stats = useMemo(() => {
    const active = items.filter((p) => p.status === 'active').length
    const risk = items.filter((p) => p.status === 'lapsed' || p.status === 'cancelled').length
    const monthlyPremium = items.reduce((sum, p) => sum + p.monthlyPremium, 0)
    const claims = items.reduce((sum, p) => sum + (p.claims?.length ?? 0), 0)

    return { active, risk, monthlyPremium, claims }
  }, [items])

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Platform admin"
        title="Policy Portfolio"
        description="Review insurance policy coverage, premium flow, claims volume, product categories, and lapsed policy risk."
        icon={<ShieldPlus size={22} />}
        accent="#a78bfa"
        meta={`${total} policies platform-wide • Page ${page} of ${totalPages}`}
      />

      <AdminStatGrid>
        <AdminStatCard
          label="Total policies"
          value={total.toLocaleString()}
          description={`${items.length.toLocaleString()} policies match the current status filter.`}
          icon={<ShieldPlus size={18} />}
          accent="#60a5fa"
        />
        <AdminStatCard
          label="Active on page"
          value={stats.active.toLocaleString()}
          description="Policies currently active within the loaded page of platform results."
          icon={<ShieldCheck size={18} />}
          accent="#10b981"
        />
        <AdminStatCard
          label="Premium volume"
          value={formatCurrency(stats.monthlyPremium)}
          description="Combined monthly premium across loaded policies."
          icon={<ReceiptText size={18} />}
          accent="#f59e0b"
        />
        <AdminStatCard
          label="Claims tracked"
          value={stats.claims.toLocaleString()}
          description={`${stats.risk.toLocaleString()} loaded policies are lapsed or cancelled.`}
          icon={<Siren size={18} />}
          accent="#f43f5e"
        />
      </AdminStatGrid>

      <AdminToolbar
        title="Policy filters"
        description="Filter the loaded policy page by policy lifecycle status."
        resultLabel={`${items.length.toLocaleString()} visible`}
      >
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
              onClick={() => {
                setStatusFilter(f.value)
                setPage(1)
              }}
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
      </AdminToolbar>

      {isLoading ? (
        <AdminLoadingState title="Loading policies" description="Reading coverage, premium, and claim details." />
      ) : items.length === 0 ? (
        <AdminEmptyState
          title="No policies found"
          description="No policies match the selected filter."
          icon={<FileSearch size={22} />}
        />
      ) : (
        <AdminTableCard
          title="Policy registry"
          description="Policy holder, product, coverage period, premium, status, and claim counts in a single review table."
        >
          <table className={adminTableClassName('min-w-[980px]')}>
            <thead>
              <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted dark:border-[#252a3a]/70 dark:text-gray-500">
                <th className="px-4 py-3 font-bold">Holder</th>
                <th className="px-4 py-3 font-bold">Product</th>
                <th className="px-4 py-3 font-bold">Coverage</th>
                <th className="px-4 py-3 text-right font-bold">Premium</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 text-right font-bold">Claims</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 dark:divide-[#252a3a]/50">
              {items.map((p) => {
                const claims = p.claims?.length ?? 0

                return (
                  <tr key={p.id} className="align-top transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-4">
                      <div className="font-bold text-primary-dark dark:text-white">{p.policyHolderName ?? p.userId.slice(0, 8)}</div>
                      <div className="mt-1 font-mono text-[11px] text-muted dark:text-gray-500">{p.policyNumber}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-primary-dark dark:text-white">{p.productName ?? 'Product not assigned'}</div>
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">{p.providerName ?? 'Provider not assigned'}</div>
                      {p.category && <Badge variant="muted" className="mt-2 text-[10px] capitalize">{label(p.category)}</Badge>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 font-semibold text-primary-dark dark:text-white">
                        <CalendarClock size={13} />
                        {formatDate(p.startDate)}
                      </div>
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">Ends {formatDate(p.endDate)}</div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="font-bold text-primary-dark dark:text-white">{formatCurrency(p.monthlyPremium)}</div>
                      <div className="text-[11px] text-muted dark:text-gray-500">monthly</div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={statusVariant[p.status]} className="text-[10px] capitalize">{label(p.status)}</Badge>
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted dark:text-gray-500">
                        <AlertTriangle size={12} />
                        {p.lastPaidAt ? `Paid ${formatDate(p.lastPaidAt)}` : 'No payment date'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="font-bold text-primary-dark dark:text-white">{claims.toLocaleString()}</div>
                      <div className="text-[11px] text-muted dark:text-gray-500">{claims === 1 ? 'claim' : 'claims'}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </AdminTableCard>
      )}

      <AdminPagination
        page={page}
        totalPages={totalPages}
        onPrevious={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  )
}
