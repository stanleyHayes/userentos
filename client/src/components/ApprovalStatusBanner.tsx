import { Clock3, XCircle } from 'lucide-react'

interface ApprovalStatusBannerProps {
  status?: 'pending' | 'approved' | 'rejected'
  rejectionReason?: string
  /** What is being approved, e.g. "worker profile" — used in the copy. */
  entityLabel: string
}

/** Read-only notice shown to entity users while their profile awaits (or failed) admin approval. */
export function ApprovalStatusBanner({ status, rejectionReason, entityLabel }: ApprovalStatusBannerProps) {
  if (!status || status === 'approved') return null

  if (status === 'rejected') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/70 p-4 dark:border-red-400/20 dark:bg-red-400/10">
        <XCircle size={18} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-red-900 dark:text-red-200">Your {entityLabel} was not approved</p>
          <p className="mt-1 text-xs leading-relaxed text-red-800/80 dark:text-red-200/70">
            {rejectionReason ? `Reason: ${rejectionReason}` : 'No reason was provided.'} Update your details and contact support if you believe this was a mistake.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
      <Clock3 size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0">
        <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Your {entityLabel} is pending approval</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-800/75 dark:text-amber-200/70">
          An administrator is reviewing your submission. Some features stay locked until your {entityLabel} is approved.
        </p>
      </div>
    </div>
  )
}
