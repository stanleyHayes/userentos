import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import {
  useReviewQueue, useReviewProperty, usePropertyReviewHistory,
  type ReviewQueueItem,
} from '@/hooks/useApi'
import {
  Building2, MapPin, Calendar, Check, X, MessageSquareWarning,
  ClipboardCheck, History, Plus, Trash2,
} from 'lucide-react'

const STATUS_TABS = [
  { label: 'Awaiting review', value: '' },
  { label: 'Changes requested', value: 'changes_requested' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
] as const

/** Reason codes offered on rejection — the API requires one. */
const REJECT_REASONS = [
  { value: 'incomplete_details', label: 'Incomplete details' },
  { value: 'poor_media', label: 'Photos unusable or missing' },
  { value: 'suspected_duplicate', label: 'Suspected duplicate listing' },
  { value: 'not_compliant', label: 'Breaches rental law or policy' },
  { value: 'suspected_fraud', label: 'Suspected fraud' },
  { value: 'other', label: 'Other (explain below)' },
]

type Decision = 'approve' | 'reject' | 'request_changes'

export function PropertyReviewPage() {
  const [status, setStatus] = useState<string>('')
  const { data, isLoading } = useReviewQueue(status || undefined)
  const [decision, setDecision] = useState<{ property: ReviewQueueItem; action: Decision } | null>(null)
  const [historyFor, setHistoryFor] = useState<ReviewQueueItem | null>(null)

  const properties = data?.items ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Moderation"
        title="Property Reviews"
        description="Approve, reject or request changes on submitted listings before they go live."
        meta={`${data?.total ?? 0} in this view`}
        icon={<ClipboardCheck size={22} />}
      />

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

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : properties.length === 0 ? (
        <EmptyState
          preset="properties"
          title="Nothing to review"
          description={status ? 'No listings with this status.' : 'Every submitted listing has been reviewed.'}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {properties.map((p) => (
            <QueueCard
              key={p.id}
              property={p}
              onDecide={(action) => setDecision({ property: p, action })}
              onHistory={() => setHistoryFor(p)}
            />
          ))}
        </div>
      )}

      {decision && (
        <DecisionModal
          property={decision.property}
          action={decision.action}
          onClose={() => setDecision(null)}
        />
      )}
      {historyFor && (
        <HistoryModal property={historyFor} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  )
}

function QueueCard({ property, onDecide, onHistory }: {
  property: ReviewQueueItem
  onDecide: (action: Decision) => void
  onHistory: () => void
}) {
  const open = property.listingStatus === 'pending_review' || property.listingStatus === 'in_review'

  return (
    <Card className="flex flex-col overflow-hidden">
      {property.images?.[0] && (
        <img src={property.images[0]} alt="" className="h-36 w-full object-cover" />
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <Link to={`/properties/${property.id}`} className="font-bold text-primary-dark hover:underline dark:text-white">
              {property.title}
            </Link>
            <Badge variant={open ? 'warning' : property.listingStatus === 'approved' ? 'success' : 'danger'}>
              {property.listingStatus.replace('_', ' ')}
            </Badge>
          </div>
          <p className="mt-1 text-sm font-semibold text-primary dark:text-blue-400">
            {formatCurrency(property.rentAmount)}
          </p>
        </div>

        <div className="space-y-1 text-xs text-muted dark:text-gray-500">
          <span className="flex items-center gap-1.5"><Building2 size={12} /> <span className="capitalize">{property.type}</span></span>
          {property.address?.city && (
            <span className="flex items-center gap-1.5"><MapPin size={12} /> {property.address.city}</span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar size={12} /> Submitted {property.submittedAt ? formatDate(property.submittedAt) : property.createdAt ? formatDate(property.createdAt) : 'recently'}
            {(property.reviewVersion ?? 1) > 1 && ` · attempt ${property.reviewVersion}`}
          </span>
        </div>

        {property.reviewIssues && property.reviewIssues.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-warning/10 p-2.5 text-xs text-warning">
            {property.reviewIssues.map((issue) => <li key={issue}>• {issue}</li>)}
          </ul>
        )}

        <div className="mt-auto space-y-2 pt-1">
          {open && (
            <div className="grid grid-cols-3 gap-1.5">
              <Button size="sm" onClick={() => onDecide('approve')}><Check size={13} /> Approve</Button>
              <Button size="sm" variant="outline" onClick={() => onDecide('request_changes')}>
                <MessageSquareWarning size={13} /> Changes
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDecide('reject')}><X size={13} /> Reject</Button>
            </div>
          )}
          <button
            onClick={onHistory}
            className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold text-muted transition-colors hover:text-primary dark:text-gray-500 dark:hover:text-blue-400"
          >
            <History size={12} /> Review history
          </button>
        </div>
      </div>
    </Card>
  )
}

function DecisionModal({ property, action, onClose }: {
  property: ReviewQueueItem
  action: Decision
  onClose: () => void
}) {
  const review = useReviewProperty()
  const [note, setNote] = useState('')
  const [reasonCode, setReasonCode] = useState('')
  const [issues, setIssues] = useState<string[]>([''])

  const cleanIssues = issues.map((i) => i.trim()).filter(Boolean)
  const canSubmit =
    action === 'approve' ? true
      : action === 'reject' ? Boolean(reasonCode)
        : cleanIssues.length > 0

  const title = action === 'approve' ? 'Approve listing'
    : action === 'reject' ? 'Reject listing'
      : 'Request changes'

  function submit() {
    review.mutate(
      {
        id: property.id,
        action,
        note: note.trim() || undefined,
        reasonCode: action === 'reject' ? reasonCode : undefined,
        issues: action === 'request_changes' ? cleanIssues : undefined,
      },
      {
        onSuccess: () => {
          toast.success(
            action === 'approve' ? 'Listing approved and published'
              : action === 'reject' ? 'Listing rejected — the owner has been told why'
                : 'Changes requested — the owner has the checklist',
          )
          onClose()
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not record the decision'),
      },
    )
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-muted dark:text-gray-400">{property.title}</p>

        {action === 'reject' && (
          <TextField
            select fullWidth size="small" label="Reason" value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            helperText="Required — the owner sees this"
            slotProps={{ inputLabel: { shrink: true } }}
          >
            {REJECT_REASONS.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
          </TextField>
        )}

        {action === 'request_changes' && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-primary-dark dark:text-white">
              What must the owner fix?
            </p>
            {issues.map((issue, i) => (
              <div key={i} className="flex gap-2">
                <TextField
                  fullWidth size="small" value={issue}
                  placeholder="e.g. Add interior photos of the kitchen"
                  onChange={(e) => setIssues((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                {issues.length > 1 && (
                  <button
                    onClick={() => setIssues((prev) => prev.filter((_, idx) => idx !== i))}
                    className="focus-ring shrink-0 rounded-lg px-2 text-muted hover:text-danger"
                    aria-label="Remove issue"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setIssues((prev) => [...prev, ''])}
              className="focus-ring flex items-center gap-1 text-xs font-semibold text-primary hover:underline dark:text-blue-400"
            >
              <Plus size={12} /> Add another
            </button>
          </div>
        )}

        <Textarea
          id="review-note"
          label={action === 'approve' ? 'Note (optional)' : 'Explanation'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={action === 'approve' ? 'Anything worth recording for the audit trail' : 'Explain the decision in plain language'}
        />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={!canSubmit || review.isPending}
            variant={action === 'reject' ? 'danger' : 'primary'}
          >
            {review.isPending ? 'Saving…' : title}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function HistoryModal({ property, onClose }: { property: ReviewQueueItem; onClose: () => void }) {
  const { data, isLoading } = usePropertyReviewHistory(property.id)
  const items = data?.items ?? []

  return (
    <Modal open onClose={onClose} title="Review history">
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted dark:text-gray-400">No decisions recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="rounded-xl bg-surface/60 p-3 dark:bg-white/[0.03]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={r.action === 'approve' ? 'success' : r.action === 'reject' ? 'danger' : 'muted'}>
                  {r.action.replace('_', ' ')}
                </Badge>
                <span className="text-xs text-muted dark:text-gray-500">
                  {r.reviewerName} · attempt {r.reviewVersion} · {formatDate(r.createdAt)}
                </span>
              </div>
              {r.note && <p className="mt-1.5 text-sm text-primary-dark dark:text-white">{r.note}</p>}
              {r.issues.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-muted dark:text-gray-400">
                  {r.issues.map((i) => <li key={i}>• {i}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}
