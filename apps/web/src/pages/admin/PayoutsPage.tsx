import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import {
  AdminPageHeader, AdminStatGrid, AdminStatCard, AdminToolbar,
  AdminLoadingState, AdminEmptyState,
} from '@/components/admin/AdminPagePrimitives'
import { usePayoutQueue, useApprovePayout, useDeclinePayout, type Payout } from '@/hooks/useApi'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Banknote, Check, Clock3, Landmark, Smartphone, X, AlertTriangle } from 'lucide-react'

const STATUS_TABS = [
  { label: 'Awaiting approval', value: 'requested' },
  { label: 'Sending', value: 'processing' },
  { label: 'Paid', value: 'paid' },
  { label: 'Failed', value: 'failed' },
] as const

const statusVariant: Record<string, 'warning' | 'default' | 'success' | 'danger'> = {
  requested: 'warning', processing: 'default', paid: 'success', failed: 'danger',
}

/**
 * The approval queue for money leaving the platform. Every payout is reviewed
 * by a human before it is sent, because this is the only flow that pushes funds
 * to an account RentOS does not control.
 */
export function PayoutsPage() {
  const [status, setStatus] = useState<string>('requested')
  const { data, isLoading } = usePayoutQueue(status)
  const approve = useApprovePayout()
  const decline = useDeclinePayout()

  const [declining, setDeclining] = useState<Payout | null>(null)
  const [reason, setReason] = useState('')

  const payouts = data?.items ?? []
  const total = useMemo(() => (data?.items ?? []).reduce((sum, p) => sum + p.amount, 0), [data?.items])

  function onApprove(payout: Payout) {
    if (!confirm(`Send ${formatCurrency(payout.amount)} to ${payout.destination.accountName} (${payout.destination.accountNumber})?`)) return
    approve.mutate(payout.id, {
      onSuccess: () => toast.success('Payout sent — awaiting provider confirmation'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not send the payout'),
    })
  }

  function onDecline() {
    if (!declining || reason.trim().length < 3) return
    decline.mutate({ id: declining.id, reason: reason.trim() }, {
      onSuccess: () => {
        toast.success('Payout declined and refunded')
        setDeclining(null)
        setReason('')
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not decline the payout'),
    })
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Money out"
        title="Payouts"
        description="Review and send withdrawals to landlords, providers and tenants."
        icon={<Banknote size={22} />}
        accent="#1e3a5f"
        meta={`${payouts.length} in this view`}
      />

      <AdminStatGrid>
        <AdminStatCard
          label="In this view" value={String(payouts.length)}
          description={STATUS_TABS.find((t) => t.value === status)?.label ?? ''}
          icon={<Clock3 size={18} />} accent="#f59e0b"
        />
        <AdminStatCard
          label="Total value" value={formatCurrency(total)}
          description="Sum of the payouts listed"
          icon={<Banknote size={18} />} accent="#059669"
        />
      </AdminStatGrid>

      <AdminToolbar title="Queue" resultLabel={`${payouts.length} payout${payouts.length === 1 ? '' : 's'}`}>
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={`focus-ring rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                status === tab.value
                  ? 'bg-primary text-white dark:bg-blue-600'
                  : 'bg-surface text-muted hover:text-primary dark:bg-white/[0.04] dark:text-gray-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </AdminToolbar>

      {isLoading ? (
        <AdminLoadingState title="Loading payouts" description="Fetching the queue…" />
      ) : payouts.length === 0 ? (
        <AdminEmptyState
          title="Nothing here"
          description={status === 'requested' ? 'No payouts are waiting for approval.' : 'No payouts with this status.'}
          icon={<Banknote size={28} />}
        />
      ) : (
        <div className="space-y-3">
          {payouts.map((payout) => (
            <Card key={payout.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-400">
                    {payout.destination.bankName.toLowerCase().includes('money') ? <Smartphone size={18} /> : <Landmark size={18} />}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-primary-dark dark:text-white">{formatCurrency(payout.amount)}</p>
                      <Badge variant={statusVariant[payout.status] ?? 'default'}>{payout.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted dark:text-gray-400">
                      {payout.destination.accountName} · {payout.destination.bankName} · {payout.destination.accountNumber}
                    </p>
                    {payout.user && (
                      <p className="text-xs text-muted dark:text-gray-500">
                        Requested by {payout.user.firstName} {payout.user.lastName} ({payout.user.email})
                      </p>
                    )}
                    <p className="text-xs text-muted dark:text-gray-500">
                      {payout.reference}{payout.createdAt ? ` · ${formatDate(payout.createdAt)}` : ''}
                    </p>
                    {payout.failureReason && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-danger">
                        <AlertTriangle size={12} /> {payout.failureReason}
                      </p>
                    )}
                  </div>
                </div>

                {payout.status === 'requested' && (
                  <div className="flex gap-2">
                    <Button onClick={() => onApprove(payout)} disabled={approve.isPending}>
                      <Check size={14} /> Approve &amp; send
                    </Button>
                    <Button variant="outline" onClick={() => setDeclining(payout)}>
                      <X size={14} /> Decline
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={Boolean(declining)} onClose={() => setDeclining(null)} title="Decline this payout">
        <div className="space-y-4">
          <p className="text-sm text-muted dark:text-gray-400">
            {declining ? `${formatCurrency(declining.amount)} goes straight back to their wallet. They will see the reason below.` : ''}
          </p>
          <Textarea
            id="decline-reason"
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. account name does not match the registered user"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeclining(null)}>Cancel</Button>
            <Button variant="danger" onClick={onDecline} disabled={reason.trim().length < 3 || decline.isPending}>
              {decline.isPending ? 'Declining…' : 'Decline and refund'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
