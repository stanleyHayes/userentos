import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useAgentViewings, useUpdateViewingStatus, type AgentViewing, type ViewingStatus } from '@/hooks/useAgent'
import { CalendarDays, Phone, Building2, Clock, Check, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

const STATUS_FILTERS: { value: ViewingStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'requested', label: 'Requested' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATUS_VARIANTS: Record<ViewingStatus, 'default' | 'warning' | 'success' | 'muted'> = {
  requested: 'warning',
  confirmed: 'default',
  completed: 'success',
  cancelled: 'muted',
}

function ViewingCard({ viewing, asRequester }: { viewing: AgentViewing; asRequester: boolean }) {
  const updateStatus = useUpdateViewingStatus()
  const cancellable = viewing.status === 'requested' || viewing.status === 'confirmed'
  // Agents confirm requests and mark confirmed viewings complete; requesters
  // can only cancel (server enforces the same rule).
  const canConfirm = !asRequester && viewing.status === 'requested'
  const canComplete = !asRequester && viewing.status === 'confirmed'

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-primary-dark dark:text-white">{viewing.viewerName}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted dark:text-gray-500">
            <Building2 size={10} className="flex-shrink-0" />
            <span className="truncate">{viewing.propertyTitle ?? 'Listing removed'}</span>
          </p>
        </div>
        <Badge variant={STATUS_VARIANTS[viewing.status]} className="flex-shrink-0 text-[10px] capitalize">{viewing.status}</Badge>
      </div>

      <div className="neumorphic-inset flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl p-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-primary-dark dark:text-white">
          <CalendarDays size={12} className="text-muted dark:text-gray-500" /> {viewing.date}
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-primary-dark dark:text-white">
          <Clock size={12} className="text-muted dark:text-gray-500" /> {viewing.time}
        </span>
        {!asRequester && (
          <a href={`tel:${viewing.viewerPhone}`} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline dark:text-blue-400">
            <Phone size={12} /> {viewing.viewerPhone}
          </a>
        )}
      </div>

      {viewing.notes && (
        <p className="rounded-lg bg-surface px-3 py-2 text-xs italic leading-relaxed text-muted dark:bg-[#0c0e1a] dark:text-gray-400">
          “{viewing.notes}”
        </p>
      )}

      {(canConfirm || canComplete || cancellable) && (
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/50 pt-3 dark:border-[#252a3a]/50">
          {canConfirm && (
            <Button size="sm" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: viewing.id, status: 'confirmed' })}>
              {updateStatus.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Confirm
            </Button>
          )}
          {canComplete && (
            <Button size="sm" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: viewing.id, status: 'completed' })}>
              {updateStatus.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Mark completed
            </Button>
          )}
          {cancellable && (
            <Button size="sm" variant="ghost" className="text-danger" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: viewing.id, status: 'cancelled' })}>
              <XCircle size={13} /> Cancel
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

export function AgentViewingsPage() {
  const [asRequester, setAsRequester] = useState(false)
  const [status, setStatus] = useState<ViewingStatus | ''>('')
  const { data, isLoading } = useAgentViewings({ status, asRequester })
  const items = data?.items ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Portfolio"
        title="Viewings"
        description="Confirm, complete or cancel viewings on your listings — or track the slots you requested yourself."
        icon={<CalendarDays size={22} />}
      />

      {/* Segment toggle */}
      <div className="mb-4 inline-flex gap-1 rounded-xl border border-border/70 p-1 neumorphic-inset">
        {([
          { value: false, label: 'My listings' },
          { value: true, label: 'My viewing requests' },
        ] as const).map((seg) => (
          <button
            key={seg.label}
            type="button"
            onClick={() => setAsRequester(seg.value)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors',
              asRequester === seg.value
                ? 'bg-primary text-white'
                : 'text-muted hover:text-primary-dark dark:text-gray-400 dark:hover:text-white',
            )}
          >
            {seg.label}
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatus(f.value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs transition-colors',
              status === f.value
                ? 'border-primary bg-primary text-white'
                : 'neumorphic-icon border-border/70 text-muted hover:border-primary/40 dark:text-gray-400',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          preset="general"
          title={asRequester ? 'No viewing requests' : 'No viewings scheduled'}
          description={
            asRequester
              ? 'Viewings you request from a listing’s “Book a viewing” button will show up here.'
              : 'When someone requests a viewing on one of your listings, it lands here for you to confirm.'
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((viewing) => <ViewingCard key={viewing.id} viewing={viewing} asRequester={asRequester} />)}
        </div>
      )}
    </div>
  )
}
