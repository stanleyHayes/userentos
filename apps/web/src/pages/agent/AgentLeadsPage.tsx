import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { cn, formatDate } from '@/lib/utils'
import { useAgentLeads, useUpdateLeadStatus, useOpenLeadConversation, type AgentLead, type LeadStatus } from '@/hooks/useAgent'
import { Handshake, Building2, ArrowRight, XCircle, Loader2, MessageCircle, MessagesSquare, Globe, Heart, ShieldCheck } from 'lucide-react'

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

const CHANNELS: Record<'interest' | 'whatsapp' | 'website', { label: string; icon: React.ReactNode; className: string }> = {
  interest: { label: 'Interested', icon: <Heart size={10} />, className: 'bg-primary/10 text-primary dark:bg-cyan-300/10 dark:text-cyan-200' },
  whatsapp: { label: 'WhatsApp', icon: <MessageCircle size={10} />, className: 'bg-[#25D366]/15 text-[#128C4B] dark:text-[#4ADE80]' },
  website: { label: 'Your website', icon: <Globe size={10} />, className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
}

function LeadCard({ lead, highlighted }: { lead: AgentLead; highlighted: boolean }) {
  const updateStatus = useUpdateLeadStatus()
  const openConversation = useOpenLeadConversation()
  const navigate = useNavigate()
  const next = NEXT_STEP[lead.status]
  const active = lead.status !== 'closed' && lead.status !== 'lost'
  const ref = useRef<HTMLDivElement>(null)
  // An SMS or notification links to /agent/leads?lead=<id>: bring that lead into view.
  useEffect(() => { if (highlighted) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [highlighted])
  const channels = lead.channels?.length ? lead.channels : [lead.channel ?? 'interest']

  return (
    <div ref={ref} className="h-full">
    <Card className={cn('flex h-full flex-col gap-3', highlighted && 'ring-2 ring-primary dark:ring-cyan-300')}>
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

      <div className="flex flex-wrap gap-1">
        {channels.map((channel) => (
          <span key={channel} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', CHANNELS[channel].className)}>
            {CHANNELS[channel].icon} {CHANNELS[channel].label}
          </span>
        ))}
      </div>

      {/* Enquirers' phone numbers and emails stay private: the agent replies on RentOS. */}
      <div className="neumorphic-inset flex flex-wrap items-center justify-between gap-2 rounded-xl p-3">
        <span className="flex items-center gap-1.5 text-[11px] text-muted dark:text-gray-400">
          <ShieldCheck size={12} className="flex-shrink-0 text-accent" /> Replies stay on RentOS
        </span>
        {lead.canReply === false ? (
          <span className="text-xs text-muted dark:text-gray-500">This person closed their account</span>
        ) : (
          <Button
            size="sm"
            disabled={openConversation.isPending}
            onClick={() => openConversation.mutate(lead.id, { onSuccess: ({ conversationId }) => navigate(`/messages?conversationId=${conversationId}`) })}
          >
            {openConversation.isPending ? <Loader2 size={13} className="animate-spin" /> : <MessagesSquare size={13} />} Reply on RentOS
          </Button>
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
    </div>
  )
}

export function AgentLeadsPage() {
  const [searchParams] = useSearchParams()
  const highlightedLead = searchParams.get('lead')
  const [status, setStatus] = useState<LeadStatus | ''>('')
  const { data, isLoading } = useAgentLeads({ status })
  const items = data?.items ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Portfolio"
        title="Leads & enquiries"
        description="Everyone who asked about your listings, from RentOS or your website. Reply in RentOS messages and work each one through the pipeline."
        icon={<Handshake size={22} />}
      />

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
          description={status ? 'Try another pipeline stage.' : 'When someone taps “I’m interested”, opens WhatsApp while signed in, or uses your website’s contact form, they land here — and you get an SMS.'}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((lead) => <LeadCard key={lead.id} lead={lead} highlighted={lead.id === highlightedLead} />)}
        </div>
      )}
    </div>
  )
}
