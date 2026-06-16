import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { usePayrollRun, useApprovePayrollRun, useProcessPayrollRun } from '@/hooks/useApi'
import { useToastStore } from '@/stores/toastStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react'
import { DetailSkeleton } from '@/components/ui/Skeleton'

export function PayrollRunDetailPage() {
  const { id = '' } = useParams()
  const { data: run } = usePayrollRun(id)
  const approve = useApprovePayrollRun()
  const process = useProcessPayrollRun()
  const addToast = useToastStore((s) => s.addToast)

  if (!run) return <DetailSkeleton />

  const canApprove = run.status === 'pending_approval' || run.status === 'draft'
  const canProcess = run.status === 'approved'

  return (
    <div className="space-y-4 max-w-5xl">
      <Link to="/employer/payroll" className="inline-flex items-center gap-1.5 text-sm text-muted dark:text-gray-500 hover:text-primary dark:hover:text-blue-400">
        <ArrowLeft size={14} /> Back to payroll
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">{run.periodLabel}</CardTitle>
              <p className="text-xs text-muted dark:text-gray-500 mt-1">
                {formatDate(run.periodStart).split(',')[0]} → {formatDate(run.periodEnd).split(',')[0]} · pay date {formatDate(run.scheduledPayDate).split(',')[0]}
              </p>
            </div>
            <Badge variant={run.status === 'processed' ? 'success' : run.status === 'failed' ? 'danger' : 'default'} className="text-[10px] capitalize">{run.status.replace('_', ' ')}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Metric label="Employees" value={String(run.employeeCount)} />
            <Metric label="Gross" value={formatCurrency(run.totalGross)} />
            <Metric label="Deductions" value={formatCurrency(run.totalDeductions)} />
            <Metric label="Net to disburse" value={formatCurrency(run.totalNet)} />
          </div>
          {run.failureReason && (
            <div className="p-3 rounded-lg bg-danger/10 text-danger text-xs mb-3">{run.failureReason}</div>
          )}
          <div className="flex items-center justify-end gap-2">
            {canApprove && (
              <Button variant="accent" disabled={approve.isPending} onClick={() => approve.mutate(run.id, {
                onSuccess: () => addToast('Run approved', 'success'),
                onError: (e) => addToast((e as Error).message, 'error'),
              })}>
                <CheckCircle2 size={14} /> Approve
              </Button>
            )}
            {canProcess && (
              <Button disabled={process.isPending} onClick={() => process.mutate(run.id, {
                onSuccess: () => addToast('Payroll processed', 'success'),
                onError: (e) => addToast((e as Error).message, 'error'),
              })}>
                <Send size={14} /> Process & Disburse
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Deductions ({run.deductions.length})</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted dark:text-gray-500 border-b border-border/40 dark:border-[#252a3a]/40">
                <th className="py-2 px-3 font-semibold">Employee</th>
                <th className="py-2 px-3 font-semibold">Allocation</th>
                <th className="py-2 px-3 font-semibold text-right">Amount</th>
                <th className="py-2 px-3 font-semibold">Reference</th>
                <th className="py-2 px-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {run.deductions.map((d, i) => (
                <tr key={`${d.mandateId}-${i}`} className="border-b border-border/20 dark:border-[#252a3a]/20">
                  <td className="py-2 px-3 font-bold text-primary-dark dark:text-white">{d.employeeName ?? d.employeeId.slice(0, 8)}</td>
                  <td className="py-2 px-3 capitalize text-muted dark:text-gray-400">{d.allocationType.replace('_', ' ')}</td>
                  <td className="py-2 px-3 text-right font-semibold text-primary-dark dark:text-white">{formatCurrency(d.amount)}</td>
                  <td className="py-2 px-3 text-muted dark:text-gray-500">{d.disbursementReference ?? d.failureReason ?? '—'}</td>
                  <td className="py-2 px-3">
                    <Badge variant={d.status === 'disbursed' ? 'success' : d.status === 'failed' ? 'danger' : d.status === 'skipped' ? 'muted' : 'warning'} className="text-[9px] capitalize">{d.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted dark:text-gray-500">{label}</p>
      <p className="text-base font-extrabold font-display text-primary-dark dark:text-white">{value}</p>
    </div>
  )
}
