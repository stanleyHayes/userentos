import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { cn, formatDate } from '@/lib/utils'
import { useAgentLeads, useUpdateLeadStatus, type AgentLead, type LeadStatus } from '@/hooks/useAgent'
import { Handshake, Phone, Mail, Building2, ArrowRight, XCircle, Loader2 } from 'lucide-react'

const STATUS_FILTERS: { value: LeadStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'viewing', label: 'Viewing' },
  { value: 'applied', label: 'Applied' },
  { value: 'closed', label: 'Closed' },
  { value: 'lost', label: 'Lost' },
]

const STATUS_VARIANTS: Record<LeadStatus, 'default' | 'warning' | 'success' | 'muted'> = {
  new: 'default',
  contacted: 'warning',
  viewing: 'default',
  applied: 'warning',
  closed: 'success',
  lost: 'muted',
}

/** The next pipeline step for a lead (null when the lead is at an end state). */
const NEXT_STEP: Partial<Record<LeadStatus, { status: LeadStatus; label: string }>> = {
  new: { status: 'contacted', label: 'Mark contacted' },
  contacted: { status: 'viewing', label: 'Viewing booked' },
  viewing: { status: 'applied', label: 'They applied' },
  applied: { status: 'closed', label: 'Close deal' },
}

function LeadCard({ lead }: { lead: AgentLead }) {
  const updateStatus = useUpdateLeadStatus()
  const next = NEXT_STEP[lead.status]
  const active = lead.status !== 'closed' && lead.status !== 'lost'

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-primary-dark dark:text-white">{lead.contactName}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted dark:text-gray-500">
            <Building2 size={10} className="flex-shrink-0" />
            <span className="truncate">{lead.propertyTitle ?? 'Listing removed'}</span>
            <span className="flex-shrink-0">· {formatDate(lead.createdAt)}</span>
          </p>
        </div>
        <Badge variant={STATUS_VARIANTS[lead.status]} className="flex-shrink-0 text-[10px] capitalize">{lead.status}</Badge>
      </div>

      <div className="neumorphic-inset rounded-xl p-3 space-y-1.5">
        <a href={`tel:${lead.contactPhone}`} className="flex items-center gap-2 text-xs font-semibold text-primary hover:underline dark:text-blue-400">
          <Phone size={12} className="flex-shrink-0" /> {lead.contactPhone}
        </a>
        {lead.contactEmail && (
          <a href={`mailto:${lead.contactEmail}`} className="flex items-center gap-2 text-xs font-semibold text-primary hover:underline dark:text-blue-400">
            <Mail size={12} className="flex-shrink-0" /> {lead.contactEmail}
          </a>
        )}
      </div>

      {lead.message && (
        <p className="rounded-lg bg-surface px-3 py-2 text-xs italic leading-relaxed text-muted dark:bg-[#0c0e1a] dark:text-gray-400">
          “{lead.message}”
        </p>
      )}

      {active && (
        <div className="mt-auto flex items-center gap-2 border-t border-border/50 pt-3 dark:border-[#252a3a]/50">
          {next && (
            <Button
              size="sm"
              disabled={updateStatus.isPending}
              onClick={() => updateStatus.mutate({ id: lead.id, status: next.status })}
            >
              {updateStatus.isPending ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
              {next.label}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            disabled={updateStatus.isPending}
            onClick={() => updateStatus.mutate({ id: lead.id, status: 'lost' })}
          >
            <XCircle size={13} /> Mark lost
          </Button>
        </div>
      )}
    </Card>
  )
}

export function AgentLeadsPage() {
  const [status, setStatus] = useState<LeadStatus | ''>('')
  const { data, isLoading } = useAgentLeads({ status })
  const items = data?.items ?? []

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-primary-dark dark:text-white">
          <Handshake className="text-primary" size={24} />
          Leads
        </h1>
        <p className="mt-1 text-sm text-muted">People interested in your listings — work each lead through the pipeline.</p>
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
          title={status ? `No ${status} leads` : 'No leads yet'}
          description={status ? 'Try another pipeline stage.' : 'When someone taps “I’m interested” on one of your listings, their contact details land here.'}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
        </div>
      )}
    </div>
  )
}
