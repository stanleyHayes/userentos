import { useState, type FormEvent } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, AlertTriangle, TrendingUp, BarChart3, Wallet } from 'lucide-react'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'

interface Investment {
  id: string; type: string; amount: number; interestRate: number; tenure: number
  startDate: string; maturityDate: string; status: string; expectedReturn: number; actualReturn?: number; partnerId: string
}

interface InvestmentOptions {
  partners: { id: string; name: string; types: string[] }[]
  rates: Record<string, Record<string, number>>
  disclaimer: string
}

export function InvestmentsTab() {
  const qc = useQueryClient()
  const { data: investments, isLoading } = useQuery({
    queryKey: ['investments'],
    queryFn: () => api.get<{ items: Investment[] }>('/investments'),
  })
  const { data: options } = useQuery({
    queryKey: ['investment-options'],
    queryFn: () => api.get<InvestmentOptions>('/investments/options'),
  })
  const [showCreate, setShowCreate] = useState(false)

  const withdrawMutation = useMutation({
    mutationFn: (id: string) => api.post(`/investments/${id}/withdraw`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['investments'] }); qc.invalidateQueries({ queryKey: ['wallet'] }) },
  })

  const items = investments?.items ?? []
  const active = items.filter((i) => i.status === 'active')
  const totalInvested = active.reduce((s, i) => s + i.amount, 0)
  const totalExpected = active.reduce((s, i) => s + i.expectedReturn, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-primary-dark">Investments</h3>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> Invest</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Invested', value: formatCurrency(totalInvested), icon: <TrendingUp size={18} />, color: '#2563eb' },
          { label: 'Expected Returns', value: formatCurrency(totalExpected), icon: <BarChart3 size={18} />, color: '#059669' },
          { label: 'Active Investments', value: String(active.length), icon: <Wallet size={18} />, color: '#7c3aed' },
        ].map((s) => (
          <DashboardMetricCard key={s.label} label={s.label} value={s.value} icon={s.icon} accent={s.color} />
        ))}
      </div>

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <EmptyState preset="savings" title="No investments yet" description="Grow your savings with treasury bills and government bonds." action={{ label: 'Start Investing', onClick: () => setShowCreate(true) }} />
      ) : (
        <div className="space-y-3">
          {items.map((inv) => (
            <Card key={inv.id}>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-primary-dark capitalize">{inv.type.replace('_', ' ')}</h4>
                    <p className="text-xs text-muted">{inv.tenure} days at {inv.interestRate}% - Matures {formatDate(inv.maturityDate)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">{formatCurrency(inv.amount)}</p>
                      <p className="text-xs text-accent">+{formatCurrency(inv.actualReturn ?? inv.expectedReturn)}</p>
                    </div>
                    <Badge variant={inv.status === 'active' ? 'success' : inv.status === 'matured' ? 'default' : 'muted'}>{inv.status}</Badge>
                    {(inv.status === 'active' || inv.status === 'matured') && (
                      <Button size="sm" variant="outline" onClick={() => withdrawMutation.mutate(inv.id)} disabled={withdrawMutation.isPending}>
                        Withdraw
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {options && <CreateInvestmentModal open={showCreate} onClose={() => setShowCreate(false)} options={options} />}
    </div>
  )
}

function CreateInvestmentModal({ open, onClose, options }: { open: boolean; onClose: () => void; options: InvestmentOptions }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ type: 'treasury_bill', amount: '', tenure: '91', partnerId: options.partners[0]?.id ?? '' })
  const [accepted, setAccepted] = useState(false)

  const createMutation = useMutation({
    mutationFn: (body: unknown) => api.post('/investments', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['investments'] }); qc.invalidateQueries({ queryKey: ['wallet'] }); onClose() },
  })

  const rate = options.rates[form.type]?.[form.tenure]
  const amount = Number(form.amount) || 0
  const expectedReturn = rate ? amount * (rate / 100) * (Number(form.tenure) / 365) : 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    createMutation.mutate({
      type: form.type,
      amount: Number(form.amount),
      tenure: Number(form.tenure),
      partnerId: form.partnerId,
      riskDisclosureAccepted: accepted,
    })
  }

  const tenureOptions = Object.keys(options.rates[form.type] || {}).map((d) => ({ value: d, label: `${d} days (${options.rates[form.type][d]}%)` }))

  return (
    <Modal open={open} onClose={onClose} title="New Investment">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Select id="type" label="Type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, tenure: Object.keys(options.rates[e.target.value] || {})[0] || '' }))} options={[{ value: 'treasury_bill', label: 'Treasury Bill' }, { value: 'government_bond', label: 'Government Bond' }]} />
        <Select id="tenure" label="Tenure" value={form.tenure} onChange={(e) => setForm((f) => ({ ...f, tenure: e.target.value }))} options={tenureOptions} />
        <Select id="partnerId" label="Investment Partner" value={form.partnerId} onChange={(e) => setForm((f) => ({ ...f, partnerId: e.target.value }))} options={options.partners.filter((p) => p.types.includes(form.type)).map((p) => ({ value: p.id, label: p.name }))} />
        <Input id="amount" label="Amount (GHS)" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} min="100" required />

        {amount > 0 && rate && (
          <div className="rounded-md bg-accent/5 border border-accent/20 p-3 text-sm">
            <p>Rate: <strong>{rate}%</strong> | Expected return: <strong>{formatCurrency(Math.round(expectedReturn * 100) / 100)}</strong></p>
            <p className="text-xs text-muted mt-1">Total at maturity: {formatCurrency(amount + expectedReturn)}</p>
          </div>
        )}

        <div className="rounded-md bg-warning/5 border border-warning/20 p-3 text-xs text-amber-700 flex gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{options.disclaimer}</span>
        </div>

        <label className="flex items-center gap-2.5 text-sm text-primary-dark dark:text-gray-300 cursor-pointer">
          <Switch checked={accepted} onChange={(v) => setAccepted(v)} size="sm" />
          <span>I understand and accept the investment risks</span>
        </label>

        {createMutation.isError && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{(createMutation.error as Error).message}</div>}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!accepted || createMutation.isPending}>{createMutation.isPending ? 'Processing...' : 'Invest'}</Button>
        </div>
      </form>
    </Modal>
  )
}
