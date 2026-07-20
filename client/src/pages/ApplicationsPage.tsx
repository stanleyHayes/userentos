import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DetailSkeleton } from '@/components/ui/Skeleton'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'
import { DoodleArrow } from '@/components/ui/Doodles'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  FileCheck, Calendar, Clock, DollarSign, User, Building2,
  MessageSquare, Check, X as XIcon, ArrowRight,
  CheckCircle, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'

interface Application {
  id: string
  tenantId: string
  propertyId: string
  landlordId: string
  status: string
  message: string
  moveInDate: string
  duration: number
  offeredRent?: number
  landlordNotes?: string
  respondedAt?: string
  propertyTitle: string
  propertyRent: number
  tenantName: string
  tenantEmail: string
  createdAt: string
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'muted' | 'default'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  withdrawn: 'muted',
}

export function ApplicationsPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isTenant = user?.activeRole === 'tenant'
  const [statusFilter, setStatusFilter] = useState<string>('')
  const { attach: pillAttach, style: pillStyle, visible: pillVisible } = useSlidingIndicator<HTMLDivElement>(statusFilter || 'all')
  const [reviewApp, setReviewApp] = useState<Application | null>(null)
  const [responseNotes, setResponseNotes] = useState('')

  const queryString = statusFilter ? `?status=${statusFilter}` : ''
  const { data, isLoading } = useQuery({
    queryKey: ['applications', statusFilter],
    queryFn: () => api.get<{ items: Application[] }>(`/applications${queryString}`),
  })

  const withdrawMutation = useMutation({
    mutationFn: (id: string) => api.post(`/applications/${id}/withdraw`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  })

  const respondMutation = useMutation({
    mutationFn: ({ id, action, notes }: { id: string; action: string; notes?: string }) =>
      api.post<{ agreementId?: string }>(`/applications/${id}/respond`, { action, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] })
      setReviewApp(null)
      setResponseNotes('')
    },
  })

  const applications = data?.items ?? []
  const statuses = ['', 'pending', 'approved', 'rejected', 'withdrawn']
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 8
  const totalPages = Math.max(1, Math.ceil(applications.length / PAGE_SIZE))
  const paginated = applications.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (isLoading) return <DetailSkeleton />

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <DoodleArrow className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
          <h1 className="text-xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
            {isTenant ? 'My Applications' : 'Property Applications'}
          </h1>
          <p className="text-xs text-muted dark:text-gray-400 mt-1">
            {isTenant
              ? 'Track the status of your rental applications'
              : 'Review and respond to tenant applications'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <FileCheck size={18} className="text-primary dark:text-blue-400" />
          <span className="text-sm font-bold text-primary-dark dark:text-white">
            {applications.length}
          </span>
        </div>
      </div>

      {/* KPI Stats */}
      {applications.length > 0 && (() => {
        const pending = applications.filter((a) => a.status === 'pending')
        const approved = applications.filter((a) => a.status === 'approved')
        const rejected = applications.filter((a) => a.status === 'rejected')
        const rate = applications.length > 0 ? Math.round((approved.length / applications.length) * 100) : 0
        return (
          <div className="stagger-3d grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total', value: String(applications.length), icon: <FileCheck size={18} />, color: '#2563eb' },
              { label: 'Pending', value: String(pending.length), icon: <Clock size={18} />, color: '#d97706', sub: pending.length > 0 ? 'Awaiting response' : 'None pending' },
              { label: 'Approved', value: String(approved.length), icon: <CheckCircle size={18} />, color: '#059669', sub: `${rate}% success rate` },
              { label: 'Rejected', value: String(rejected.length), icon: <AlertTriangle size={18} />, color: '#dc2626' },
            ].map((kpi) => (
              <DashboardMetricCard key={kpi.label} label={kpi.label} value={kpi.value} sub={kpi.sub} icon={kpi.icon} accent={kpi.color} />
            ))}
          </div>
        )
      })()}

      {/* Filter */}
      <div ref={pillAttach} className="relative isolate flex gap-1.5 flex-wrap">
        <span aria-hidden className="pointer-events-none absolute left-0 top-0 z-0 rounded-lg bg-primary/10 dark:bg-blue-500/15 transition-[transform,width,height] duration-300 ease-out" style={{ ...pillStyle, opacity: pillVisible ? 1 : 0 }} />
        {statuses.map((s) => (
          <button
            key={s || 'all'}
            data-tab-key={s || 'all'}
            onClick={() => { setStatusFilter(s); setPage(1) }}
            className={`relative z-10 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize ${
              statusFilter === s
                ? 'text-primary dark:text-blue-400'
                : 'text-muted dark:text-gray-400 hover:bg-surface dark:hover:bg-[#0c0e1a]'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* List */}
      {applications.length === 0 ? (
        <EmptyState
          preset="properties"
          title={isTenant ? 'No applications yet' : 'No applications received'}
          description={
            isTenant
              ? 'Browse properties and submit applications to start your rental journey.'
              : 'When tenants apply to your properties, they will appear here.'
          }
          action={isTenant ? { label: 'Browse Properties', href: '/properties' } : undefined}
        />
      ) : (
        <div className="space-y-3">
          {paginated.map((app) => (
            <Card key={app.id} className="p-0 overflow-hidden">
              <div className="p-4 space-y-3">
                {/* Top row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 size={14} className="text-primary dark:text-blue-400 flex-shrink-0" />
                      <h3 className="text-sm font-bold text-primary-dark dark:text-white truncate">
                        {app.propertyTitle}
                      </h3>
                    </div>
                    {!isTenant && (
                      <div className="flex items-center gap-1.5 text-xs text-muted dark:text-gray-400">
                        <User size={11} />
                        <span className="font-medium">{app.tenantName}</span>
                        <span className="text-muted/50 dark:text-gray-600">|</span>
                        <span>{app.tenantEmail}</span>
                      </div>
                    )}
                  </div>
                  <Badge variant={statusVariant[app.status] ?? 'default'}>{app.status}</Badge>
                </div>

                {/* Message preview */}
                <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
                  {app.message}
                </p>

                {/* Details row */}
                <div className="flex flex-wrap gap-3">
                  <Detail icon={<Calendar size={11} />} label="Move-in" value={formatDate(app.moveInDate)} />
                  <Detail icon={<Clock size={11} />} label="Duration" value={`${app.duration} months`} />
                  {app.offeredRent && (
                    <Detail icon={<DollarSign size={11} />} label="Offered" value={formatCurrency(app.offeredRent)} />
                  )}
                  <Detail icon={<MessageSquare size={11} />} label="Applied" value={formatDate(app.createdAt)} />
                </div>

                {/* Landlord notes */}
                {app.landlordNotes && (
                  <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] border border-border/30 dark:border-[#252a3a]/30 p-2.5">
                    <p className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider mb-1">Landlord Notes</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">{app.landlordNotes}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  {isTenant && app.status === 'pending' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-danger"
                      onClick={() => {
                        if (confirm('Withdraw this application?')) withdrawMutation.mutate(app.id)
                      }}
                      disabled={withdrawMutation.isPending}
                    >
                      <XIcon size={12} /> Withdraw
                    </Button>
                  )}
                  {isTenant && app.status === 'approved' && (
                    <Button size="sm" onClick={() => navigate('/agreements')}>
                      <ArrowRight size={12} /> View Agreement
                    </Button>
                  )}
                  {!isTenant && app.status === 'pending' && (
                    <Button size="sm" onClick={() => { setReviewApp(app); setResponseNotes('') }}>
                      <FileCheck size={12} /> Review
                    </Button>
                  )}
                  {!isTenant && app.status === 'approved' && (
                    <Button variant="outline" size="sm" onClick={() => navigate('/agreements')}>
                      <ArrowRight size={12} /> Agreement
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted dark:text-[#64748b]">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, applications.length)} of {applications.length}</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-full text-muted hover:bg-surface dark:hover:bg-[#0c0e1a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /></button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => setPage(p)} className={`min-w-[32px] h-8 rounded-full text-xs font-medium transition-colors ${p === page ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400' : 'text-muted hover:bg-surface dark:hover:bg-[#0c0e1a]'}`}>{p}</button>
                ))}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-full text-muted hover:bg-surface dark:hover:bg-[#0c0e1a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review Modal */}
      <Modal open={!!reviewApp} onClose={() => setReviewApp(null)} title="Review Application">
        {reviewApp && (
          <div className="flex flex-col gap-4">
            {/* Tenant info */}
            <div className="rounded-xl bg-surface dark:bg-[#0c0e1a] border border-border/30 dark:border-[#252a3a]/30 p-4 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-primary/10 dark:bg-blue-500/15 flex items-center justify-center">
                  <User size={16} className="text-primary dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-primary-dark dark:text-white">{reviewApp.tenantName}</p>
                  <p className="text-[11px] text-muted dark:text-gray-400">{reviewApp.tenantEmail}</p>
                </div>
              </div>
            </div>

            {/* Application details */}
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider">Application Details</p>
              <div className="grid grid-cols-2 gap-2">
                <DetailBox label="Property" value={reviewApp.propertyTitle} />
                <DetailBox label="Move-in Date" value={formatDate(reviewApp.moveInDate)} />
                <DetailBox label="Duration" value={`${reviewApp.duration} months`} />
                <DetailBox label="Offered Rent" value={reviewApp.offeredRent ? formatCurrency(reviewApp.offeredRent) : `${formatCurrency(reviewApp.propertyRent)} (listed)`} />
              </div>
            </div>

            {/* Full message */}
            <div>
              <p className="text-[10px] font-bold text-muted dark:text-gray-500 uppercase tracking-wider mb-1.5">Message</p>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed bg-surface dark:bg-[#0c0e1a] rounded-lg p-3 border border-border/30 dark:border-[#252a3a]/30">
                {reviewApp.message}
              </p>
            </div>

            {/* Notes */}
            <Textarea
              id="response-notes"
              label="Notes (optional)"
              value={responseNotes}
              onChange={(e) => setResponseNotes(e.target.value)}
              placeholder="Add notes about your decision..."
              rows={2}
            />

            {respondMutation.isError && (
              <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
                {(respondMutation.error as Error).message}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                onClick={() => respondMutation.mutate({ id: reviewApp.id, action: 'approve', notes: responseNotes || undefined })}
                disabled={respondMutation.isPending}
              >
                <Check size={14} /> Approve
              </Button>
              <Button
                variant="outline"
                className="flex-1 text-danger border-danger/30 hover:bg-danger/5"
                onClick={() => respondMutation.mutate({ id: reviewApp.id, action: 'reject', notes: responseNotes || undefined })}
                disabled={respondMutation.isPending}
              >
                <XIcon size={14} /> Reject
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="text-muted dark:text-gray-500">{icon}</span>
      <span className="text-muted dark:text-gray-500">{label}:</span>
      <span className="font-semibold text-primary-dark dark:text-gray-200">{value}</span>
    </div>
  )
}

function DetailBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] border border-border/30 dark:border-[#252a3a]/30 p-2.5">
      <p className="text-[10px] text-muted dark:text-gray-500 mb-0.5">{label}</p>
      <p className="text-xs font-semibold text-primary-dark dark:text-white">{value}</p>
    </div>
  )
}
