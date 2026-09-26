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
import { Plus, AlertTriangle, TrendingUp, Clock, Wallet } from 'lucide-react'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Investment, InvestmentOption } from '@/types/shared'

interface InvestmentOptions {
  products: InvestmentOption[]
  disclaimer: string
}

const STATUS: Record<string, { label: string; variant: 'warning' | 'success' | 'default' | 'danger' | 'muted' }> = {
  pending: { label: 'Awaiting partner confirmation', variant: 'warning' },
  active: { label: 'Active', variant: 'success' },
  redemption_requested: { label: 'Redemption requested', variant: 'warning' },
  matured: { label: 'Paid out', variant: 'default' },
  withdrawn: { label: 'Redeemed early', variant: 'muted' },
  rejected: { label: 'Declined — refunded', variant: 'danger' },
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['investments'] }),
  })

  const items = investments?.items ?? []
  const held = items.filter((i) => i.status === 'active' || i.status === 'pending' || i.status === 'redemption_requested')
  const totalInvested = held.reduce((s, i) => s + i.amount, 0)
  const products = options?.products ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-primary-dark">Investments</h3>
        {products.length > 0 && <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> Invest</Button>}
      </div>

      {options && (
        <div className="rounded-md bg-warning/5 border border-warning/20 p-3 text-xs text-amber-700 flex gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{options.disclaimer}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Held with partners', value: formatCurrency(totalInvested), icon: <TrendingUp size={18} />, color: '#2563eb' },
          { label: 'Awaiting partner', value: String(items.filter((i) => i.status === 'pending' || i.status === 'redemption_requested').length), icon: <Clock size={18} />, color: '#d97706' },
          { label: 'Active Investments', value: String(items.filter((i) => i.status === 'active').length), icon: <Wallet size={18} />, color: '#7c3aed' },
        ].map((s) => (
          <DashboardMetricCard key={s.label} label={s.label} value={s.value} icon={s.icon} accent={s.color} />
        ))}
      </div>

      {withdrawMutation.isError && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{(withdrawMutation.error as Error).message}</div>}

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <EmptyState
          preset="savings"
          title="No investments yet"
          description={products.length ? 'Investments are placed with regulated partners. Returns are not guaranteed.' : 'No partner investment products are available right now.'}
          action={products.length ? { label: 'View products', onClick: () => setShowCreate(true) } : undefined}
        />
      ) : (
        <div className="space-y-3">
          {items.map((inv) => {
            const status = STATUS[inv.status] ?? { label: inv.status, variant: 'muted' as const }
            return (
              <Card key={inv.id}>
                <CardContent>
                  {/* Stacked on phones: amount, a long status ("Awaiting partner
                      confirmation") and the redemption button don't fit beside
                      the title in one row. */}
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-primary-dark capitalize">{inv.type.replace('_', ' ')}{inv.partnerName ? ` · ${inv.partnerName}` : ''}</h4>
                      <p className="text-xs text-muted">
                        {inv.tenure} days · indicative {inv.interestRate}% a year (not guaranteed){inv.status === 'active' ? ` · matures ${formatDate(inv.maturityDate)}` : ''}
                      </p>
                      {inv.rejectionReason && <p className="text-xs text-muted">Reason: {inv.rejectionReason}</p>}
                    </div>
                    <div className="flex max-w-full flex-wrap items-center gap-3">
                      <div className="sm:text-right">
                        <p className="text-sm font-bold text-primary">{formatCurrency(inv.amount)}</p>
                        {inv.settledAmount != null && <p className="text-xs text-accent">Paid out {formatCurrency(inv.settledAmount)}</p>}
                      </div>
                      <Badge variant={status.variant} className="max-w-full whitespace-normal sm:whitespace-nowrap">{status.label}</Badge>
                      {inv.status === 'active' && (
                        <Button size="sm" variant="outline" onClick={() => withdrawMutation.mutate(inv.id)} disabled={withdrawMutation.isPending}>
                          Request redemption
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {options && showCreate && products.length > 0 && <CreateInvestmentModal open onClose={() => setShowCreate(false)} options={options} />}
    </div>
  )
}

function CreateInvestmentModal({ open, onClose, options }: { open: boolean; onClose: () => void; options: InvestmentOptions }) {
  const qc = useQueryClient()
  const [productId, setProductId] = useState(options.products[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [accepted, setAccepted] = useState(false)
  const product = options.products.find((p) => p.id === productId)

  const createMutation = useMutation({
    mutationFn: (body: unknown) => api.post('/investments', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['investments'] }); qc.invalidateQueries({ queryKey: ['wallet'] }); onClose() },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    createMutation.mutate({ productId, amount: Number(amount), riskDisclosureAccepted: accepted })
  }

  return (
    <Modal open={open} onClose={onClose} title="New Investment">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Select
          id="productId"
          label="Product"
          value={productId}
          onChange={(e) => { setProductId(e.target.value); setAccepted(false) }}
          options={options.products.map((p) => ({ value: p.id, label: `${p.name} — ${p.partnerName}` }))}
        />
        {product && (
          <div className="rounded-md bg-surface p-3 text-sm space-y-1">
            <p>Held by: <strong>{product.partnerName}</strong> ({product.regulator} licence {product.partnerLicenseNumber})</p>
            <p>Term: <strong>{product.tenureDays} days</strong> · minimum {formatCurrency(product.minAmount)}</p>
            {product.indicativeAnnualRate != null && <p>Partner's indicative rate: <strong>{product.indicativeAnnualRate}% a year</strong> — not guaranteed</p>}
            {product.description && <p className="text-muted">{product.description}</p>}
            <p className="text-xs text-amber-700">{product.riskWarning}</p>
          </div>
        )}
        <Input id="amount" label="Amount (GHS)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={String(product?.minAmount ?? 1)} required />

        <p className="text-xs text-muted">Your money leaves your wallet for the partner. The order stays pending until the partner confirms it; if they decline, you are refunded.</p>

        <label className="flex items-center gap-2.5 text-sm text-primary-dark dark:text-gray-300 cursor-pointer">
          <Switch checked={accepted} onChange={(v) => setAccepted(v)} size="sm" />
          <span>I understand returns are not guaranteed and I could get back less than I invest</span>
        </label>

        {createMutation.isError && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{(createMutation.error as Error).message}</div>}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!accepted || !product || createMutation.isPending}>{createMutation.isPending ? 'Processing...' : 'Place order'}</Button>
        </div>
      </form>
    </Modal>
  )
}
