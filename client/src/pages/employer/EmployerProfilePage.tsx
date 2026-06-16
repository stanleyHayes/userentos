import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useMyEmployer, useUpsertEmployer } from '@/hooks/useApi'
import { useToastStore } from '@/stores/toastStore'

export function EmployerProfilePage() {
  const { data: employer } = useMyEmployer()
  const upsert = useUpsertEmployer()
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState({
    legalName: '', tradingName: '', tin: '', ssnitEmployerNumber: '', industry: '',
    street: '', city: 'Accra', region: 'Greater Accra', digitalAddress: '',
    contactEmail: '', contactPhone: '',
    payrollCycle: 'monthly' as 'weekly' | 'biweekly' | 'monthly',
    paydayDayOfMonth: '28',
  })

  // Hydrate form from server data once it loads (compare-by-reference pattern)
  const [hydratedFrom, setHydratedFrom] = useState<typeof employer | null>(null)
  if (employer && hydratedFrom !== employer) {
    setHydratedFrom(employer)
    setForm({
      legalName: employer.legalName ?? '',
      tradingName: employer.tradingName ?? '',
      tin: employer.tin ?? '',
      ssnitEmployerNumber: employer.ssnitEmployerNumber ?? '',
      industry: employer.industry ?? '',
      street: employer.address?.street ?? '',
      city: employer.address?.city ?? 'Accra',
      region: employer.address?.region ?? 'Greater Accra',
      digitalAddress: employer.address?.digitalAddress ?? '',
      contactEmail: employer.contactEmail ?? '',
      contactPhone: employer.contactPhone ?? '',
      payrollCycle: employer.payrollCycle ?? 'monthly',
      paydayDayOfMonth: String(employer.paydayDayOfMonth ?? 28),
    })
  }

  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function submit() {
    upsert.mutate({
      legalName: form.legalName,
      tradingName: form.tradingName || undefined,
      tin: form.tin,
      ssnitEmployerNumber: form.ssnitEmployerNumber || undefined,
      industry: form.industry || undefined,
      address: { street: form.street, city: form.city, region: form.region, digitalAddress: form.digitalAddress || undefined },
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      payrollCycle: form.payrollCycle,
      paydayDayOfMonth: Number(form.paydayDayOfMonth),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any, {
      onSuccess: () => addToast('Employer profile saved', 'success'),
      onError: (e) => addToast((e as Error).message, 'error'),
    })
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-extrabold font-display text-primary-dark dark:text-white">Employer Profile</h1>
        <p className="text-sm text-muted dark:text-gray-500">Company details used for payroll deductions and employee enrollment</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Company</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input id="emp-legal" label="Legal name" value={form.legalName} onChange={(e) => update('legalName', e.target.value)} />
          <Input id="emp-trading" label="Trading name" value={form.tradingName} onChange={(e) => update('tradingName', e.target.value)} />
          <Input id="emp-tin" label="TIN" value={form.tin} onChange={(e) => update('tin', e.target.value)} />
          <Input id="emp-ssnit" label="SSNIT Employer No." value={form.ssnitEmployerNumber} onChange={(e) => update('ssnitEmployerNumber', e.target.value)} />
          <Input id="emp-industry" label="Industry" value={form.industry} onChange={(e) => update('industry', e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Address</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input id="emp-street" label="Street" value={form.street} onChange={(e) => update('street', e.target.value)} />
          <Input id="emp-city" label="City" value={form.city} onChange={(e) => update('city', e.target.value)} />
          <Input id="emp-region" label="Region" value={form.region} onChange={(e) => update('region', e.target.value)} />
          <Input id="emp-gps" label="Ghana Post GPS" value={form.digitalAddress} onChange={(e) => update('digitalAddress', e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contact & Payroll</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input id="emp-email" label="Contact email" value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} />
          <Input id="emp-phone" label="Contact phone" value={form.contactPhone} onChange={(e) => update('contactPhone', e.target.value)} />
          <Select
            id="emp-cycle"
            label="Payroll cycle"
            value={form.payrollCycle}
            onChange={(e) => update('payrollCycle', e.target.value as typeof form.payrollCycle)}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'biweekly', label: 'Bi-weekly' },
              { value: 'weekly', label: 'Weekly' },
            ]}
          />
          <Input id="emp-payday" type="number" label="Payday (day of month)" value={form.paydayDayOfMonth} onChange={(e) => update('paydayDayOfMonth', e.target.value)} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={upsert.isPending || !form.legalName || !form.tin}>
          {upsert.isPending ? 'Saving…' : employer ? 'Save Changes' : 'Create Profile'}
        </Button>
      </div>
    </div>
  )
}
