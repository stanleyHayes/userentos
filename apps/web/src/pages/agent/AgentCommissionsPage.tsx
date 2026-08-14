import { useState } from 'react'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  useAgentCommissions,
  useAgentLeads,
  useCreateCommission,
  useMarkCommissionPaid,
  type AgentCommission,
} from '@/hooks/useAgent'
import { Banknote, Wallet, Handshake, Plus, Building2, CheckCircle2, Loader2 } from 'lucide-react'

function RecordCommissionModal({ onClose }: { onClose: () => void }) {
  const createCommission = useCreateCommission()
  // Property options come from the agent's lead inbox — those are the listings
  // the agent is actually working, so a commission links to a real deal.
  const { data: leadsData } = useAgentLeads()
  const propertyOptions = new Map<string, string>()
  for (const lead of leadsData?.items ?? []) {
    if (lead.propertyTitle) propertyOptions.set(lead.propertyId, lead.propertyTitle)
  }

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [propertyId, setPropertyId] = useState('')

  const parsedAmount = Number(amount)
  const valid = description.trim().length >= 2 && Number.isFinite(parsedAmount) && parsedAmount > 0

  function submit() {
    if (!valid) return
    createCommission.mutate(
      {
        description: description.trim(),
        amount: parsedAmount,
        ...(propertyId ? { propertyId } : {}),
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal open onClose={onClose} title="Record commission">
      <div className="flex flex-col gap-3">
        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Letting fee — 2 bed apartment, Osu"
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Amount (GHS)"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          fullWidth
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0, step: '0.01' } }}
        />
        <TextField
          label="Linked property (optional)"
          select
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        >
          <MenuItem value="">None</MenuItem>
          {[...propertyOptions.entries()].map(([id, title]) => (
            <MenuItem key={id} value={id}>{title}</MenuItem>
          ))}
        </TextField>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!valid || createCommission.isPending} onClick={submit}>
            {createCommission.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Record
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function CommissionRow({ commission, onMarkPaid }: { commission: AgentCommission; onMarkPaid: (c: AgentCommission) => void }) {
  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-primary-dark dark:text-white">{commission.description}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted dark:text-gray-500">
          <Building2 size={10} className="flex-shrink-0" />
          {commission.status === 'paid' && commission.paidAt
            ? `Paid ${formatDate(commission.paidAt)}`
            : `Recorded ${formatDate(commission.createdAt)}`}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <span className="text-sm font-bold text-primary-dark dark:text-white">{formatCurrency(commission.amount)}</span>
        <Badge variant={commission.status === 'paid' ? 'success' : 'warning'} className="text-[10px] capitalize">{commission.status}</Badge>
        {commission.status === 'pending' && (
          <Button size="sm" variant="outline" onClick={() => onMarkPaid(commission)}>
            <CheckCircle2 size={13} /> Mark paid
          </Button>
        )}
      </div>
    </Card>
  )
}

export function AgentCommissionsPage() {
  const { data, isLoading } = useAgentCommissions()
  const markPaid = useMarkCommissionPaid()
  const [showRecord, setShowRecord] = useState(false)
  const [confirming, setConfirming] = useState<AgentCommission | null>(null)

  const items = data?.items ?? []
  const summary = data?.summary ?? { pending: 0, paid: 0, count: 0 }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-primary-dark dark:text-white">
            <Banknote className="text-primary" size={24} />
            Commissions
          </h1>
          <p className="mt-1 text-sm text-muted">Track what you've earned on closed deals and what's still owed to you.</p>
        </div>
        <Button onClick={() => setShowRecord(true)}><Plus size={14} /> Record commission</Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
        <DashboardMetricCard label="Pending" value={formatCurrency(summary.pending)} sub="Awaiting payment" accent="#f59e0b" icon={<Wallet size={18} />} />
        <DashboardMetricCard label="Paid out" value={formatCurrency(summary.paid)} sub="Received" accent="#10b981" icon={<Banknote size={18} />} />
        <DashboardMetricCard label="Total deals" value={String(summary.count)} sub="Commissions recorded" accent="#3b82f6" icon={<Handshake size={18} />} />
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          preset="payments"
          title="No commissions yet"
          description="Record your first commission when a deal closes — it will show up here as pending until you're paid."
          action={{ label: 'Record commission', onClick: () => setShowRecord(true) }}
        />
      ) : (
        <div className="space-y-3">
          {items.map((c) => <CommissionRow key={c.id} commission={c} onMarkPaid={setConfirming} />)}
        </div>
      )}

      {showRecord && <RecordCommissionModal onClose={() => setShowRecord(false)} />}

      {confirming && (
        <Modal open onClose={() => setConfirming(null)} title="Mark commission paid?">
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-muted dark:text-gray-400">
              Mark <span className="font-semibold text-primary-dark dark:text-white">{confirming.description}</span> ({formatCurrency(confirming.amount)}) as paid? This can't be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirming(null)}>Back</Button>
              <Button
                size="sm"
                disabled={markPaid.isPending}
                onClick={() => markPaid.mutate(confirming.id, { onSuccess: () => setConfirming(null) })}
              >
                {markPaid.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Yes, mark paid
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
