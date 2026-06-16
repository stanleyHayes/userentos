import { useMemo, useState, type DragEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import {
  Wrench,
  Plus,
  Clock,
  CheckCircle2,
  Calendar,
  Image as ImageIcon,
  ChevronDown,
  Filter,
  Search,
} from 'lucide-react'
import {
  useMaintenanceRequests,
  useCreateMaintenanceRequest,
  useUpdateMaintenanceRequest,
  useCompleteMaintenance,
  useProperties,
  useAgreements,
  type MaintenanceRequest,
} from '@/hooks/useApi'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

type Status = MaintenanceRequest['status']
type Priority = MaintenanceRequest['priority']
type Category = MaintenanceRequest['category']

const KANBAN_COLUMNS: { key: Status; label: string; accent: string }[] = [
  { key: 'requested', label: 'Requested', accent: '#f59e0b' },
  { key: 'acknowledged', label: 'Acknowledged', accent: '#3b82f6' },
  { key: 'scheduled', label: 'Scheduled', accent: '#8b5cf6' },
  { key: 'in_progress', label: 'In Progress', accent: '#06b6d4' },
  { key: 'completed', label: 'Completed', accent: '#10b981' },
]

const PRIORITY_VARIANT: Record<Priority, 'muted' | 'default' | 'warning' | 'danger'> = {
  low: 'muted',
  medium: 'default',
  high: 'warning',
  urgent: 'danger',
}

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'structural', label: 'Structural' },
  { value: 'pest', label: 'Pest' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'security', label: 'Security' },
  { value: 'other', label: 'Other' },
]

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

function relativeTime(iso: string | undefined): string {
  if (!iso) return ''
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return ''
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(iso)
}

export function MaintenancePage() {
  const user = useAuthStore((s) => s.user)
  const role = user?.activeRole ?? 'tenant'
  const isTenant = role === 'tenant'
  const isLandlord =
    role === 'landlord' || role === 'property_manager' || role === 'admin' || role === 'super_admin'
  const addToast = useToastStore((s) => s.addToast)

  const { data, isLoading } = useMaintenanceRequests()
  const items = useMemo(() => data?.items ?? [], [data])

  const { data: propertiesData } = useProperties(isLandlord ? { mine: true } : undefined)
  const { data: agreementsData } = useAgreements()
  // For landlords: own properties. For tenants: properties they have agreements with.
  const propertiesForCreate = useMemo(() => {
    if (isLandlord) {
      return (propertiesData?.items ?? []).map((p) => ({
        id: p.id,
        title: p.title,
      }))
    }
    const seen = new Map<string, string>()
    for (const a of agreementsData?.items ?? []) {
      if (a.propertyId && !seen.has(a.propertyId)) {
        seen.set(a.propertyId, (a as { propertyTitle?: string }).propertyTitle ?? 'My rental')
      }
    }
    return [...seen.entries()].map(([id, title]) => ({ id, title }))
  }, [isLandlord, propertiesData, agreementsData])

  const [propertyFilter, setPropertyFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (propertyFilter && it.propertyId !== propertyFilter) return false
      if (priorityFilter && it.priority !== priorityFilter) return false
      return true
    })
  }, [items, propertyFilter, priorityFilter])

  const propertyOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const it of items) seen.set(it.propertyId, it.propertyTitle ?? 'Property')
    return [
      { value: '', label: 'All properties' },
      ...[...seen.entries()].map(([value, label]) => ({ value, label })),
    ]
  }, [items])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight flex items-center gap-2">
            <Wrench size={22} className="text-primary dark:text-blue-400" /> Maintenance
          </h1>
          <p className="text-sm text-muted dark:text-gray-500 mt-1">
            {isTenant
              ? 'Report and track maintenance issues at your rental.'
              : 'Triage and resolve tenant maintenance requests.'}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus size={14} /> New Request
        </Button>
      </div>

      {/* Filters */}
      {!isTenant && items.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted dark:text-gray-500">
            <Filter size={12} /> Filter:
          </div>
          <div className="min-w-[200px]">
            <Select
              id="filter-property"
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              options={propertyOptions}
            />
          </div>
          <div className="min-w-[160px]">
            <Select
              id="filter-priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              options={[{ value: '', label: 'All priorities' }, ...PRIORITY_OPTIONS]}
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <ListSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          preset="general"
          icon={<Wrench size={40} />}
          title="No maintenance requests"
          description={
            isTenant
              ? 'Submit a request when something at your rental needs fixing.'
              : "You're all caught up. New requests from tenants will land here."
          }
          action={{ label: 'New Request', onClick: () => setShowCreate(true) }}
        />
      ) : isTenant ? (
        <TenantList items={filtered} />
      ) : (
        <KanbanBoard items={filtered} addToast={addToast} />
      )}

      <CreateRequestModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        properties={propertiesForCreate}
      />
    </div>
  )
}

// ─── Tenant list view ───
function TenantList({ items }: { items: MaintenanceRequest[] }) {
  const navigate = useNavigate()
  return (
    <div className="space-y-3">
      {items.map((req) => {
        const trade = CATEGORY_TO_TRADE[req.category]
        return (
          <Card key={req.id} className="hover:shadow-md transition-shadow">
            <CardContent>
              <div className="flex items-start gap-3">
                {req.images?.[0] ? (
                  <img
                    src={req.images[0]}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <Wrench size={18} className="text-primary dark:text-blue-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-primary-dark dark:text-white truncate">
                      {req.title}
                    </p>
                    <Badge variant={PRIORITY_VARIANT[req.priority]} className="text-[10px] flex-shrink-0">
                      {req.priority}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted dark:text-gray-500 truncate">
                    {req.propertyTitle} &middot; {req.category}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="default" className="text-[10px] capitalize">
                      {req.status.replace('_', ' ')}
                    </Badge>
                    <span className="text-[10px] text-muted dark:text-gray-500">
                      Updated {relativeTime(req.updatedAt)}
                    </span>
                  </div>
                  {trade && (
                    <button
                      onClick={() => navigate(`/workers?trade=${trade}&maintenanceId=${req.id}`)}
                      className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary/10 dark:bg-blue-500/15 px-2 py-1 text-[10px] font-semibold text-primary dark:text-blue-400 hover:bg-primary/20 transition-colors"
                    >
                      <Search size={10} /> Find {trade} worker
                    </button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ─── Kanban board (landlord) ───
function KanbanBoard({
  items,
  addToast,
}: {
  items: MaintenanceRequest[]
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const update = useUpdateMaintenanceRequest()
  const complete = useCompleteMaintenance()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<Status | null>(null)

  // Look up the source item's current status so we don't fire a no-op mutation
  const itemById = useMemo(() => {
    const m = new Map<string, MaintenanceRequest>()
    for (const it of items) m.set(it.id, it)
    return m
  }, [items])

  async function moveRequest(id: string, targetStatus: Status) {
    const req = itemById.get(id)
    if (!req || req.status === targetStatus) return

    if (targetStatus === 'completed') {
      try {
        await complete.mutateAsync({ id })
        addToast('Marked as completed', 'success')
      } catch (err) {
        addToast((err as Error).message ?? 'Failed to complete', 'error')
      }
      return
    }

    try {
      await update.mutateAsync({ id, status: targetStatus })
      addToast('Status updated', 'success')
    } catch (err) {
      addToast((err as Error).message ?? 'Failed to update', 'error')
    }
  }

  function handleColumnDragOver(e: DragEvent<HTMLDivElement>, status: Status) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverColumn !== status) setDragOverColumn(status)
  }

  function handleColumnDragLeave(e: DragEvent<HTMLDivElement>) {
    // Only clear when leaving the column boundary, not when crossing into a child
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDragOverColumn((prev) => (prev === null ? prev : null))
  }

  function handleColumnDrop(e: DragEvent<HTMLDivElement>, status: Status) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    setDragOverColumn(null)
    setDraggingId(null)
    if (id) void moveRequest(id, status)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {KANBAN_COLUMNS.map((col) => {
        const columnItems = items.filter((it) => it.status === col.key)
        const isDropTarget = dragOverColumn === col.key
        return (
          <div
            key={col.key}
            className="flex flex-col"
            onDragOver={(e) => handleColumnDragOver(e, col.key)}
            onDragLeave={handleColumnDragLeave}
            onDrop={(e) => handleColumnDrop(e, col.key)}
          >
            <div
              className="rounded-t-xl px-3 py-2 flex items-center justify-between border-b-2"
              style={{ borderColor: col.accent, backgroundColor: `${col.accent}10` }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: col.accent }}
                />
                <span className="text-xs font-bold text-primary-dark dark:text-white">
                  {col.label}
                </span>
              </div>
              <span
                className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold leading-none text-white"
                style={{ backgroundColor: col.accent }}
              >
                {columnItems.length}
              </span>
            </div>
            <div
              className={cn(
                'flex-1 rounded-b-xl bg-surface/40 dark:bg-[#0c0e1a]/40 p-2 space-y-2 min-h-[120px] border border-t-0 transition-colors',
                isDropTarget
                  ? 'border-2 border-dashed border-primary dark:border-blue-400 bg-primary/5 dark:bg-blue-500/10'
                  : 'border-border/30 dark:border-[#252a3a]/30',
              )}
            >
              {columnItems.length === 0 ? (
                <div className="text-center py-6 text-[11px] text-muted/60 dark:text-gray-600">
                  {isDropTarget ? 'Drop here' : 'No items'}
                </div>
              ) : (
                columnItems.map((req) => (
                  <KanbanCard
                    key={req.id}
                    request={req}
                    addToast={addToast}
                    isDragging={draggingId === req.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', req.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDraggingId(req.id)
                    }}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setDragOverColumn(null)
                    }}
                    onMoveTo={(status) => void moveRequest(req.id, status)}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const CATEGORY_TO_TRADE: Record<string, string> = {
  plumbing: 'plumbing',
  electrical: 'electrical',
  structural: 'carpentry',
  pest: 'pest',
  appliance: 'appliance',
  security: 'security',
}

function KanbanCard({
  request,
  addToast,
  isDragging,
  onDragStart,
  onDragEnd,
  onMoveTo,
}: {
  request: MaintenanceRequest
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  isDragging?: boolean
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd?: (e: DragEvent<HTMLDivElement>) => void
  onMoveTo?: (status: Status) => void
}) {
  const navigate = useNavigate()
  const update = useUpdateMaintenanceRequest()
  const complete = useCompleteMaintenance()
  const [open, setOpen] = useState(false)
  const trade = CATEGORY_TO_TRADE[request.category]

  async function moveTo(status: Status) {
    setOpen(false)
    // Prefer the parent's coordinated mover when available (used by DnD board)
    if (onMoveTo) {
      onMoveTo(status)
      return
    }
    if (status === 'completed') {
      try {
        await complete.mutateAsync({ id: request.id })
        addToast('Marked as completed', 'success')
      } catch (err) {
        addToast((err as Error).message ?? 'Failed to complete', 'error')
      }
      return
    }
    try {
      await update.mutateAsync({ id: request.id, status })
      addToast('Status updated', 'success')
    } catch (err) {
      addToast((err as Error).message ?? 'Failed to update', 'error')
    }
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'rounded-lg bg-white dark:bg-[#161927] border border-border/40 dark:border-[#252a3a]/40 p-2.5 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-2">
        {request.images?.[0] ? (
          <img
            src={request.images[0]}
            alt=""
            className="w-10 h-10 rounded-md object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-md bg-primary/10 dark:bg-primary/15 flex items-center justify-center flex-shrink-0">
            <ImageIcon size={14} className="text-primary/60 dark:text-blue-400/60" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-primary-dark dark:text-white truncate">
            {request.title}
          </p>
          <p className="text-[10px] text-muted dark:text-gray-500 truncate">
            {request.propertyTitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <Badge variant={PRIORITY_VARIANT[request.priority]} className="text-[9px]">
          {request.priority}
        </Badge>
        <span className="text-[9px] text-muted dark:text-gray-500">
          {relativeTime(request.updatedAt)}
        </span>
      </div>

      {trade && (
        <button
          onClick={() => navigate(`/workers?trade=${trade}&maintenanceId=${request.id}`)}
          className="mt-2 w-full inline-flex items-center justify-center gap-1 rounded-md bg-primary/10 dark:bg-blue-500/15 px-2 py-1 text-[10px] font-semibold text-primary dark:text-blue-400 hover:bg-primary/20 transition-colors"
        >
          <Search size={10} /> Find {trade} worker
        </button>
      )}

      {/* Move dropdown */}
      <div className="mt-2 relative">
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={update.isPending || complete.isPending}
          className="w-full inline-flex items-center justify-between gap-1 rounded-md border border-border dark:border-[#252a3a] bg-white dark:bg-[#0c0e1a] px-2 py-1 text-[10px] font-semibold text-primary-dark dark:text-gray-300 hover:bg-surface dark:hover:bg-[#161927] disabled:opacity-50"
        >
          Move to <ChevronDown size={10} />
        </button>
        {open && (
          <div className="absolute z-10 left-0 right-0 mt-1 rounded-md bg-white dark:bg-[#161927] border border-border dark:border-[#252a3a] shadow-lg overflow-hidden">
            {KANBAN_COLUMNS.filter((c) => c.key !== request.status).map((c) => (
              <button
                key={c.key}
                onClick={() => moveTo(c.key)}
                className={cn(
                  'w-full text-left px-2 py-1.5 text-[10px] font-medium hover:bg-surface dark:hover:bg-[#0c0e1a] flex items-center gap-1.5',
                  'text-primary-dark dark:text-gray-300'
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.accent }} />
                {c.label}
              </button>
            ))}
            <button
              onClick={() => moveTo('cancelled')}
              className="w-full text-left px-2 py-1.5 text-[10px] font-medium hover:bg-danger/10 text-danger flex items-center gap-1.5 border-t border-border dark:border-[#252a3a]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-danger" /> Cancel
            </button>
          </div>
        )}
      </div>

      {/* Bottom meta: scheduled date / cost */}
      {(request.scheduledDate || request.cost !== undefined) && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30 dark:border-[#252a3a]/30 text-[10px] text-muted dark:text-gray-500">
          {request.scheduledDate && (
            <span className="inline-flex items-center gap-1">
              <Calendar size={10} /> {formatDate(request.scheduledDate)}
            </span>
          )}
          {request.cost !== undefined && (
            <span className="inline-flex items-center gap-1 font-semibold text-primary-dark dark:text-gray-300">
              {formatCurrency(request.cost)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Create modal ───
function CreateRequestModal({
  open,
  onClose,
  properties,
}: {
  open: boolean
  onClose: () => void
  properties: { id: string; title: string }[]
}) {
  const create = useCreateMaintenanceRequest()
  const addToast = useToastStore((s) => s.addToast)

  // For tenants: load properties they have agreements with — we just use the
  // properties list endpoint for landlords, but tenants need to type/select.
  // Fall back to a free-form propertyId text input when no properties available.
  const [propertyId, setPropertyId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<Category>('other')
  const [priority, setPriority] = useState<Priority>('medium')

  function reset() {
    setPropertyId('')
    setTitle('')
    setDescription('')
    setCategory('other')
    setPriority('medium')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!propertyId.trim() || !title.trim() || !description.trim()) {
      addToast('Please complete all fields', 'error')
      return
    }
    try {
      await create.mutateAsync({
        propertyId: propertyId.trim(),
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
      })
      addToast('Maintenance request submitted', 'success')
      reset()
      onClose()
    } catch (err) {
      addToast((err as Error).message ?? 'Failed to submit', 'error')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Maintenance Request">
      <form onSubmit={handleSubmit} className="space-y-4">
        {properties.length > 0 ? (
          <Select
            id="mr-property"
            label="Property"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            options={[
              { value: '', label: 'Select property…' },
              ...properties.map((p) => ({ value: p.id, label: p.title })),
            ]}
            required
          />
        ) : (
          <Input
            id="mr-propertyId"
            label="Property ID"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            placeholder="Property identifier"
            required
          />
        )}
        <Input
          id="mr-title"
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Kitchen tap leaking"
          required
        />
        <Textarea
          id="mr-description"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe the issue in detail"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="mr-category"
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            options={CATEGORY_OPTIONS}
          />
          <Select
            id="mr-priority"
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            options={PRIORITY_OPTIONS}
          />
        </div>

        <div className="flex items-center gap-2 justify-end pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending} className="gap-1.5">
            {create.isPending ? (
              <>
                <Clock size={14} /> Submitting…
              </>
            ) : (
              <>
                <CheckCircle2 size={14} /> Submit
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
