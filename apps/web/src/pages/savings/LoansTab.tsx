import { useState, type FormEvent } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Banknote } from 'lucide-react'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Loan, LoanQuote, LoanTerms } from '@/types/shared'

const STATUS: Record<string, { label: string; variant: 'warning' | 'success' | 'default' | 'danger' | 'muted' }> = {
  pending: { label: 'Awaiting review', variant: 'warning' },
  pre_qualified: { label: 'Pre-qualified — awaiting lender review', variant: 'warning' },
  pending_review: { label: 'Awaiting review by a person', variant: 'warning' },
  approved: { label: 'Approved — awaiting disbursement', variant: 'success' },
  active: { label: 'Active', variant: 'default' },
  repaid: { label: 'Repaid', variant: 'success' },
  defaulted: { label: 'Defaulted', variant: 'danger' },
  rejected: { label: 'Declined', variant: 'danger' },
}

const OPEN = ['pending', 'pre_qualified', 'pending_review', 'approved', 'active', 'defaulted']

export function LoansTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['loans'],
    queryFn: () => api.get<{ items: Loan[] }>('/loans'),
  })
  const { data: terms } = useQuery({ queryKey: ['loan-terms'], queryFn: () => api.get<LoanTerms>('/loans/terms') })
  const [showApply, setShowApply] = useState(false)

  const repayMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => api.post(`/loans/${id}/repay`, { amount }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); qc.invalidateQueries({ queryKey: ['wallet'] }) },
  })
  const reviewMutation = useMutation({
    mutationFn: (id: string) => api.post(`/loans/${id}/request-review`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loans'] }),
  })

  const loans = data?.items ?? []
  const openLoan = loans.find((l) => OPEN.includes(l.status))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-primary-dark">Personal Loans</h3>
        {!openLoan && terms && <Button size="sm" onClick={() => setShowApply(true)}><Banknote size={14} /> Apply</Button>}
      </div>

      {terms && (
        <div className="rounded-md bg-primary/5 border border-primary/10 p-3 text-sm text-primary-dark">
          Personal loan of {formatCurrency(terms.minAmount)}–{formatCurrency(terms.maxAmount)}, repaid monthly over {terms.minTenureMonths}–{terms.maxTenureMonths} months.
          Interest is {terms.annualInterestRate}% a year{terms.processingFeePct > 0 ? ` plus a ${terms.processingFeePct}% processing fee` : ''}; you see the APR, total cost and every repayment before you confirm.
          Borrowing costs money and missed repayments can affect your credit score. A lender reviews every application and nothing is paid until the lender approves and disburses it.
        </div>
      )}

      {reviewMutation.isError && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{(reviewMutation.error as Error).message}</div>}

      {isLoading ? (
        <ListSkeleton rows={2} />
      ) : loans.length === 0 ? (
        <EmptyState preset="general" title="No loans yet" description="Your loan applications and repayments will appear here." />
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => {
            const remaining = loan.totalRepayment - loan.amountPaid
            const pct = loan.totalRepayment > 0 ? Math.round((loan.amountPaid / loan.totalRepayment) * 100) : 0
            const status = STATUS[loan.status] ?? { label: loan.status, variant: 'muted' as const }
            const canRequestReview = loan.status === 'rejected' && loan.automatedAssessment?.outcome === 'declined' && !loan.reviewedBy && !loan.reviewRequestedAt

            return (
              <Card key={loan.id}>
                <CardContent>
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-primary-dark">{formatCurrency(loan.amount)} Loan</h4>
                      <p className="text-xs text-muted">
                        {loan.tenure} months at {loan.interestRate}% a year{loan.apr != null ? ` (APR ${loan.apr}%)` : ''} · total {formatCurrency(loan.totalRepayment)} - {loan.reason}
                      </p>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>

                  {(loan.decisionReason || (loan.status === 'rejected' && loan.automatedAssessment)) && (
                    <p className="text-xs text-muted mb-2">
                      {loan.decisionReason
                        ? `Reviewer's reason: ${loan.decisionReason}`
                        : `Automated assessment: ${loan.automatedAssessment!.reasons.join(' ')}`}
                    </p>
                  )}
                  {canRequestReview && (
                    <Button size="sm" variant="outline" onClick={() => reviewMutation.mutate(loan.id)} disabled={reviewMutation.isPending}>
                      Ask for a person to review this decision
                    </Button>
                  )}

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
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {terms && showApply && <ApplyLoanModal open onClose={() => setShowApply(false)} terms={terms} />}
    </div>
  )
}

function ApplyLoanModal({ open, onClose, terms }: { open: boolean; onClose: () => void; terms: LoanTerms }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ agreementId: '', amount: '', tenure: String(terms.minTenureMonths), reason: '' })
  const [quote, setQuote] = useState<LoanQuote | null>(null)
  const [accepted, setAccepted] = useState(false)

  const { data: agreements } = useQuery({
    queryKey: ['agreements', 'loan-eligible'],
    queryFn: () => api.get<{ items: { id: string; status: string; rentAmount: number }[] }>('/agreements'),
  })
  const activeAgreements = (agreements?.items ?? []).filter((a) => a.status === 'active')

  const quoteMutation = useMutation({
    mutationFn: () => api.get<LoanQuote>(`/loans/quote?amount=${Number(form.amount)}&tenure=${Number(form.tenure)}`),
    onSuccess: (q) => { setQuote(q); setAccepted(false) },
  })
  const applyMutation = useMutation({
    mutationFn: (body: unknown) => api.post('/loans/apply', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans'] }); onClose() },
  })

  const update = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); setQuote(null) }

  function handleReview(e: FormEvent) {
    e.preventDefault()
    quoteMutation.mutate()
  }

  function handleConfirm() {
    if (!quote) return
    applyMutation.mutate({
      agreementId: form.agreementId, amount: quote.principal, tenure: quote.tenureMonths, reason: form.reason,
      acceptTerms: accepted, quotedApr: quote.apr, quotedTotalRepayment: quote.totalRepayable,
    })
  }

  const tenureOptions = Array.from({ length: terms.maxTenureMonths - terms.minTenureMonths + 1 }, (_, i) => {
    const m = terms.minTenureMonths + i
    return { value: String(m), label: `${m} months` }
  })

  return (
    <Modal open={open} onClose={onClose} title="Apply for a Personal Loan">
      {!quote ? (
        <form onSubmit={handleReview} className="flex flex-col gap-5 pt-2">
          <Select
            id="agreementId"
            label="Rental agreement (signed and active)"
            value={form.agreementId}
            onChange={(e) => update({ agreementId: e.target.value })}
            options={[{ value: '', label: activeAgreements.length ? 'Choose an agreement' : 'No active signed agreements' }, ...activeAgreements.map((a) => ({ value: a.id, label: `${formatCurrency(a.rentAmount)}/mo · #${a.id.slice(-6)}` }))]}
            required
          />
          <Input id="amount" label="Amount (GHS)" type="number" value={form.amount} onChange={(e) => update({ amount: e.target.value })} required min={String(terms.minAmount)} max={String(terms.maxAmount)} />
          <Select id="tenure" label="Repayment period" value={form.tenure} onChange={(e) => update({ tenure: e.target.value })} options={tenureOptions} />
          <Textarea id="reason" label="Reason" value={form.reason} onChange={(e) => update({ reason: e.target.value })} required placeholder="Why do you need this loan? (min 10 chars)" minLength={10} aiContext="loan application reason" />

          {quoteMutation.isError && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{(quoteMutation.error as Error).message}</div>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!form.agreementId || quoteMutation.isPending}>{quoteMutation.isPending ? 'Calculating...' : 'Review terms'}</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4 pt-2">
          <div className="rounded-md bg-surface p-3 text-sm space-y-1">
            <p>Amount borrowed: <strong>{formatCurrency(quote.principal)}</strong></p>
            {quote.processingFee > 0 && <p>Processing fee (deducted): <strong>{formatCurrency(quote.processingFee)}</strong></p>}
            <p>You receive: <strong>{formatCurrency(quote.netDisbursed)}</strong></p>
            <p>Interest rate: <strong>{quote.annualInterestRate}% a year</strong></p>
            <p>APR (interest and fees): <strong>{quote.apr}%</strong></p>
            <p>{quote.tenureMonths} monthly payments of about <strong>{formatCurrency(quote.monthlyPayment)}</strong></p>
            <p>Total repayment: <strong>{formatCurrency(quote.totalRepayable)}</strong></p>
            <p>Total cost of credit: <strong>{formatCurrency(quote.totalCostOfCredit)}</strong></p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-muted text-left"><th className="py-1">Payment</th><th>Principal</th><th>Interest</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {quote.schedule.map((row) => (
                  <tr key={row.installmentNumber} className="border-t border-border">
                    <td className="py-1">Month {row.installmentNumber}</td>
                    <td>{formatCurrency(row.principal)}</td>
                    <td>{formatCurrency(row.interest)}</td>
                    <td className="text-right">{formatCurrency(row.amountDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Payments start one month after the lender disburses the loan. Applying does not guarantee approval.</p>
          <label className="flex items-center gap-2.5 text-sm text-primary-dark dark:text-gray-300 cursor-pointer">
            <Switch checked={accepted} onChange={(v) => setAccepted(v)} size="sm" />
            <span>I have read these terms and accept them</span>
          </label>

          {applyMutation.isError && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{(applyMutation.error as Error).message}</div>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setQuote(null)}>Back</Button>
            <Button type="button" onClick={handleConfirm} disabled={!accepted || applyMutation.isPending}>{applyMutation.isPending ? 'Submitting...' : 'Confirm and apply'}</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
