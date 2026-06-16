import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDate } from '@/lib/utils'
import {
  Lock, Check, X as XIcon, Clock, User, Eye, Ban, RotateCcw,
  MessageSquare, Building2, ChevronDown,
} from 'lucide-react'
import { DoodleCircle } from '@/components/ui/Doodles'

interface AccessRequest {
  id: string
  requesterId: string
  tenantId: string
  propertyId?: string
  status: 'pending' | 'approved' | 'denied' | 'revoked'
  requestedAt: string
  respondedAt?: string
  message?: string
  requesterName?: string
  requesterEmail?: string
  tenantName?: string
  tenantEmail?: string
}

const statusConfig: Record<string, { variant: 'warning' | 'success' | 'danger' | 'default'; label: string; icon: React.ReactNode }> = {
  pending: { variant: 'warning', label: 'Pending', icon: <Clock size={12} /> },
  approved: { variant: 'success', label: 'Approved', icon: <Check size={12} /> },
  denied: { variant: 'danger', label: 'Denied', icon: <XIcon size={12} /> },
  revoked: { variant: 'default', label: 'Revoked', icon: <Ban size={12} /> },
}

export function ProfileAccessPage() {
  const user = useAuthStore((s) => s.user)
  const isTenant = user?.activeRole === 'tenant'
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'denied' | 'revoked'>('all')

  const { data: requests, isLoading } = useQuery<AccessRequest[]>({
    queryKey: ['profile-access-requests'],
    queryFn: () => api.get('/profile-access/requests'),
  })

  const respondMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'deny' }) =>
      api.post(`/profile-access/${id}/respond`, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-access-requests'] }),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/profile-access/${id}/revoke`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-access-requests'] }),
  })

  const filtered = (requests ?? []).filter((r) => filter === 'all' || r.status === filter)
  const counts = {
    all: requests?.length ?? 0,
    pending: requests?.filter((r) => r.status === 'pending').length ?? 0,
    approved: requests?.filter((r) => r.status === 'approved').length ?? 0,
    denied: requests?.filter((r) => r.status === 'denied').length ?? 0,
    revoked: requests?.filter((r) => r.status === 'revoked').length ?? 0,
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="relative">
        <DoodleCircle className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
        <h1 className="text-xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight flex items-center gap-2">
          <Lock size={22} className="text-primary dark:text-blue-400" />
          Profile Access
        </h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-1">
          {isTenant
            ? 'Manage who can view your tenant profile. Approve or deny incoming requests.'
            : 'View the status of your profile access requests to tenants.'}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'pending', 'approved', 'denied', 'revoked'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === f
                ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400'
                : 'text-muted dark:text-gray-400 hover:bg-surface dark:hover:bg-[#0c0e1a]'
            }`}
          >
            <span className="capitalize">{f}</span>
            <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-primary/10 dark:bg-blue-500/10 text-[10px] font-bold">
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {/* Requests list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          preset="properties"
          title={filter === 'all' ? 'No access requests yet' : `No ${filter} requests`}
          description={
            isTenant
              ? 'When someone requests access to your profile, it will appear here.'
              : 'When you request access to a tenant\'s profile, it will appear here.'
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              isTenant={isTenant}
              onApprove={() => respondMutation.mutate({ id: request.id, action: 'approve' })}
              onDeny={() => respondMutation.mutate({ id: request.id, action: 'deny' })}
              onRevoke={() => revokeMutation.mutate(request.id)}
              isResponding={respondMutation.isPending}
              isRevoking={revokeMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RequestCard({
  request,
  isTenant,
  onApprove,
  onDeny,
  onRevoke,
  isResponding,
  isRevoking,
}: {
  request: AccessRequest
  isTenant: boolean
  onApprove: () => void
  onDeny: () => void
  onRevoke: () => void
  isResponding: boolean
  isRevoking: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const cfg = statusConfig[request.status]
  const otherName = isTenant ? request.requesterName : request.tenantName
  const otherEmail = isTenant ? request.requesterEmail : request.tenantEmail

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 dark:bg-blue-500/15 flex-shrink-0">
              <User size={18} className="text-primary dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary-dark dark:text-white truncate">
                {otherName ?? 'Unknown User'}
              </p>
              {otherEmail && (
                <p className="text-xs text-muted dark:text-gray-500 truncate">{otherEmail}</p>
              )}
            </div>
          </div>
          <Badge variant={cfg.variant}>
            <span className="inline-flex items-center gap-1">{cfg.icon} {cfg.label}</span>
          </Badge>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted dark:text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Clock size={11} /> Requested {formatDate(request.requestedAt)}
          </span>
          {request.respondedAt && (
            <span className="inline-flex items-center gap-1">
              <Check size={11} /> Responded {formatDate(request.respondedAt)}
            </span>
          )}
          {request.propertyId && (
            <span className="inline-flex items-center gap-1">
              <Building2 size={11} /> Property linked
            </span>
          )}
        </div>

        {/* Message */}
        {request.message && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-2 text-xs text-primary dark:text-blue-400 hover:underline"
          >
            <MessageSquare size={11} /> View message
            <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
        {expanded && request.message && (
          <div className="mt-2 p-3 rounded-lg bg-surface dark:bg-[#0c0e1a] border border-border/40 dark:border-[#252a3a]/40">
            <p className="text-xs text-gray-600 dark:text-gray-300 italic">"{request.message}"</p>
          </div>
        )}

        {/* Actions */}
        {isTenant && request.status === 'pending' && (
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={onApprove} disabled={isResponding}>
              <Check size={14} /> Approve
            </Button>
            <Button variant="outline" size="sm" onClick={onDeny} disabled={isResponding} className="text-danger border-danger/30 hover:bg-danger/10">
              <XIcon size={14} /> Deny
            </Button>
          </div>
        )}

        {isTenant && request.status === 'approved' && (
          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={onRevoke} disabled={isRevoking} className="text-danger border-danger/30 hover:bg-danger/10">
              <Ban size={14} /> Revoke Access
            </Button>
          </div>
        )}

        {!isTenant && request.status === 'approved' && (
          <div className="flex gap-2 mt-4">
            <a href={`/tenant-profile/${request.tenantId}`}>
              <Button size="sm" variant="outline">
                <Eye size={14} /> View Profile
              </Button>
            </a>
          </div>
        )}

        {!isTenant && (request.status === 'denied' || request.status === 'revoked') && (
          <div className="mt-3">
            <p className="text-xs text-muted dark:text-gray-500 flex items-center gap-1">
              <RotateCcw size={11} /> You can submit a new request from the property page.
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
