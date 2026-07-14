import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useFinancingContracts } from '@/hooks/useApi'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { FinancingContractStatus } from '@/types'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'

const statusVariant: Record<FinancingContractStatus, 'success' | 'warning' | 'danger' | 'muted' | 'default'> = {
  pending_disbursement: 'warning',
  active: 'success',
  in_grace: 'warning',
  in_arrears: 'danger',
  closed: 'muted',
  defaulted: 'danger',
  settled: 'default',
}

export function FinancingContractsPage() {
  const { data, isLoading } = useFinancingContracts()
  const user = useAuthStore((s) => s.user)
  const isFinancier = user?.activeRole === 'financier'
  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold font-display text-primary-dark dark:text-white">{isFinancier ? 'Active Portfolio' : 'My Financing Contracts'}</h1>
        <p className="text-sm text-muted dark:text-gray-500">{isFinancier ? 'All contracts you have funded' : 'Your active and past financing contracts'}</p>
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState preset="agreements" title="No contracts yet" description="Active financing contracts will appear here." />
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const pct = c.totalRepayable > 0 ? (c.amountRepaid / c.totalRepayable) * 100 : 0
            return (
              <Link key={c.id} to={`/financing/contracts/${c.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle>{isFinancier ? (c.applicantName ?? c.applicantId.slice(0, 8)) : `Contract ${c.id.slice(-6).toUpperCase()}`}</CardTitle>
                          <Badge variant={statusVariant[c.status]} className="text-[10px] capitalize">{c.status.replace('_', ' ')}</Badge>
                        </div>
                        <p className="text-[11px] text-muted dark:text-gray-500 mt-0.5 capitalize">{c.productType.replace('_', ' ')} · {c.tenureMonths} months · {c.annualInterestRate}% APR</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-extrabold font-display text-primary-dark dark:text-white">{formatCurrency(c.principal)}</p>
                        <p className="text-[10px] text-muted dark:text-gray-500">Disbursed {c.disbursedAt ? formatDate(c.disbursedAt).split(',')[0] : '—'}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted dark:text-gray-500">Repaid</span>
                      <span className="font-bold text-primary-dark dark:text-white">{formatCurrency(c.amountRepaid)} / {formatCurrency(c.totalRepayable)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          backgroundColor: c.status === 'in_arrears' || c.status === 'defaulted' ? '#ef4444' : c.status === 'settled' ? '#3b82f6' : '#10b981',
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                      <Stat label="Monthly" value={formatCurrency(c.monthlyPayment)} />
                      <Stat label="Total repayable" value={formatCurrency(c.totalRepayable)} />
                      <Stat label="Outstanding" value={formatCurrency(Math.max(0, c.totalRepayable - c.amountRepaid))} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted dark:text-gray-500">{label}</p>
      <p className="text-sm font-bold text-primary-dark dark:text-white">{value}</p>
    </div>
  )
}
