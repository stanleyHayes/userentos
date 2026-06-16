import { useState, useMemo, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import { useDisputes, useCreateDispute, useAgreements } from '@/hooks/useApi'
import { useAuthStore } from '@/stores/authStore'
import { cn, formatDate } from '@/lib/utils'
import {
  AlertTriangle, Plus, Calendar,
  FileText, CheckCircle2, Clock, Shield,
  Scale, ChevronRight, Paperclip, Gavel,
  Search, TrendingUp,
} from 'lucide-react'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { DoodleZigzag } from '@/components/ui/Doodles'
import { EmptyState } from '@/components/ui/EmptyState'
import type { DisputeStatus } from '@/types'

const statusVariant: Record<DisputeStatus, 'warning' | 'default' | 'danger' | 'success' | 'muted'> = {
  filed: 'warning',
  under_mediation: 'default',
  escalated: 'danger',
  resolved: 'success',
  closed: 'muted',
}

const statusIcon: Record<DisputeStatus, typeof Clock> = {
  filed: FileText,
  under_mediation: Scale,
  escalated: AlertTriangle,
  resolved: CheckCircle2,
  closed: Shield,
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
  rent_increase: '💰',
  eviction: '🏠',
  maintenance: '🔧',
  deposit_refund: '💳',
  illegal_clause: '📜',
  other: '📋',
}

type FilterTab = 'all' | DisputeStatus

export function DisputesPage() {
  const user = useAuthStore((s) => s.user)
  const isGov = user?.activeRole === 'government' || user?.activeRole === 'admin' || user?.activeRole === 'legal_officer'
  const { data, isLoading } = useDisputes()
  const { data: agreementsData } = useAgreements()
  const disputes = useMemo(() => data?.items ?? [], [data?.items])
  const agreements = agreementsData?.items ?? []
  const activeAgreement = agreements.find((a) => a.status === 'active')
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Stats
  const stats = useMemo(() => ({
    total: disputes.length,
    filed: disputes.filter((d) => d.status === 'filed').length,
    under_mediation: disputes.filter((d) => d.status === 'under_mediation').length,
    escalated: disputes.filter((d) => d.status === 'escalated').length,
    resolved: disputes.filter((d) => d.status === 'resolved').length,
    closed: disputes.filter((d) => d.status === 'closed').length,
  }), [disputes])

  const resolutionRate = stats.total > 0 ? Math.round(((stats.resolved + stats.closed) / stats.total) * 100) : 0

  // Filtered disputes
  const filtered = useMemo(() => {
    let result = disputes
    if (activeTab !== 'all') result = result.filter((d) => d.status === activeTab)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((d) => d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q))
    }
    return result
  }, [disputes, activeTab, searchQuery])

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'filed', label: 'Filed', count: stats.filed },
    { key: 'under_mediation', label: 'Mediation', count: stats.under_mediation },
    { key: 'escalated', label: 'Escalated', count: stats.escalated },
    { key: 'resolved', label: 'Resolved', count: stats.resolved },
    { key: 'closed', label: 'Closed', count: stats.closed },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white">
              <Gavel size={20} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
                Disputes
              </h1>
              <p className="text-xs text-muted dark:text-gray-400">
                {isGov ? 'Review and resolve rental disputes' : 'File and track rental disputes'}
              </p>
              <DoodleZigzag className="text-primary/10 dark:text-blue-400/10 w-28 pointer-events-none mt-1" />
            </div>
          </div>
        </div>
        {!isGov && (
          activeAgreement ? (
            <Button data-testid="new-dispute-button" onClick={() => setShowCreate(true)}>
              <Plus size={16} />
              File Dispute
            </Button>
          ) : (
            <div className="text-right">
              <Button data-testid="new-dispute-button" disabled className="opacity-50 cursor-not-allowed">
                <Plus size={16} />
                File Dispute
              </Button>
              <p className="text-[11px] text-muted mt-1">You need an active lease</p>
            </div>
          )
        )}
      </div>

      {/* Stats Strip */}
      {disputes.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<AlertTriangle size={16} />}
            label="Open Disputes"
            value={stats.filed + stats.under_mediation + stats.escalated}
            gradient="from-amber-500 to-orange-500"
            alert={stats.escalated > 0}
          />
          <StatCard
            icon={<Scale size={16} />}
            label="In Mediation"
            value={stats.under_mediation}
            gradient="from-blue-500 to-indigo-500"
          />
          <StatCard
            icon={<CheckCircle2 size={16} />}
            label="Resolved"
            value={stats.resolved + stats.closed}
            gradient="from-emerald-500 to-teal-500"
          />
          <StatCard
            icon={<TrendingUp size={16} />}
            label="Resolution Rate"
            value={`${resolutionRate}%`}
            gradient={resolutionRate >= 70 ? 'from-emerald-500 to-green-500' : resolutionRate >= 40 ? 'from-amber-500 to-yellow-500' : 'from-red-500 to-rose-500'}
          />
        </div>
      )}

      {/* Filter Tabs + Search */}
      {disputes.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                  activeTab === tab.key
                    ? 'bg-primary text-white dark:bg-blue-600'
                    : 'bg-surface dark:bg-[#161927] text-muted dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#252a3a]'
                )}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-full text-[10px]',
                    activeTab === tab.key
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-200 dark:bg-[#0c0e1a] text-muted dark:text-gray-500'
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative flex-shrink-0 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search disputes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-full text-xs bg-surface dark:bg-[#161927] border border-border dark:border-[#252a3a] text-primary-dark dark:text-white placeholder:text-muted dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20 dark:focus:ring-blue-500/20"
            />
          </div>
        </div>
      )}

      {/* Disputes List */}
      {isLoading ? (
        <ListSkeleton />
      ) : disputes.length === 0 ? (
        <EmptyState preset="disputes" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-center py-8">
              <Search size={32} className="mx-auto text-muted dark:text-gray-500 mb-3" />
              <p className="text-sm text-muted dark:text-gray-400">No disputes match your filters</p>
              <button onClick={() => { setActiveTab('all'); setSearchQuery('') }} className="text-xs text-primary dark:text-blue-400 mt-2 hover:underline">
                Clear filters
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((dispute) => {
            const SIcon = statusIcon[dispute.status]
            const sColor = statusColor[dispute.status]
            const catEmoji = categoryIcon[dispute.category] ?? '📋'
            const catLabel = categoryOptions.find((c) => c.value === dispute.category)?.label ?? dispute.category

            return (
              <Card
                key={dispute.id}
                data-testid="dispute-row"
                className="group cursor-pointer hover:border-primary/30 dark:hover:border-blue-500/30 hover:shadow-md dark:hover:shadow-black/20 transition-all"
                onClick={() => navigate(`/disputes/${dispute.id}`)}
              >
                <CardContent>
                  <div className="flex items-start gap-4">
                    {/* Status icon */}
                    <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl flex-shrink-0', sColor)}>
                      <SIcon size={18} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-primary-dark dark:text-white truncate group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">
                            {dispute.title}
                          </h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[11px] text-muted dark:text-gray-400 flex items-center gap-1">
                              <span>{catEmoji}</span> {catLabel}
                            </span>
                            <span className="text-[10px] text-muted dark:text-gray-500">·</span>
                            <span className="text-[11px] text-muted dark:text-gray-400 flex items-center gap-1">
                              <Calendar size={10} /> {formatDate(dispute.createdAt)}
                            </span>
                            {dispute.evidence?.length > 0 && (
                              <>
                                <span className="text-[10px] text-muted dark:text-gray-500">·</span>
                                <span className="text-[11px] text-muted dark:text-gray-400 flex items-center gap-1">
                                  <Paperclip size={10} /> {dispute.evidence.length}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant={statusVariant[dispute.status]} className="text-[10px]">
                            {dispute.status.replace(/_/g, ' ')}
                          </Badge>
                          <ChevronRight size={16} className="text-muted dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>

                      {/* Description preview */}
                      <p className="text-xs text-muted dark:text-gray-400 mt-2 line-clamp-2 leading-relaxed">
                        {dispute.description}
                      </p>

                      {/* Progress bar for mediation/escalated */}
                      {(dispute.status === 'under_mediation' || dispute.status === 'escalated') && (
                        <div className="mt-3">
                          <div className="flex gap-1">
                            {['filed', 'under_mediation', 'escalated', 'resolved', 'closed'].map((step) => {
                              const state = getStepState(dispute.status, step as DisputeStatus)
                              return (
                                <div
                                  key={step}
                                  className={cn(
                                    'h-1 flex-1 rounded-full',
                                    state === 'done' ? 'bg-emerald-500' :
                                    state === 'active' ? (dispute.status === 'escalated' ? 'bg-red-500' : 'bg-blue-500') :
                                    'bg-gray-200 dark:bg-[#161927]'
                                  )}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <CreateDisputeModal open={showCreate} onClose={() => setShowCreate(false)} activeAgreement={activeAgreement} />
    </div>
  )
}

// --- Stat Card ---

function StatCard({ icon, label, value, gradient, alert }: {
  icon: React.ReactNode; label: string; value: number | string; gradient: string; alert?: boolean
}) {
  return (
    <Card className={cn('overflow-hidden', alert && 'ring-1 ring-red-500/30')}>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-white flex-shrink-0', gradient)}>
            {icon}
          </div>
          <div>
            <p className="text-lg font-extrabold font-display text-primary-dark dark:text-white">{value}</p>
            <p className="text-[10px] text-muted dark:text-gray-500">{label}</p>
          </div>
          {alert && <Badge variant="danger" className="ml-auto animate-pulse text-[9px]">!</Badge>}
        </div>
      </CardContent>
    </Card>
  )
}

function getStepState(current: DisputeStatus, step: DisputeStatus) {
  const order: DisputeStatus[] = ['filed', 'under_mediation', 'escalated', 'resolved', 'closed']
  const ci = order.indexOf(current)
  const si = order.indexOf(step)
  if (si < ci) return 'done'
  if (si === ci) return 'active'
  return 'upcoming'
}

interface ActiveAgreement {
  id: string
  landlordId: string
  propertyId: string
  landlordName?: string
}

function CreateDisputeModal({ open, onClose, activeAgreement }: { open: boolean; onClose: () => void; activeAgreement?: ActiveAgreement }) {
  const createDispute = useCreateDispute()
  const [form, setForm] = useState({
    filedAgainst: '', propertyId: '', category: 'rent_increase' as const,
    title: '', description: '', agreementId: '',
  })

  const hasPreFilled = useState(false)
  if (open && activeAgreement && !hasPreFilled[0]) {
    setForm((prev) => ({
      ...prev,
      filedAgainst: activeAgreement.landlordId ?? '',
      propertyId: activeAgreement.propertyId ?? '',
      agreementId: activeAgreement.id ?? '',
    }))
    hasPreFilled[1](true)
  }
  if (!open && hasPreFilled[0]) {
    hasPreFilled[1](false)
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const { agreementId, ...rest } = form
    await createDispute.mutateAsync({ ...rest, ...(agreementId ? { agreementId } : {}) })
    onClose()
    setForm({ filedAgainst: '', propertyId: '', category: 'rent_increase', title: '', description: '', agreementId: '' })
  }

  const landlordLabel = activeAgreement?.landlordName
    ? `${activeAgreement.landlordName} (${activeAgreement.landlordId?.slice(0, 8)}...)`
    : activeAgreement?.landlordId?.slice(0, 12) + '...'

  return (
    <Modal open={open} onClose={onClose} title="File a Dispute">
      <form data-testid="dispute-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
        {activeAgreement && (
          <div className="rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/15 dark:border-primary/20 p-3">
            <p className="text-xs font-semibold text-primary-dark dark:text-blue-300 mb-1">Filing against your current lease</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted dark:text-gray-400">
              <span>Landlord: <strong className="text-primary-dark dark:text-white">{landlordLabel}</strong></span>
              <span>Property: <strong className="text-primary-dark dark:text-white">{activeAgreement.propertyId?.slice(0, 8)}...</strong></span>
            </div>
          </div>
        )}
        <TextField
          id="title"
          label="Title"
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          required
          fullWidth
          placeholder="Brief summary of the dispute"
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { 'data-testid': 'dispute-title' },
          }}
        />
        <TextField
          id="category"
          select
          label="Category"
          value={form.category}
          onChange={(e) => update('category', e.target.value)}
          fullWidth
          data-testid="dispute-category"
          slotProps={{
            inputLabel: { shrink: true },
            select: { displayEmpty: true },
          }}
        >
          {categoryOptions.map((o) => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
        <TextField
          id="description"
          label="Description"
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          required
          multiline
          rows={4}
          fullWidth
          placeholder="Describe the issue in detail (min 10 characters)"
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { minLength: 10, 'data-testid': 'dispute-description' },
          }}
        />
        {createDispute.isError && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{(createDispute.error as Error).message}</div>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" data-testid="dispute-submit" disabled={createDispute.isPending}>{createDispute.isPending ? 'Filing...' : 'File Dispute'}</Button>
        </div>
      </form>
    </Modal>
  )
}
