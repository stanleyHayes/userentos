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
import { useAdminFinancingContracts } from '@/hooks/useApi'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertTriangle, Banknote, CircleDollarSign, Clock3, FileSignature, Landmark, ReceiptText } from 'lucide-react'
import type { FinancingContractStatus } from '@/types'

const STATUS_FILTERS: { label: string; value: FinancingContractStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending_disbursement' },
  { label: 'Active', value: 'active' },
  { label: 'Grace', value: 'in_grace' },
  { label: 'Arrears', value: 'in_arrears' },
  { label: 'Defaulted', value: 'defaulted' },
  { label: 'Settled', value: 'settled' },
  { label: 'Closed', value: 'closed' },
]

const statusVariant: Record<FinancingContractStatus, 'success' | 'warning' | 'danger' | 'muted' | 'default'> = {
  pending_disbursement: 'warning',
  active: 'success',
  in_grace: 'warning',
  in_arrears: 'danger',
  closed: 'muted',
  defaulted: 'danger',
  settled: 'default',
}

function daysSince(iso?: string): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function label(value: string) {
  return value.replaceAll('_', ' ')
}

export function AdminFinancingPage() {
  const [statusFilter, setStatusFilter] = useState<FinancingContractStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const { attach: statusPillAttach, style: statusPillStyle, visible: statusPillVisible } = useSlidingIndicator<HTMLDivElement>(statusFilter)
  const queryParams = useMemo(
    () => ({ status: statusFilter === 'all' ? undefined : statusFilter, page }),
    [statusFilter, page],
  )
  const { data, isLoading } = useAdminFinancingContracts(queryParams)
  const items = useMemo(() => data?.items ?? [], [data?.items])
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const stats = useMemo(() => {
    const active = items.filter((c) => c.status === 'active').length
    const atRisk = items.filter((c) => c.status === 'in_arrears' || c.status === 'defaulted').length
    const outstanding = items.reduce((sum, c) => sum + Math.max(0, c.totalRepayable - c.amountRepaid), 0)
    const pendingSignature = items.filter((c) => !c.signedByApplicant || !c.signedByFinancier).length

    return { active, atRisk, outstanding, pendingSignature }
  }, [items])

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Platform admin"
        title="Financing Operations"
        description="Monitor financing contracts across applicants, financiers, repayment health, signatures, and disbursement timing."
        icon={<Banknote size={22} />}
        accent="#10b981"
        meta={`${total} contracts platform-wide • Page ${page} of ${totalPages}`}
      />

      <AdminStatGrid>
        <AdminStatCard
          label="Total contracts"
          value={total.toLocaleString()}
          description={`${items.length.toLocaleString()} contracts visible in the current result set.`}
          icon={<FileSignature size={18} />}
          accent="#60a5fa"
        />
        <AdminStatCard
          label="Active on page"
          value={stats.active.toLocaleString()}
          description="Contracts currently performing and expected to keep collecting."
          icon={<CircleDollarSign size={18} />}
          accent="#10b981"
        />
        <AdminStatCard
          label="At risk"
          value={stats.atRisk.toLocaleString()}
          description="Visible contracts in arrears or default that need collections attention."
          icon={<AlertTriangle size={18} />}
          accent="#f43f5e"
        />
        <AdminStatCard
          label="Outstanding"
          value={formatCurrency(stats.outstanding)}
          description={`${stats.pendingSignature.toLocaleString()} visible contracts still need a complete signature set.`}
          icon={<ReceiptText size={18} />}
          accent="#f59e0b"
        />
      </AdminStatGrid>

      <AdminToolbar
        title="Contract filters"
        description="Filter by lifecycle status. Totals update from the current API result."
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
        <AdminLoadingState title="Loading financing contracts" description="Pulling the latest platform-wide financing ledger." />
      ) : items.length === 0 ? (
        <AdminEmptyState
          title="No contracts found"
          description="No financing contracts match the selected status filter."
          icon={<Banknote size={22} />}
        />
      ) : (
        <AdminTableCard
          title="Financing ledger"
          description="Applicant, financier, repayment progress, status, and disbursement timing in one operator view."
        >
          <table className={adminTableClassName('min-w-[980px]')}>
            <thead>
              <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted dark:border-[#252a3a]/70 dark:text-gray-500">
                <th className="px-4 py-3 font-bold">Applicant</th>
                <th className="px-4 py-3 font-bold">Financier</th>
                <th className="px-4 py-3 text-right font-bold">Principal</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Disbursement</th>
                <th className="px-4 py-3 text-right font-bold">Repayment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 dark:divide-[#252a3a]/50">
              {items.map((c) => {
                const days = daysSince(c.disbursedAt)
                const outstanding = Math.max(0, c.totalRepayable - c.amountRepaid)
                const paidPct = c.totalRepayable > 0 ? Math.min(100, Math.round((c.amountRepaid / c.totalRepayable) * 100)) : 0
                const signatures = Number(c.signedByApplicant) + Number(c.signedByFinancier)

                return (
                  <tr key={c.id} className="align-top transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-4">
                      <div className="font-bold text-primary-dark dark:text-white">{c.applicantName ?? c.applicantId.slice(0, 8)}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted dark:text-gray-500">
                        <Badge variant="muted" className="text-[10px] capitalize">{label(c.productType)}</Badge>
                        <span>{c.tenureMonths} months</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-primary-dark dark:text-white">{c.financierName ?? c.financierId.slice(0, 8)}</div>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted dark:text-gray-500">
                        <Landmark size={12} />
                        {c.annualInterestRate}% annual rate
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="font-bold text-primary-dark dark:text-white">{formatCurrency(c.principal)}</div>
                      <div className="text-[11px] text-muted dark:text-gray-500">{formatCurrency(c.monthlyPayment)} monthly</div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={statusVariant[c.status]} className="text-[10px] capitalize">{label(c.status)}</Badge>
                      <div className="mt-2 text-[11px] font-semibold text-muted dark:text-gray-500">{signatures}/2 signatures</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-primary-dark dark:text-white">{formatDate(c.disbursedAt)}</div>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted dark:text-gray-500">
                        <Clock3 size={12} />
                        {days === null ? 'Not disbursed' : `${days} days live`}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="font-bold text-primary-dark dark:text-white">{formatCurrency(outstanding)}</div>
                      <div className="ml-auto mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-gray-100 dark:bg-[#252a3a]">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">{paidPct}% repaid</div>
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
