import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import {
  AdminPageHeader,
  AdminStatGrid,
  AdminStatCard,
  AdminToolbar,
  AdminLoadingState,
  AdminEmptyState,
  AdminPagination,
} from '@/components/admin/AdminPagePrimitives'
import {
  useApprovals,
  useApproveEntity,
  useRejectEntity,
  type ApprovalEntityType,
  type ApprovalStatus,
  type ApprovalItem,
} from '@/hooks/useApi'
import { useToastStore } from '@/stores/toastStore'
import { formatDate } from '@/lib/utils'
import {
  Building2,
  Check,
  Clock3,
  Landmark,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'

const ENTITY_TABS: { label: string; value: ApprovalEntityType }[] = [
  { label: 'Workers', value: 'worker' },
  { label: 'Businesses', value: 'business' },
  { label: 'Financiers', value: 'financier' },
  { label: 'Insurance Providers', value: 'insurance_provider' },
]

const STATUS_FILTERS: { label: string; value: ApprovalStatus }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]

const PAGE_SIZE = 20

function statusVariant(status: ApprovalStatus): 'success' | 'danger' | 'warning' {
  switch (status) {
    case 'approved': return 'success'
    case 'rejected': return 'danger'
    default: return 'warning'
  }
}

function entityName(type: ApprovalEntityType, item: ApprovalItem): string {
  if (type === 'financier' || type === 'insurance_provider') return item.institutionName ?? 'Unnamed institution'
  return item.name ?? 'Unnamed'
}

function entitySubtitle(type: ApprovalEntityType, item: ApprovalItem): string {
  switch (type) {
    case 'worker':
      return [item.trades?.join(', '), item.location].filter(Boolean).join(' · ') || 'No details submitted'
    case 'business':
      return [item.category?.replace(/_/g, ' '), item.city].filter(Boolean).join(' · ') || 'No details submitted'
    case 'financier':
    case 'insurance_provider':
      return [item.licenseNumber ? `License ${item.licenseNumber}` : null, item.companyRegistrationNo ? `Reg. ${item.companyRegistrationNo}` : null]
        .filter(Boolean).join(' · ') || 'No license details submitted'
  }
}

function entityIcon(type: ApprovalEntityType) {
  switch (type) {
    case 'worker': return <Wrench size={20} />
    case 'business': return <Building2 size={20} />
    default: return <Landmark size={20} />
  }
}

export function ApprovalsPage() {
  const [activeType, setActiveType] = useState<ApprovalEntityType>('worker')
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus>('pending')
  const [page, setPage] = useState(1)
  const [rejectTarget, setRejectTarget] = useState<ApprovalItem | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const approvalsQuery = useApprovals(activeType, statusFilter, page, PAGE_SIZE)
  // When the main query IS the pending list on page 1, its total is the pending
  // count — only fire the separate count query when that isn't the case.
  const derivePending = statusFilter === 'pending' && page === 1
  const pendingQuery = useApprovals(activeType, 'pending', 1, 1, !derivePending)
  const approve = useApproveEntity()
  const reject = useRejectEntity()
  const addToast = useToastStore((s) => s.addToast)

  const items = approvalsQuery.data?.items ?? []
  const total = approvalsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pendingTotal = derivePending ? total : (pendingQuery.data?.total ?? 0)

  function switchType(type: ApprovalEntityType) {
    setActiveType(type)
    setPage(1)
  }

  function switchStatus(status: ApprovalStatus) {
    setStatusFilter(status)
    setPage(1)
  }

  function approveItem(item: ApprovalItem) {
    approve.mutate(
      { type: activeType, id: item._id },
      {
        // Approving shrinks the list — jump back to page 1 so the current page
        // can't end up past the new page count.
        onSuccess: () => {
          addToast(`${entityName(activeType, item)} approved`, 'success')
          setPage(1)
        },
        onError: (e) => addToast((e as Error).message, 'error'),
      },
    )
  }

  function openReject(item: ApprovalItem) {
    setRejectTarget(item)
    setRejectReason('')
  }

  function submitReject() {
    if (!rejectTarget) return
    const reason = rejectReason.trim()
    if (!reason) {
      addToast('A rejection reason is required', 'error')
      return
    }
    reject.mutate(
      { type: activeType, id: rejectTarget._id, reason },
      {
        onSuccess: () => {
          addToast(`${entityName(activeType, rejectTarget)} rejected`, 'info')
          setRejectTarget(null)
          setRejectReason('')
          setPage(1) // same reason as approve: the list just shrank
        },
        onError: (e) => addToast((e as Error).message, 'error'),
      },
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Administration"
        title="Entity Approvals"
        description="Review worker, business, financier, and insurance provider profiles. Approved entities unlock their role-specific features."
        icon={<ShieldCheck size={24} />}
        accent="#10b981"
        meta={`${pendingTotal} pending in this tab`}
      >
        <Badge variant="warning" className="px-3 py-1">{pendingTotal} pending</Badge>
      </AdminPageHeader>

      <AdminStatGrid>
        <AdminStatCard
          label="Pending Review"
          value={String(pendingTotal)}
          description={`${ENTITY_TABS.find((t) => t.value === activeType)?.label} awaiting a decision`}
          icon={<Clock3 size={18} />}
          accent="#f59e0b"
        />
        <AdminStatCard
          label="In Current View"
          value={String(total)}
          description={`Status: ${statusFilter}`}
          icon={<ShieldCheck size={18} />}
          accent="#10b981"
        />
      </AdminStatGrid>

      <AdminToolbar
        title="Approval Queue"
        description="Pick an entity type and status to review submissions."
        resultLabel={`${total} result${total === 1 ? '' : 's'}`}
      >
        <div className="flex flex-wrap gap-2">
          {ENTITY_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => switchType(t.value)}
              aria-pressed={activeType === t.value}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                activeType === t.value
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-border/60 bg-surface text-muted hover:text-foreground dark:border-[#252a3a] dark:bg-[#161927] dark:text-white/60 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => switchStatus(f.value)}
              aria-pressed={statusFilter === f.value}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                statusFilter === f.value
                  ? 'bg-primary-dark text-white dark:bg-white dark:text-primary-dark'
                  : 'border border-border/60 text-muted hover:text-foreground dark:border-[#252a3a] dark:text-white/60 dark:hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </AdminToolbar>

      {approvalsQuery.isLoading ? (
        <AdminLoadingState title="Loading approvals" description="Fetching the current review queue..." />
      ) : items.length === 0 ? (
        <AdminEmptyState
          title={`No ${statusFilter} ${ENTITY_TABS.find((t) => t.value === activeType)?.label.toLowerCase()}`}
          description="Submissions matching this filter will appear here."
          icon={<ShieldCheck size={28} />}
        />
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const isPending = item.approvalStatus === 'pending'
            const contactName = [item.user?.firstName, item.user?.lastName].filter(Boolean).join(' ')

            return (
              <Card key={item._id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
                      {entityIcon(activeType)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words font-display text-lg font-extrabold text-primary-dark dark:text-white">
                          {entityName(activeType, item)}
                        </h3>
                        <Badge variant={statusVariant(item.approvalStatus)} className="capitalize">{item.approvalStatus}</Badge>
                      </div>
                      <p className="mt-1 text-xs capitalize text-muted">{entitySubtitle(activeType, item)}</p>

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                        {contactName && (
                          <span className="inline-flex items-center gap-1.5"><UserRound size={12} /> {contactName}</span>
                        )}
                        {item.user?.email && (
                          <span className="inline-flex items-center gap-1.5"><Mail size={12} /> {item.user.email}</span>
                        )}
                        {(item.user?.phone || item.contactPhone) && (
                          <span className="inline-flex items-center gap-1.5"><Phone size={12} /> {item.user?.phone ?? item.contactPhone}</span>
                        )}
                        {item.location && activeType === 'worker' && (
                          <span className="inline-flex items-center gap-1.5"><MapPin size={12} /> {item.location}</span>
                        )}
                      </div>

                      {item.approvalStatus === 'rejected' && item.rejectionReason && (
                        <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-800 dark:bg-red-400/10 dark:text-red-200">
                          Rejection reason: {item.rejectionReason}
                        </p>
                      )}
                      {item.approvalStatus === 'approved' && item.approvedAt && (
                        <p className="mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          Approved {formatDate(item.approvedAt)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
                    {item.createdAt && (
                      <p className="text-xs text-muted">Submitted {formatDate(item.createdAt)}</p>
                    )}
                    {isPending && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => approveItem(item)} disabled={approve.isPending || reject.isPending}>
                          <Check size={14} /> Approve
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => openReject(item)} disabled={approve.isPending || reject.isPending}>
                          <X size={14} /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <AdminPagination
        page={page}
        totalPages={totalPages}
        onPrevious={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      />

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject submission">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {rejectTarget && (
              <>Rejecting <span className="font-semibold text-primary-dark dark:text-white">{entityName(activeType, rejectTarget)}</span> — the applicant will see this reason.</>
            )}
          </p>
          <Textarea
            id="reject-reason"
            label="Rejection reason"
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={reject.isPending}>Cancel</Button>
            <Button variant="danger" onClick={submitReject} disabled={reject.isPending || !rejectReason.trim()}>
              <X size={14} /> Reject
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
