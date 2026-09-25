import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import TextField from '@mui/material/TextField'
import { Building2, Check, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { AdminPageHeader, AdminLoadingState, AdminEmptyState } from '@/components/admin/AdminPagePrimitives'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'

interface OffPlanSubmission {
  id: string
  ownerId: string
  status: string
  data: { title?: string; amount?: number; scheduledDate?: string; reviewReason?: string }
  createdAt: string
  updatedAt: string
}

type Decision = { id: string; decision: 'approve' | 'reject'; reason?: string }

/**
 * Moderation queue for off-plan listings (GET /capabilities/workflows/review-queue).
 * A submission — or an edit to a published one — stays private until an admin
 * approves it here; approval is the only way it reaches the public
 * developments page.
 */
export function OffPlanReviewPage() {
  const qc = useQueryClient()
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null)
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['offplan-review-queue'],
    queryFn: () => api.get<{ items: OffPlanSubmission[] }>('/capabilities/workflows/review-queue'),
  })
  const review = useMutation({
    mutationFn: ({ id, decision, reason }: Decision) =>
      api.post(`/capabilities/workflows/${id}/review`, { decision, ...(reason ? { reason } : {}) }),
    onSuccess: (_data, { decision }) => {
      setRejecting(null)
      toast.success(decision === 'approve' ? 'Listing published' : 'Listing rejected')
      void qc.invalidateQueries({ queryKey: ['offplan-review-queue'] })
    },
  })
  const busyId = review.isPending ? review.variables?.id : undefined
  const items = data?.items ?? []

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={<Building2 size={22} />}
        title="Off-plan reviews"
        description="Check each development before it goes public: the title, starting price and expected date must be accurate and must not promise returns. Edits to a published listing come back here."
        meta={data ? `${items.length} awaiting review` : undefined}
      />
      {review.isError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Could not save that decision: {(review.error as Error).message || 'please retry.'}
        </p>
      )}
      {isPending ? (
        <AdminLoadingState title="Loading off-plan submissions" description="Fetching listings awaiting review." rows={4} cols={4} />
      ) : isError ? (
        <Card>
          <div role="alert" className="text-sm">
            Could not load the review queue.{' '}
            <button type="button" className="font-semibold underline" onClick={() => { void refetch() }}>Retry</button>
          </div>
        </Card>
      ) : !items.length ? (
        <AdminEmptyState title="Nothing awaiting review" description="New off-plan listings, and edits to published ones, appear here." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const title = item.data.title?.trim() || 'Untitled development'
            const busy = busyId === item.id
            const isRejecting = rejecting?.id === item.id
            return (
              <Card key={item.id} role="group" aria-label={title}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-primary-dark dark:text-white">{title}</p>
                      <Badge variant="warning" className="text-[10px]">Pending review</Badge>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Starting at {formatCurrency(Number(item.data.amount ?? 0))}
                      {item.data.scheduledDate ? ` · expected ${item.data.scheduledDate}` : ''}
                    </p>
                    <p className="text-xs text-muted dark:text-gray-500">
                      Submitted by <span className="font-mono">{item.ownerId}</span> · first created {formatDate(item.createdAt)} · last changed {formatDate(item.updatedAt)}
                    </p>
                  </div>
                  {!isRejecting && (
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => review.mutate({ id: item.id, decision: 'approve' })}>
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve and publish
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting({ id: item.id, reason: '' })}>
                        <X size={13} /> Reject
                      </Button>
                    </div>
                  )}
                </div>
                {isRejecting && (
                  <div className="mt-4 space-y-3 border-t border-border/50 pt-4 dark:border-[#252a3a]/70">
                    <TextField
                      label="Reason for rejection"
                      helperText="Recorded with the decision. Be specific about what must change before it can be published."
                      value={rejecting.reason}
                      onChange={(e) => setRejecting({ id: item.id, reason: e.target.value })}
                      multiline
                      rows={2}
                      fullWidth
                      slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: 500 } }}
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(null)}>Cancel</Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy || rejecting.reason.trim().length < 3}
                        onClick={() => review.mutate({ id: item.id, decision: 'reject', reason: rejecting.reason.trim() })}
                      >
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Confirm rejection
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
