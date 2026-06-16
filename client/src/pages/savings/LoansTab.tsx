import { useState, type FormEvent } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Banknote } from 'lucide-react'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'

interface Loan {
  id: string; amount: number; interestRate: number; tenure: number
  monthlyPayment: number; totalRepayment: number; amountPaid: number
  status: string; reason: string; creditScoreAtApproval?: number; disbursedAt?: string
}

export function LoansTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['loans'],
    queryFn: () => api.get<{ items: Loan[] }>('/loans'),
  })
  const [showApply, setShowApply] = useState(false)

  const disburseMutation = useMutation({
    mutationFn: (id: string) => api.post(`/loans/${id}/disburse`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); qc.invalidateQueries({ queryKey: ['wallet'] }) },
  })

  const repayMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => api.post(`/loans/${id}/repay`, { amount }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); qc.invalidateQueries({ queryKey: ['wallet'] }) },
  })

  const loans = data?.items ?? []
  const activeLoan = loans.find((l) => l.status === 'active' || l.status === 'approved')

  const statusVariant: Record<string, 'warning' | 'success' | 'default' | 'danger' | 'muted'> = {
    pending: 'warning', approved: 'success', active: 'default', repaid: 'success', defaulted: 'danger', rejected: 'danger',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-primary-dark">Micro-Loans</h3>
        {!activeLoan && <Button size="sm" onClick={() => setShowApply(true)}><Banknote size={14} /> Apply</Button>}
      </div>

      <div className="rounded-md bg-primary/5 border border-primary/10 p-3 text-sm text-primary-dark">
        Rent shortfall protection: borrow up to GHS 10,000 to cover your rent when savings fall short. Requires a credit score of 50+.
      </div>

      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : loans.length === 0 ? (
        <EmptyState preset="general" title="No loans yet" description="Apply for a micro-loan when you need help covering rent." />
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => {
            const remaining = loan.totalRepayment - loan.amountPaid
            const pct = Math.round((loan.amountPaid / loan.totalRepayment) * 100)

            return (
              <Card key={loan.id}>
                <CardContent>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-primary-dark">{formatCurrency(loan.amount)} Loan</h4>
                      <p className="text-xs text-muted">{loan.tenure} months at {loan.interestRate}% - {loan.reason}</p>
                    </div>
                    <Badge variant={statusVariant[loan.status]}>{loan.status}</Badge>
                  </div>

                  {loan.status === 'active' && (
                    <>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted">Repayment progress</span>
                        <span className="font-medium">{pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface overflow-hidden mb-2">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-muted mb-3">
                        <span>Paid: {formatCurrency(loan.amountPaid)}</span>
                        <span>Remaining: {formatCurrency(remaining)}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => repayMutation.mutate({ id: loan.id, amount: loan.monthlyPayment })} disabled={repayMutation.isPending}>
                          Pay {formatCurrency(loan.monthlyPayment)}
                        </Button>
                        <Button size="sm" onClick={() => repayMutation.mutate({ id: loan.id, amount: remaining })} disabled={repayMutation.isPending}>
                          Pay All ({formatCurrency(remaining)})
                        </Button>
                      </div>
                    </>
                  )}

                  {loan.status === 'approved' && (
                    <Button size="sm" onClick={() => disburseMutation.mutate(loan.id)} disabled={disburseMutation.isPending}>
                      {disburseMutation.isPending ? 'Processing...' : 'Receive Funds to Wallet'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <ApplyLoanModal open={showApply} onClose={() => setShowApply(false)} />
    </div>
  )
}

function ApplyLoanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ agreementId: '', amount: '', tenure: '3', reason: '' })

  const applyMutation = useMutation({
    mutationFn: (body: unknown) => api.post('/loans/apply', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); onClose() },
  })

  const amount = Number(form.amount) || 0
  const tenure = Number(form.tenure) || 3
  const rate = 15 / 100 / 12
  const monthlyPayment = amount > 0 ? (amount * rate * Math.pow(1 + rate, tenure)) / (Math.pow(1 + rate, tenure) - 1) : 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    applyMutation.mutate({ agreementId: form.agreementId, amount, tenure, reason: form.reason })
  }

  return (
    <Modal open={open} onClose={onClose} title="Apply for Micro-Loan">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 pt-2">
        <Input id="agreementId" label="Agreement ID" value={form.agreementId} onChange={(e) => setForm((f) => ({ ...f, agreementId: e.target.value }))} required placeholder="Your active agreement ID" />
        <Input id="amount" label="Amount (GHS)" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required min="50" max="10000" />
        <Input id="tenure" label="Repayment Period (months)" type="number" value={form.tenure} onChange={(e) => setForm((f) => ({ ...f, tenure: e.target.value }))} required min="1" max="12" />
        <Textarea id="reason" label="Reason" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} required placeholder="Why do you need this loan? (min 10 chars)" minLength={10} aiContext="loan application reason" />

        {amount > 0 && (
          <div className="rounded-md bg-surface p-3 text-sm space-y-1">
            <p>Interest rate: <strong>15% annual</strong></p>
            <p>Monthly payment: <strong>{formatCurrency(Math.round(monthlyPayment * 100) / 100)}</strong></p>
            <p>Total repayment: <strong>{formatCurrency(Math.round(monthlyPayment * tenure * 100) / 100)}</strong></p>
          </div>
        )}

        {applyMutation.isError && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{(applyMutation.error as Error).message}</div>}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={applyMutation.isPending}>{applyMutation.isPending ? 'Submitting...' : 'Apply'}</Button>
        </div>
      </form>
    </Modal>
  )
}
