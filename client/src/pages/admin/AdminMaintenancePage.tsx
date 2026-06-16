import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  AdminPagination,
  AdminStatCard,
  AdminStatGrid,
  AdminTableCard,
  AdminToolbar,
} from '@/components/admin/AdminPagePrimitives'
import { adminTableClassName } from '@/components/admin/adminPageUtils'
import { useAdminMaintenance, type MaintenanceRequest } from '@/hooks/useApi'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, FileSearch, Flame, Hammer, Wrench } from 'lucide-react'

const STATUS_FILTERS: { label: string; value: MaintenanceRequest['status'] | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Requested', value: 'requested' },
  { label: 'Acknowledged', value: 'acknowledged' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
]

const statusVariant: Record<MaintenanceRequest['status'], 'success' | 'warning' | 'danger' | 'muted' | 'default'> = {
  requested: 'warning',
  acknowledged: 'default',
  scheduled: 'default',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'muted',
}

const priorityVariant: Record<MaintenanceRequest['priority'], 'success' | 'warning' | 'danger' | 'muted' | 'default'> = {
  low: 'muted',
  medium: 'default',
  high: 'warning',
  urgent: 'danger',
}

function relativeAge(iso?: string): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days >= 1) return `${days}d ago`
  const hrs = Math.floor(ms / (1000 * 60 * 60))
  if (hrs >= 1) return `${hrs}h ago`
  const mins = Math.floor(ms / (1000 * 60))
  return `${Math.max(1, mins)}m ago`
}

function label(value: string) {
  return value.replaceAll('_', ' ')
}

export function AdminMaintenancePage() {
  const [statusFilter, setStatusFilter] = useState<MaintenanceRequest['status'] | 'all'>('all')
  const [page, setPage] = useState(1)
  const queryParams = useMemo(
    () => ({ status: statusFilter === 'all' ? undefined : statusFilter, page }),
    [statusFilter, page],
  )
  const { data, isLoading } = useAdminMaintenance(queryParams)
  const items = useMemo(() => data?.items ?? [], [data?.items])
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const stats = useMemo(() => {
    const open = items.filter((m) => m.status !== 'completed' && m.status !== 'cancelled').length
    const urgent = items.filter((m) => m.priority === 'urgent' || m.priority === 'high').length
    const scheduled = items.filter((m) => m.status === 'scheduled' || m.status === 'in_progress').length
    const completed = items.filter((m) => m.status === 'completed').length
    const cost = items.reduce((sum, m) => sum + (m.cost ?? 0), 0)

    return { open, urgent, scheduled, completed, cost }
  }, [items])

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Platform admin"
        title="Maintenance Command"
        description="Track open repairs, urgent work orders, scheduled visits, vendors, tenants, and cost exposure across the platform."
        icon={<Wrench size={22} />}
        accent="#f59e0b"
        meta={`${total} requests platform-wide • Page ${page} of ${totalPages}`}
      />

      <AdminStatGrid>
        <AdminStatCard
          label="Open requests"
          value={stats.open.toLocaleString()}
          description={`${items.length.toLocaleString()} requests visible in the current result set.`}
          icon={<Hammer size={18} />}
          accent="#60a5fa"
        />
        <AdminStatCard
          label="High urgency"
          value={stats.urgent.toLocaleString()}
          description="High or urgent jobs that should stay prominent for operations."
          icon={<Flame size={18} />}
          accent="#f43f5e"
        />
        <AdminStatCard
          label="Scheduled work"
          value={stats.scheduled.toLocaleString()}
          description="Visible requests already scheduled or actively in progress."
          icon={<CalendarClock size={18} />}
          accent="#8b5cf6"
        />
        <AdminStatCard
          label="Visible cost"
          value={formatCurrency(stats.cost)}
          description={`${stats.completed.toLocaleString()} visible requests are marked completed.`}
          icon={<CheckCircle2 size={18} />}
          accent="#10b981"
        />
      </AdminStatGrid>

      <AdminToolbar
        title="Maintenance filters"
        description="Use status filters to focus on triage, scheduling, active work, or closure."
        resultLabel={`${items.length.toLocaleString()} visible`}
      >
        <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={statusFilter === f.value ? 'primary' : 'outline'}
              className="shrink-0"
              onClick={() => {
                setStatusFilter(f.value)
                setPage(1)
              }}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </AdminToolbar>

      {isLoading ? (
        <AdminLoadingState title="Loading maintenance requests" description="Collecting repair, vendor, and tenant context." />
      ) : items.length === 0 ? (
        <AdminEmptyState
          title="No maintenance requests"
          description="No requests match the selected status filter."
          icon={<FileSearch size={22} />}
        />
      ) : (
        <AdminTableCard
          title="Maintenance queue"
          description="Issue details, location, tenant, urgency, vendor schedule, and age arranged for triage."
        >
          <table className={adminTableClassName('min-w-[1040px]')}>
            <thead>
              <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted dark:border-[#252a3a]/70 dark:text-gray-500">
                <th className="px-4 py-3 font-bold">Issue</th>
                <th className="px-4 py-3 font-bold">Property</th>
                <th className="px-4 py-3 font-bold">Tenant</th>
                <th className="px-4 py-3 font-bold">Priority</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Schedule</th>
                <th className="px-4 py-3 text-right font-bold">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 dark:divide-[#252a3a]/50">
              {items.map((m) => (
                <tr key={m.id} className="align-top transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.03]">
                  <td className="px-4 py-4">
                    <div className="font-bold text-primary-dark dark:text-white">{m.title}</div>
                    <div className="mt-1 text-[11px] capitalize text-muted dark:text-gray-500">{label(m.category)}</div>
                    {m.cost !== undefined && <div className="mt-1 text-[11px] font-semibold text-primary dark:text-blue-400">{formatCurrency(m.cost)}</div>}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-primary-dark dark:text-white">{m.propertyTitle ?? m.propertyId.slice(0, 8)}</div>
                    {m.propertyAddress && (
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">
                        {[m.propertyAddress.street, m.propertyAddress.city].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-primary-dark dark:text-white">{m.tenantName ?? m.tenantId.slice(0, 8)}</div>
                    <div className="mt-1 text-[11px] text-muted dark:text-gray-500">{m.tenantPhone ?? 'No phone on record'}</div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={priorityVariant[m.priority]} className="text-[10px] capitalize">{m.priority}</Badge>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={statusVariant[m.status]} className="text-[10px] capitalize">{label(m.status)}</Badge>
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-muted dark:text-gray-500">
                      <AlertTriangle size={12} />
                      {m.notes.length.toLocaleString()} notes
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-primary-dark dark:text-white">{m.vendorName ?? 'Vendor not assigned'}</div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-muted dark:text-gray-500">
                      <Clock3 size={12} />
                      {m.scheduledDate ? formatDate(m.scheduledDate) : 'No scheduled date'}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="font-bold text-primary-dark dark:text-white">{relativeAge(m.createdAt)}</div>
                    <div className="text-[11px] text-muted dark:text-gray-500">updated {relativeAge(m.updatedAt)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableCard>
      )}

      <AdminPagination
        page={page}
        totalPages={totalPages}
        onPrevious={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  )
}
