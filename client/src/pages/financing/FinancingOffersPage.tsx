import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { useFinancingOffers, useApplyForFinancing, useAgreements } from '@/hooks/useApi'
import { useToastStore } from '@/stores/toastStore'
import { formatCurrency } from '@/lib/utils'
import { Banknote, Sparkles, Send } from 'lucide-react'
import type { FinancingOffer } from '@/types'

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
    willUsePayrollDeduction: false,
  })

  const offers = data?.items ?? []
  const agreements = (agreementsData?.items ?? []).filter((a) => a.status === 'active' || a.status === 'pending_signatures')

  function openApply(offer: FinancingOffer) {
    setSelected(offer)
    setForm({
      amountRequested: String(offer.minAmount),
      tenureMonths: String(offer.minTenureMonths),
      purpose: '',
      agreementId: '',
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
      <div>
        <h1 className="text-xl font-extrabold font-display text-primary-dark dark:text-white">Financing Marketplace</h1>
        <p className="text-sm text-muted dark:text-gray-500">Get rent advance, deposit loans, and rent-to-own — repay monthly</p>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted">Loading offers…</CardContent></Card>
      ) : offers.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-sm text-muted dark:text-gray-500">No active offers right now</CardContent></Card>
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
                  <Badge variant="success" className="text-[10px]">{o.annualInterestRate}% APR</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <p className="text-xs text-muted dark:text-gray-400 line-clamp-3 mb-3 flex-1">{o.description}</p>
                <div className="space-y-1 text-xs mb-4">
                  <Row label="Amount" value={`${formatCurrency(o.minAmount)} – ${formatCurrency(o.maxAmount)}`} />
                  <Row label="Tenure" value={`${o.minTenureMonths}–${o.maxTenureMonths} months`} />
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
              <p className="text-muted dark:text-gray-500">APR: <span className="font-bold text-primary-dark dark:text-white">{selected.annualInterestRate}%</span> · Processing fee: <span className="font-bold text-primary-dark dark:text-white">{selected.processingFeePct}%</span></p>
            </div>
            <Input id="apply-amount" type="number" label="Amount requested (GHS)" value={form.amountRequested} onChange={(e) => setForm((f) => ({ ...f, amountRequested: e.target.value }))} />
            <Input id="apply-tenure" type="number" label="Tenure (months)" value={form.tenureMonths} onChange={(e) => setForm((f) => ({ ...f, tenureMonths: e.target.value }))} />
            <Textarea id="apply-purpose" label="Purpose" value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} rows={3} placeholder="What will you use this for?" />
            {agreements.length > 0 && (
              <Select
                id="apply-agreement"
                label="Link to rental agreement (optional)"
                value={form.agreementId}
                onChange={(e) => setForm((f) => ({ ...f, agreementId: e.target.value }))}
                options={[{ value: '', label: '— None —' }, ...agreements.map((a) => ({ value: a.id, label: `${a.tenantName ?? 'Lease'} · ${formatCurrency(a.rentAmount)}/mo` }))]}
              />
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.willUsePayrollDeduction} onChange={(e) => setForm((f) => ({ ...f, willUsePayrollDeduction: e.target.checked }))} />
              <span className="text-primary-dark dark:text-white">Repay via payroll deduction</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
              <Button onClick={submit} disabled={apply.isPending || !form.amountRequested || !form.tenureMonths || form.purpose.length < 5}>
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
