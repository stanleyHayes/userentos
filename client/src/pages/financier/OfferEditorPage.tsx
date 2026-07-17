import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { useCreateFinancingOffer } from '@/hooks/useApi'
import { useToastStore } from '@/stores/toastStore'

export function OfferEditorPage() {
  const navigate = useNavigate()
  const create = useCreateFinancingOffer()
  const addToast = useToastStore((s) => s.addToast)
  const [form, setForm] = useState({
    name: '',
    productType: 'rent_advance' as 'rent_advance' | 'deposit_loan' | 'rent_to_own',
    description: '',
    minAmount: '1000',
    maxAmount: '50000',
    minTenureMonths: '6',
    maxTenureMonths: '24',
    annualInterestRate: '18',
    processingFeePct: '2',
    lateFeePct: '5',
    minCreditScore: '50',
    requiresEmployment: true,
    requiresPayrollDeduction: false,
  })

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  /** Cross-field validation — NaN/invalid combos must never reach the server. */
  function validate(): string | null {
    const minAmount = Number(form.minAmount)
    const maxAmount = Number(form.maxAmount)
    const minTenure = Number(form.minTenureMonths)
    const maxTenure = Number(form.maxTenureMonths)
    const rate = Number(form.annualInterestRate)
    const fee = Number(form.processingFeePct)
    const lateFee = Number(form.lateFeePct)
    const credit = Number(form.minCreditScore)

    if (!form.name.trim()) return 'Offer name is required'
    if (!form.description.trim()) return 'Description is required'
    for (const [label, v] of [['Min amount', minAmount], ['Max amount', maxAmount], ['Min tenure', minTenure], ['Max tenure', maxTenure], ['Interest rate', rate], ['Processing fee', fee], ['Late fee', lateFee], ['Min credit score', credit]] as const) {
      if (!Number.isFinite(v)) return `${label} must be a valid number`
    }
    if (minAmount <= 0) return 'Min amount must be greater than 0'
    if (minAmount > maxAmount) return 'Min amount cannot exceed max amount'
    if (minTenure <= 0) return 'Min tenure must be at least 1 month'
    if (minTenure > maxTenure) return 'Min tenure cannot exceed max tenure'
    if (rate < 0 || rate > 100) return 'Interest rate must be between 0 and 100%'
    if (fee < 0 || fee > 100) return 'Processing fee must be between 0 and 100%'
    if (lateFee < 0 || lateFee > 100) return 'Late fee must be between 0 and 100%'
    if (credit < 0 || credit > 100) return 'Min credit score must be between 0 and 100'
    return null
  }

  function submit() {
    const problem = validate()
    if (problem) {
      addToast(problem, 'error')
      return
    }
    create.mutate({
      name: form.name,
      productType: form.productType,
      description: form.description,
      minAmount: Number(form.minAmount),
      maxAmount: Number(form.maxAmount),
      minTenureMonths: Number(form.minTenureMonths),
      maxTenureMonths: Number(form.maxTenureMonths),
      annualInterestRate: Number(form.annualInterestRate),
      processingFeePct: Number(form.processingFeePct),
      lateFeePct: Number(form.lateFeePct),
      minCreditScore: Number(form.minCreditScore),
      requiresEmployment: form.requiresEmployment,
      requiresPayrollDeduction: form.requiresPayrollDeduction,
    }, {
      onSuccess: () => {
        addToast('Offer created', 'success')
        navigate('/financing/offers')
      },
      onError: (e) => addToast((e as Error).message, 'error'),
    })
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-extrabold font-display text-primary-dark dark:text-white">New Financing Offer</h1>
        <p className="text-sm text-muted dark:text-gray-500">Define a lending product for tenants and landlords</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Product</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Input id="offer-name" label="Offer name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Bloom Rent Advance" />
          <Select
            id="offer-type"
            label="Product type"
            value={form.productType}
            onChange={(e) => update('productType', e.target.value as typeof form.productType)}
            options={[
              { value: 'rent_advance', label: 'Rent Advance — pay landlord upfront' },
              { value: 'deposit_loan', label: 'Deposit Loan — cover deposit & move-in' },
              { value: 'rent_to_own', label: 'Rent-to-Own' },
            ]}
          />
          <Textarea id="offer-desc" label="Description" value={form.description} onChange={(e) => update('description', e.target.value)} rows={3} placeholder="Briefly describe the product…" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Limits & Pricing</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input id="o-min-amt" type="number" label="Min amount (GHS)" value={form.minAmount} onChange={(e) => update('minAmount', e.target.value)} />
          <Input id="o-max-amt" type="number" label="Max amount (GHS)" value={form.maxAmount} onChange={(e) => update('maxAmount', e.target.value)} />
          <Input id="o-min-tenure" type="number" label="Min tenure (months)" value={form.minTenureMonths} onChange={(e) => update('minTenureMonths', e.target.value)} />
          <Input id="o-max-tenure" type="number" label="Max tenure (months)" value={form.maxTenureMonths} onChange={(e) => update('maxTenureMonths', e.target.value)} />
          <Input id="o-apr" type="number" label="Annual interest rate (%)" value={form.annualInterestRate} onChange={(e) => update('annualInterestRate', e.target.value)} />
          <Input id="o-proc" type="number" label="Processing fee (%)" value={form.processingFeePct} onChange={(e) => update('processingFeePct', e.target.value)} />
          <Input id="o-late" type="number" label="Late fee (%)" value={form.lateFeePct} onChange={(e) => update('lateFeePct', e.target.value)} />
          <Input id="o-credit" type="number" label="Min credit score" value={form.minCreditScore} onChange={(e) => update('minCreditScore', e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Eligibility</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.requiresEmployment} onChange={(e) => update('requiresEmployment', e.target.checked)} />
            <div>
              <p className="text-sm font-semibold text-primary-dark dark:text-white">Require verified employment</p>
              <p className="text-xs text-muted dark:text-gray-500">Applicant must have an active employment record on RentOS</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.requiresPayrollDeduction} onChange={(e) => update('requiresPayrollDeduction', e.target.checked)} />
            <div>
              <p className="text-sm font-semibold text-primary-dark dark:text-white">Require payroll deduction</p>
              <p className="text-xs text-muted dark:text-gray-500">Repayment must be via employer payroll (lower default risk)</p>
            </div>
          </label>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/financing/offers')}>Cancel</Button>
        <Button onClick={submit} disabled={create.isPending || !form.name}>{create.isPending ? 'Creating…' : 'Create Offer'}</Button>
      </div>
    </div>
  )
}
