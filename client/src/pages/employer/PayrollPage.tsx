import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { usePayrollRuns, useCreatePayrollRun } from '@/hooks/useApi'
import { useToastStore } from '@/stores/toastStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, ArrowRight } from 'lucide-react'
import { ListSkeleton } from '@/components/ui/Skeleton'

export function EmployerPayrollPage() {
  const { data, isLoading } = usePayrollRuns()
  const create = useCreatePayrollRun()
  const addToast = useToastStore((s) => s.addToast)
  const [open, setOpen] = useState(false)
  const today = new Date()
  const monthLabel = today.toLocaleString('default', { month: 'long', year: 'numeric' })
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)
  const [form, setForm] = useState({
    periodLabel: monthLabel, periodStart: monthStart, periodEnd: monthEnd,
    scheduledPayDate: monthEnd,
  })

  const runs = data?.items ?? []

  function submit() {
    create.mutate(form, {
      onSuccess: (run) => {
        addToast('Payroll run drafted', 'success')
        setOpen(false)
        // Optional: navigate to run detail; for now trigger no-op refetch
        void run
      },
      onError: (e) => addToast((e as Error).message, 'error'),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold font-display text-primary-dark dark:text-white">Payroll Runs</h1>
          <p className="text-sm text-muted dark:text-gray-500">Build, approve, and process your monthly payroll</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> New Run</Button>
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : runs.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <p className="text-sm font-semibold text-primary-dark dark:text-white">No payroll runs yet</p>
          <p className="text-xs text-muted dark:text-gray-500 mt-1 mb-4">Create a run to compute deductions for the current pay period.</p>
          <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Create First Run</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {runs.map((r) => (
            <Link key={r.id} to={`/employer/payroll/${r.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-primary-dark dark:text-white">{r.periodLabel}</p>
                        <Badge variant={r.status === 'processed' ? 'success' : r.status === 'failed' ? 'danger' : r.status === 'approved' ? 'default' : 'warning'} className="text-[10px] capitalize">{r.status.replace('_', ' ')}</Badge>
                      </div>
                      <p className="text-[11px] text-muted dark:text-gray-500 mt-0.5">
                        {formatDate(r.periodStart).split(',')[0]} → {formatDate(r.periodEnd).split(',')[0]} · {r.employeeCount} employees · pay date {formatDate(r.scheduledPayDate).split(',')[0]}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-extrabold font-display text-primary-dark dark:text-white">{formatCurrency(r.totalDeductions)}</p>
                      <p className="text-[10px] text-muted dark:text-gray-500">deducted</p>
                    </div>
                    <ArrowRight size={16} className="text-muted/40 dark:text-gray-600 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New Payroll Run">
        <div className="space-y-4">
          <Input id="run-label" label="Period label" value={form.periodLabel} onChange={(e) => setForm((f) => ({ ...f, periodLabel: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input id="run-start" type="date" label="Period start" value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} />
            <Input id="run-end" type="date" label="Period end" value={form.periodEnd} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} />
          </div>
          <Input id="run-paydate" type="date" label="Scheduled pay date" value={form.scheduledPayDate} onChange={(e) => setForm((f) => ({ ...f, scheduledPayDate: e.target.value }))} />
          <p className="text-xs text-muted dark:text-gray-500">All active deduction mandates will be applied to each active employee, capped at one-third of their net salary.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Building…' : 'Build Run'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
