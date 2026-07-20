import { useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDispute, useUpdateDisputeStatus, useUploadDisputeEvidence } from '@/hooks/useApi'
import { useAuthStore } from '@/stores/authStore'
import { cn, formatDate } from '@/lib/utils'
import {
  AlertTriangle, Calendar, Tag, Building2, User,
  FileText, Image, Video, Upload, CheckCircle2, Clock, Shield,
  Scale, Paperclip, MessageSquare, Gavel,
  ArrowLeft, ArrowUpRight, ChevronRight,
} from 'lucide-react'
import { DashboardSkeleton } from '@/components/ui/Skeleton'
import type { DisputeStatus, Evidence } from '@/types'

const statusVariant: Record<DisputeStatus, 'warning' | 'default' | 'danger' | 'success' | 'muted'> = {
  filed: 'warning',
  under_mediation: 'default',
  escalated: 'danger',
  resolved: 'success',
  closed: 'muted',
}

const statusColor: Record<DisputeStatus, string> = {
  filed: 'text-amber-500 bg-amber-500/10',
  under_mediation: 'text-blue-500 bg-blue-500/10',
  escalated: 'text-red-500 bg-red-500/10',
  resolved: 'text-emerald-500 bg-emerald-500/10',
  closed: 'text-gray-400 bg-gray-400/10',
}

const categoryOptions = [
  { value: 'rent_increase', label: 'Illegal Rent Increase' },
  { value: 'eviction', label: 'Wrongful Eviction' },
  { value: 'maintenance', label: 'Maintenance Issues' },
  { value: 'deposit_refund', label: 'Deposit Refund' },
  { value: 'illegal_clause', label: 'Illegal Contract Clause' },
  { value: 'other', label: 'Other' },
]

const categoryIcon: Record<string, string> = {
  rent_increase: '\u{1F4B0}',
  eviction: '\u{1F3E0}',
  maintenance: '\u{1F527}',
  deposit_refund: '\u{1F4B3}',
  illegal_clause: '\u{1F4DC}',
  other: '\u{1F4CB}',
}

const STATUS_STEPS: { key: DisputeStatus; label: string; icon: typeof Clock }[] = [
  { key: 'filed', label: 'Filed', icon: FileText },
  { key: 'under_mediation', label: 'Mediation', icon: Scale },
  { key: 'escalated', label: 'Escalated', icon: AlertTriangle },
  { key: 'resolved', label: 'Resolved', icon: CheckCircle2 },
  { key: 'closed', label: 'Closed', icon: Shield },
]

const evidenceIcon: Record<Evidence['type'], typeof Image> = {
  image: Image,
  video: Video,
  document: FileText,
}

function getStepState(current: DisputeStatus, step: DisputeStatus) {
  const order: DisputeStatus[] = ['filed', 'under_mediation', 'escalated', 'resolved', 'closed']
  const ci = order.indexOf(current)
  const si = order.indexOf(step)
  if (si < ci) return 'done'
  if (si === ci) return 'active'
  return 'upcoming'
}

export function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const isGov = user?.activeRole === 'government' || user?.activeRole === 'admin' || user?.activeRole === 'super_admin' || user?.activeRole === 'legal_officer'

  const { data: dispute, isLoading } = useDispute(id!)
  const updateStatus = useUpdateDisputeStatus()
  const uploadEvidence = useUploadDisputeEvidence()
  const evidenceInputRef = useRef<HTMLInputElement>(null)

  const [status, setStatus] = useState<DisputeStatus | ''>('')
  const [resolution, setResolution] = useState('')
  const [showGovPanel, setShowGovPanel] = useState(false)

  // Sync local state when dispute loads
  if (dispute && status === '') {
    setStatus(dispute.status)
    setResolution(dispute.resolution ?? '')
  }

  if (isLoading) return <DashboardSkeleton />

  if (!dispute) {
    return (
      <div className="text-center py-16">
        <Gavel size={48} className="mx-auto text-muted mb-4" />
        <h2 className="text-lg font-bold text-primary-dark dark:text-white">Dispute not found</h2>
        <p className="text-sm text-muted mt-1">This dispute may have been removed.</p>
        <Link to="/disputes">
          <Button variant="outline" className="mt-4"><ArrowLeft size={14} /> Back to Disputes</Button>
        </Link>
      </div>
    )
  }

  const isClosed = dispute.status === 'closed' || dispute.status === 'resolved'
  // Server 403s evidence uploads from non-parties — only tenant/landlord on the dispute may upload
  const isParty = user?.id === dispute.filedBy || user?.id === dispute.filedAgainst
  const categoryLabel = categoryOptions.find((c) => c.value === dispute.category)?.label ?? dispute.category
  const catEmoji = categoryIcon[dispute.category] ?? '\u{1F4CB}'

  async function handleUpdate() {
    if (!status) return
    try {
      await updateStatus.mutateAsync({ id: dispute!.id, status, resolution: resolution || undefined })
      navigate('/disputes')
    } catch {
      // Rejected transitions (e.g. 409) surface inline via updateStatus.error
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Back + Title */}
      <div>
        <Link to="/disputes" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary dark:hover:text-blue-400 transition-colors mb-3">
          <ArrowLeft size={14} /> Back to Disputes
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl flex-shrink-0', statusColor[dispute.status])}>
              {(() => { const Icon = STATUS_STEPS.find((s) => s.key === dispute.status)?.icon ?? FileText; return <Icon size={20} /> })()}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
                {dispute.title}
              </h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant={statusVariant[dispute.status]} className="text-[10px]">
                  {dispute.status.replace(/_/g, ' ')}
                </Badge>
                <span className="text-xs text-muted dark:text-gray-400 flex items-center gap-1">
                  {catEmoji} {categoryLabel}
                </span>
                <span className="text-[10px] text-muted">·</span>
                <span className="text-xs text-muted dark:text-gray-400 flex items-center gap-1">
                  <Calendar size={11} /> Filed {formatDate(dispute.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Timeline */}
      <Card>
        <CardContent className="py-5">
          <div className="flex items-center justify-between">
            {STATUS_STEPS.map((step, i) => {
              const state = getStepState(dispute.status, step.key)
              const StepIcon = step.icon
              return (
                <div key={step.key} className="flex items-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={cn(
                      'flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full border-2 transition-all',
                      state === 'done' && 'border-success bg-success/10',
                      state === 'active' && 'border-primary bg-primary/10 ring-4 ring-primary/10 dark:ring-primary/15',
                      state === 'upcoming' && 'border-border/60 dark:border-[#252a3a] bg-white dark:bg-[#161927]',
                    )}>
                      {state === 'done' ? (
                        <CheckCircle2 size={16} className="text-success" />
                      ) : (
                        <StepIcon size={16} className={cn(
                          state === 'active' ? 'text-primary dark:text-blue-400' : 'text-muted dark:text-[#64748b]'
                        )} />
                      )}
                    </div>
                    <span className={cn(
                      'text-[10px] font-medium',
                      state === 'active' ? 'text-primary dark:text-blue-400' : state === 'done' ? 'text-success' : 'text-muted dark:text-[#64748b]',
                    )}>
                      {step.label}
                    </span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={cn(
                      'h-0.5 w-6 sm:w-12 mx-1 sm:mx-2 rounded-full mt-[-18px]',
                      getStepState(dispute.status, STATUS_STEPS[i + 1].key) !== 'upcoming'
                        ? 'bg-success'
                        : 'bg-border/40 dark:bg-[#252a3a]/60',
                    )} />
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Info Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Tag, label: 'Category', value: categoryLabel },
          { icon: Calendar, label: 'Filed', value: formatDate(dispute.createdAt) },
          { icon: Building2, label: 'Property', value: dispute.propertyId?.slice(0, 8) + '...' },
          { icon: User, label: 'Against', value: dispute.filedAgainst?.slice(0, 8) + '...' },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <item.icon size={12} className="text-muted dark:text-[#64748b]" />
                <span className="text-[10px] font-medium text-muted dark:text-[#64748b] uppercase tracking-wider">{item.label}</span>
              </div>
              <p className="text-xs font-semibold text-primary-dark dark:text-[#e2e8f0] truncate" title={item.value}>
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Description */}
      <Section icon={MessageSquare} title="Description">
        <Card>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-[#cbd5e1] leading-relaxed whitespace-pre-wrap">{dispute.description}</p>
          </CardContent>
        </Card>
      </Section>

      {/* Mediation Notes */}
      {dispute.mediationNotes && (
        <Section icon={Scale} title="Mediation Notes">
          <Card className="border-primary/15 dark:border-primary/20">
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-[#cbd5e1] leading-relaxed whitespace-pre-wrap">{dispute.mediationNotes}</p>
            </CardContent>
          </Card>
        </Section>
      )}

      {/* Resolution */}
      {dispute.resolution && (
        <Section icon={CheckCircle2} title="Resolution">
          <Card className="border-success/15 dark:border-success/20">
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-[#cbd5e1] leading-relaxed whitespace-pre-wrap">{dispute.resolution}</p>
            </CardContent>
          </Card>
        </Section>
      )}

      {/* Evidence */}
      <Section
        icon={Paperclip}
        title={`Evidence${dispute.evidence?.length ? ` (${dispute.evidence.length})` : ''}`}
        action={
          !isClosed && isParty ? (
            <>
              <input
                ref={evidenceInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,video/*,.pdf,.doc,.docx"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  if (files.length > 0) {
                    uploadEvidence.mutate({ id: dispute.id, files })
                  }
                  e.target.value = ''
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => evidenceInputRef.current?.click()}
                disabled={uploadEvidence.isPending}
                className="text-xs gap-1.5"
              >
                <Upload size={12} />
                {uploadEvidence.isPending ? 'Uploading...' : 'Upload'}
              </Button>
            </>
          ) : undefined
        }
      >
        {uploadEvidence.isError && (
          <div className="rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 mb-3">
            <p className="text-xs text-danger">{(uploadEvidence.error as Error).message}</p>
          </div>
        )}
        {dispute.evidence?.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {dispute.evidence.map((e) => {
              const EvidenceIcon = evidenceIcon[e.type] ?? FileText
              return (
                <a
                  key={e.id}
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/ev flex items-center gap-3 rounded-xl bg-surface/50 dark:bg-[#0c0e1a]/40 border border-border/30 dark:border-[#252a3a]/30 px-3 py-2.5 hover:border-primary/30 dark:hover:border-primary/30 transition-colors"
                >
                  <div className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    e.type === 'image' && 'bg-blue-50 dark:bg-blue-500/10',
                    e.type === 'video' && 'bg-purple-50 dark:bg-purple-500/10',
                    e.type === 'document' && 'bg-amber-50 dark:bg-amber-500/10',
                  )}>
                    <EvidenceIcon size={14} className={cn(
                      e.type === 'image' && 'text-blue-500',
                      e.type === 'video' && 'text-purple-500',
                      e.type === 'document' && 'text-amber-600 dark:text-amber-400',
                    )} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-primary-dark dark:text-[#e2e8f0] truncate">
                      {e.description || 'Uploaded file'}
                    </p>
                    <p className="text-[10px] text-muted dark:text-[#64748b] capitalize">
                      {e.type} &middot; {formatDate(e.uploadedAt)}
                    </p>
                  </div>
                  <ArrowUpRight size={14} className="text-muted dark:text-[#64748b] shrink-0 opacity-0 group-hover/ev:opacity-100 transition-opacity" />
                </a>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/50 dark:border-[#252a3a]/50">
            <EmptyState preset="general" icon={<Paperclip size={40} />} title="No evidence uploaded yet" description="Upload files to support this dispute." compact />
          </div>
        )}
      </Section>

      {/* Government Action Panel */}
      {isGov && !isClosed && (
        <Card className="border-primary/20 dark:border-primary/25 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowGovPanel(!showGovPanel)}
            className="flex w-full items-center justify-between px-5 py-4 hover:bg-primary/5 dark:hover:bg-primary/8 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/15">
                <Gavel size={16} className="text-primary dark:text-blue-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-primary-dark dark:text-[#e2e8f0]">Government Actions</p>
                <p className="text-[10px] text-muted dark:text-[#64748b]">Update status or resolve this dispute</p>
              </div>
            </div>
            <ChevronRight size={16} className={cn(
              'text-muted dark:text-[#64748b] transition-transform duration-200',
              showGovPanel && 'rotate-90',
            )} />
          </button>

          {showGovPanel && (
            <div className="px-5 pb-5 pt-2 space-y-4 border-t border-primary/10 dark:border-primary/15">
              <Select
                id="status"
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value as DisputeStatus)}
                options={[
                  { value: 'filed', label: 'Filed' },
                  { value: 'under_mediation', label: 'Under Mediation' },
                  { value: 'escalated', label: 'Escalated' },
                  { value: 'resolved', label: 'Resolved' },
                  { value: 'closed', label: 'Closed' },
                ]}
              />
              <Textarea
                id="resolution"
                label="Resolution Notes"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Describe the outcome or next steps..."
                aiContext="dispute resolution notes"
              />
              {updateStatus.isError && (
                <div className="rounded-lg bg-danger/10 border border-danger/20 px-3 py-2">
                  <p className="text-xs text-danger">{(updateStatus.error as Error).message}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setShowGovPanel(false)}>Cancel</Button>
                <Button size="sm" onClick={handleUpdate} disabled={updateStatus.isPending}>
                  {updateStatus.isPending ? 'Updating...' : 'Update Dispute'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function Section({ icon: Icon, title, children, action }: {
  icon: typeof Clock; title: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/8 dark:bg-primary/12">
            <Icon size={14} className="text-primary dark:text-blue-400" />
          </div>
          <h3 className="text-sm font-semibold text-primary-dark dark:text-[#e2e8f0] tracking-tight">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
