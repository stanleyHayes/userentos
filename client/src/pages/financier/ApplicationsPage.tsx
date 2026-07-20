import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useFinancingApplications, useDecideFinancingApplication } from '@/hooks/useApi'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CheckCircle2, X } from 'lucide-react'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'

const statusVariant = {
  draft: 'muted', submitted: 'warning', under_review: 'warning',
  approved: 'success', rejected: 'danger', withdrawn: 'muted',
} as const

export function FinancingApplicationsPage() {
  const { data, isLoading } = useFinancingApplications()
  const decide = useDecideFinancingApplication()
  const addToast = useToastStore((s) => s.addToast)
  const user = useAuthStore((s) => s.user)
  const isFinancier = user?.activeRole === 'financier'
  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold font-display text-primary-dark dark:text-white">{isFinancier ? 'Applications Inbox' : 'My Financing Applications'}</h1>
        <p className="text-sm text-muted dark:text-gray-500">{isFinancier ? 'Review, approve, or reject incoming applications' : 'Track your financing requests'}</p>
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState preset="agreements" title="No applications yet" description="Financing applications from tenants will appear here once they apply." />
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle>{isFinancier ? (a.applicantName ?? 'Applicant') : `Application ${a.id.slice(-6).toUpperCase()}`}</CardTitle>
                      <Badge variant={statusVariant[a.status] ?? 'muted'} className="text-[10px] capitalize">{a.status.replace('_', ' ')}</Badge>
                    </div>
                    <p className="text-[11px] text-muted dark:text-gray-500 mt-0.5">Submitted {formatDate(a.createdAt)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-extrabold font-display text-primary-dark dark:text-white">{formatCurrency(a.amountRequested)}</p>
                    <p className="text-[10px] text-muted dark:text-gray-500">{a.tenureMonths} months</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-primary-dark dark:text-gray-300 mb-3">{a.purpose}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <Stat label="Credit score" value={a.creditScoreAtApply ?? '—'} />
                  <Stat label="Monthly income" value={a.monthlyIncomeAtApply ? formatCurrency(a.monthlyIncomeAtApply) : '—'} />
                  <Stat label="Payroll deduction" value={a.willUsePayrollDeduction ? 'Yes' : 'No'} />
                  <Stat label="Has employer" value={a.employerId ? 'Yes' : 'No'} />
                </div>
                {a.decisionNotes && (
                  <div className="mt-3 p-2 rounded-lg bg-surface dark:bg-[#0c0e1a] text-xs text-muted dark:text-gray-400">
                    <span className="font-semibold">Decision: </span>{a.decisionNotes}
                  </div>
                )}
                {isFinancier && (a.status === 'submitted' || a.status === 'under_review') && (
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, action: 'reject', notes: 'Declined' }, { onError: (e) => addToast((e as Error).message, 'error') })}>
                      <X size={12} /> Reject
                    </Button>
                    <Button size="sm" variant="accent" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, action: 'approve' }, { onError: (e) => addToast((e as Error).message, 'error') })}>
                      <CheckCircle2 size={12} /> Approve & generate contract
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted dark:text-gray-500">{label}</p>
      <p className="text-sm font-bold text-primary-dark dark:text-white">{value}</p>
    </div>
  )
}
