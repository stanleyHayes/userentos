import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { GridSkeleton } from '@/components/ui/Skeleton'
import { useFinancingOffers, useApplyForFinancing, useAgreements } from '@/hooks/useApi'
import { useToastStore } from '@/stores/toastStore'
import { formatCurrency } from '@/lib/utils'
import { Banknote, Sparkles, Send } from 'lucide-react'
import type { FinancingOffer } from '@/types'
import type { LoanQuote } from '@/types/shared'

export function FinancingOffersPage() {
  const { data, isLoading } = useFinancingOffers()
  const { data: agreementsData } = useAgreements()
  const apply = useApplyForFinancing()
  const addToast = useToastStore((s) => s.addToast)
  const [selected, setSelected] = useState<FinancingOffer | null>(null)
  const [form, setForm] = useState({
    amountRequested: '',
    tenureMonths: '',
    purpose: '',
    agreementId: '',
    advanceMonths: '',
    willUsePayrollDeduction: false,
  })

  const offers = data?.items ?? []
  // Only a tenancy that is in force can back financing; a rent advance requires one.
  const agreements = (agreementsData?.items ?? []).filter((a) => a.status === 'active')
  const isRentAdvance = selected?.productType === 'rent_advance'
  const amount = Number(form.amountRequested)
  const tenure = Number(form.tenureMonths)
  const quoteReady = !!selected && amount >= selected.minAmount && amount <= selected.maxAmount && tenure >= selected.minTenureMonths && tenure <= selected.maxTenureMonths
  const { data: quote } = useQuery({
    queryKey: ['financing-quote', selected?.id, amount, tenure],
    queryFn: () => api.get<LoanQuote>(`/financing/offers/${selected!.id}/quote?amount=${amount}&tenure=${tenure}`),
    enabled: quoteReady,
  })

  function openApply(offer: FinancingOffer) {
    setSelected(offer)
    setForm({
      amountRequested: String(offer.minAmount),
      tenureMonths: String(offer.minTenureMonths),
      purpose: '',
      agreementId: '',
      advanceMonths: '',
      willUsePayrollDeduction: offer.requiresPayrollDeduction,
    })
  }

  function submit() {
    if (!selected) return
    apply.mutate({
      offerId: selected.id,
      amountRequested: Number(form.amountRequested),
      tenureMonths: Number(form.tenureMonths),
      purpose: form.purpose,
      agreementId: form.agreementId || undefined,
      advanceMonths: isRentAdvance ? Number(form.advanceMonths) : undefined,
      willUsePayrollDeduction: form.willUsePayrollDeduction,
    }, {
      onSuccess: () => {
        addToast('Application submitted', 'success')
        setSelected(null)
      },
      onError: (e) => addToast((e as Error).message, 'error'),
    })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Financing"
        title="Financing Marketplace"
        description="Get rent advance, deposit loans, and rent-to-own — repay monthly."
        icon={<Banknote size={22} />}
      />

      {isLoading ? (
        <GridSkeleton cols={3} count={3} />
      ) : offers.length === 0 ? (
        <EmptyState
          icon={<Banknote size={40} />}
          title="No financing offers yet"
          description="Lenders have not published any offers for your situation. Check back soon — new rent advance and deposit loan products appear here as financiers list them."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {offers.map((o) => (
            <Card key={o.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>{o.name}</CardTitle>
                    <p className="text-[11px] text-muted dark:text-gray-500 capitalize mt-0.5">{o.productType.replace('_', ' ')}</p>
                  </div>
                  <Badge variant="success" className="text-[10px]">
                    {o.aprRange ? `APR ${o.aprRange.min}–${o.aprRange.max}%` : `${o.annualInterestRate}% interest`}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <p className="text-xs text-muted dark:text-gray-400 line-clamp-3 mb-3 flex-1">{o.description}</p>
                <div className="space-y-1 text-xs mb-4">
                  <Row label="Amount" value={`${formatCurrency(o.minAmount)} – ${formatCurrency(o.maxAmount)}`} />
                  <Row label="Tenure" value={`${o.minTenureMonths}–${o.maxTenureMonths} months`} />
                  <Row label="Interest rate" value={`${o.annualInterestRate}% a year`} />
                  <Row label="Processing fee" value={`${o.processingFeePct}%`} />
                  <Row label="Min credit score" value={String(o.minCreditScore)} />
                </div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {o.requiresEmployment && <Badge variant="default" className="text-[9px]">Employment required</Badge>}
                  {o.requiresPayrollDeduction && <Badge variant="warning" className="text-[9px]"><Sparkles size={9} /> Payroll deduction</Badge>}
                </div>
                <Button size="sm" onClick={() => openApply(o)}><Banknote size={12} /> Apply</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={`Apply — ${selected?.name ?? ''}`}>
        {selected && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-surface dark:bg-[#0c0e1a] text-xs">
              <p className="text-muted dark:text-gray-500">Allowed amount: <span className="font-bold text-primary-dark dark:text-white">{formatCurrency(selected.minAmount)} – {formatCurrency(selected.maxAmount)}</span></p>
              <p className="text-muted dark:text-gray-500">Tenure: <span className="font-bold text-primary-dark dark:text-white">{selected.minTenureMonths}–{selected.maxTenureMonths} months</span></p>
              <p className="text-muted dark:text-gray-500">Interest: <span className="font-bold text-primary-dark dark:text-white">{selected.annualInterestRate}% a year</span> · Processing fee: <span className="font-bold text-primary-dark dark:text-white">{selected.processingFeePct}%</span></p>
              {isRentAdvance && <p className="text-muted dark:text-gray-500 mt-1">A rent advance is paid to your landlord and cannot exceed what the Rent Act allows: six months' rent (one month for a monthly tenancy).</p>}
            </div>
            <Input id="apply-amount" type="number" label="Amount requested (GHS)" value={form.amountRequested} onChange={(e) => setForm((f) => ({ ...f, amountRequested: e.target.value }))} />
            <Input id="apply-tenure" type="number" label="Tenure (months)" value={form.tenureMonths} onChange={(e) => setForm((f) => ({ ...f, tenureMonths: e.target.value }))} />
            <Textarea id="apply-purpose" label="Purpose" value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} rows={3} placeholder="What will you use this for?" />
            {(agreements.length > 0 || isRentAdvance) && (
              <Select
                id="apply-agreement"
                label={isRentAdvance ? 'Signed, active rental agreement' : 'Link to rental agreement (optional)'}
                value={form.agreementId}
                onChange={(e) => setForm((f) => ({ ...f, agreementId: e.target.value }))}
                options={[{ value: '', label: isRentAdvance ? (agreements.length ? 'Choose an agreement' : 'No active agreements') : '— None —' }, ...agreements.map((a) => ({ value: a.id, label: `${a.tenantName ?? 'Lease'} · ${formatCurrency(a.rentAmount)}/mo` }))]}
              />
            )}
            {isRentAdvance && (
              <Input id="apply-advance-months" type="number" label="Months of rent to advance (max 6)" value={form.advanceMonths} onChange={(e) => setForm((f) => ({ ...f, advanceMonths: e.target.value }))} />
            )}
            {quote && (
              <div className="p-3 rounded-lg bg-surface dark:bg-[#0c0e1a] text-xs space-y-0.5">
                <p>You receive <strong>{formatCurrency(quote.netDisbursed)}</strong> after a {formatCurrency(quote.processingFee)} fee</p>
                <p>{quote.tenureMonths} payments of about <strong>{formatCurrency(quote.monthlyPayment)}</strong> · total <strong>{formatCurrency(quote.totalRepayable)}</strong></p>
                <p>APR including fees <strong>{quote.apr}%</strong> · total cost of credit <strong>{formatCurrency(quote.totalCostOfCredit)}</strong></p>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.willUsePayrollDeduction} onChange={(e) => setForm((f) => ({ ...f, willUsePayrollDeduction: e.target.checked }))} />
              <span className="text-primary-dark dark:text-white">Repay via payroll deduction</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
              <Button onClick={submit} disabled={apply.isPending || !form.amountRequested || !form.tenureMonths || form.purpose.length < 5 || (isRentAdvance && (!form.agreementId || !form.advanceMonths))}>
                <Send size={14} /> Submit Application
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted dark:text-gray-500">{label}</span>
      <span className="font-semibold text-primary-dark dark:text-white">{value}</span>
    </div>
  )
}
