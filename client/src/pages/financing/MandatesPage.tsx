import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import {
  useMyMandates, useCreateMandate, useRevokeMandate,
  useAgreements, useSavingsPlans, useFinancingContracts,
} from '@/hooks/useApi'
import { useToastStore } from '@/stores/toastStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, ShieldCheck, ShieldOff, ShieldAlert } from 'lucide-react'
import { GridSkeleton } from '@/components/ui/Skeleton'

const statusVariant = {
  pending: 'warning', active: 'success', paused: 'muted', revoked: 'danger', expired: 'muted',
} as const

export function MyMandatesPage() {
  const { data, isLoading } = useMyMandates()
  const { data: agreementsData } = useAgreements()
  const { data: savingsData } = useSavingsPlans()
  const { data: contractsData } = useFinancingContracts()
  const create = useCreateMandate()
  const revoke = useRevokeMandate()
  const addToast = useToastStore((s) => s.addToast)
  const [open, setOpen] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    allocationType: 'rent' as 'rent' | 'savings' | 'loan_repayment' | 'wallet_topup',
    targetEntityId: '',
    amountType: 'fixed' as 'fixed' | 'percentage',
    amount: '',
    startDate: today,
    signature: '',
  })

  const mandates = data?.items ?? []
  const activeAgreements = (agreementsData?.items ?? []).filter((a) => a.status === 'active')
  const activeSavings = (savingsData?.items ?? []).filter((s) => s.status === 'active')
  const activeContracts = (contractsData?.items ?? []).filter((c) => c.status === 'active' || c.status === 'in_arrears')

  const targetOptions = (() => {
    switch (form.allocationType) {
      case 'rent':
        return activeAgreements.map((a) => ({ value: a.id, label: `Rent · ${formatCurrency(a.rentAmount)}/mo` }))
      case 'savings':
        return activeSavings.map((s) => ({ value: s.id, label: `Savings · target ${formatCurrency(s.targetAmount)}` }))
      case 'loan_repayment':
        return activeContracts.map((c) => ({ value: c.id, label: `Loan ${c.id.slice(-6)} · ${formatCurrency(c.monthlyPayment)}/mo` }))
      case 'wallet_topup':
        return []
    }
  })()

  function submit() {
    create.mutate({
      allocationType: form.allocationType,
      targetEntityId: form.targetEntityId || undefined,
      amountType: form.amountType,
      amount: Number(form.amount),
      startDate: form.startDate,
      noticePeriodDays: 7,
      signature: form.signature,
    }, {
      onSuccess: () => {
        addToast('Mandate signed — pending employer approval', 'success')
        setOpen(false)
        setForm({ ...form, amount: '', signature: '', targetEntityId: '' })
      },
      onError: (e) => addToast((e as Error).message, 'error'),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold font-display text-primary-dark dark:text-white">Salary Deduction Mandates</h1>
          <p className="text-sm text-muted dark:text-gray-500">Authorize your employer to deduct rent, savings, or loan repayments from your salary</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> New Mandate</Button>
      </div>

      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldCheck size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-muted dark:text-gray-400">
            Under <span className="font-semibold text-primary-dark dark:text-white">Labour Act 2003 (Act 651), s. 70</span>, deductions from your wages require your written consent. You can revoke any mandate at any time — it takes effect on the next payroll cycle after the notice period.
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <GridSkeleton cols={2} count={4} />
      ) : mandates.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-sm text-muted dark:text-gray-500">No mandates yet — create one to enable salary-linked payments</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mandates.map((m) => (
            <Card key={m.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="capitalize">{m.allocationType.replace('_', ' ')}</CardTitle>
                    <p className="text-[11px] text-muted dark:text-gray-500 mt-0.5">{m.targetLabel}</p>
                  </div>
                  <Badge variant={statusVariant[m.status]} className="text-[10px] capitalize">{m.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
                  <Stat label="Amount" value={m.amountType === 'fixed' ? formatCurrency(m.amount) : `${m.amount}%`} />
                  <Stat label="Start date" value={formatDate(m.startDate).split(',')[0]} />
                  <Stat label="Signed" value={formatDate(m.signedAt).split(',')[0]} />
                  <Stat label="Notice" value={`${m.noticePeriodDays} days`} />
                </div>
                {m.status === 'active' && (
                  <Button size="sm" variant="outline" disabled={revoke.isPending} onClick={() => revoke.mutate({ id: m.id, reason: 'Revoked by employee' })}>
                    <ShieldOff size={12} /> Revoke
                  </Button>
                )}
                {m.status === 'pending' && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <ShieldAlert size={12} /> Awaiting employer approval
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Sign Salary Deduction Mandate">
        <div className="space-y-4">
          <Select
            id="m-alloc"
            label="Allocation type"
            value={form.allocationType}
            onChange={(e) => setForm((f) => ({ ...f, allocationType: e.target.value as typeof form.allocationType, targetEntityId: '' }))}
            options={[
              { value: 'rent', label: 'Rent — pay landlord directly' },
              { value: 'savings', label: 'Savings — auto-grow your RentGuard' },
              { value: 'loan_repayment', label: 'Loan repayment — financing contract' },
              { value: 'wallet_topup', label: 'Wallet topup — flexible spending' },
            ]}
          />
          {targetOptions.length > 0 && (
            <Select
              id="m-target"
              label="Target"
              value={form.targetEntityId}
              onChange={(e) => setForm((f) => ({ ...f, targetEntityId: e.target.value }))}
              options={[{ value: '', label: '— Select —' }, ...targetOptions]}
            />
          )}
          <Select
            id="m-amount-type"
            label="Amount type"
            value={form.amountType}
            onChange={(e) => setForm((f) => ({ ...f, amountType: e.target.value as typeof form.amountType }))}
            options={[
              { value: 'fixed', label: 'Fixed amount (GHS)' },
              { value: 'percentage', label: 'Percentage of salary (%)' },
            ]}
          />
          <Input id="m-amount" type="number" label={form.amountType === 'fixed' ? 'Amount (GHS)' : 'Percentage (%)'} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          <Input id="m-start" type="date" label="Start date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          <Input id="m-sig" label="Type your full name to sign" value={form.signature} onChange={(e) => setForm((f) => ({ ...f, signature: e.target.value }))} />
          <p className="text-[11px] text-muted dark:text-gray-500">By signing you authorize your employer to deduct this amount each pay period and disburse it to the selected target. You may revoke this mandate at any time.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending || !form.amount || form.signature.length < 3}>Sign Mandate</Button>
          </div>
        </div>
      </Modal>
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
