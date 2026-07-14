import { Link } from 'react-router-dom'
import { formatCurrency } from '@/lib/utils'
import { AlertTriangle, Clock, ShieldAlert } from 'lucide-react'

interface TenantAlertBannersProps {
  analytics: Record<string, number> | undefined
  openDisputesCount: number
}

export function TenantAlertBanners({ analytics: a, openDisputesCount }: TenantAlertBannersProps) {
  /* === Alert banners === */
  if (!(Number(a?.overduePayments ?? 0) > 0 || Number(a?.pendingPayments ?? 0) > 0 || openDisputesCount > 0)) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2">
      {Number(a?.overduePayments ?? 0) > 0 && (
        <Link to="/payments" className="flex items-center gap-2 rounded-lg bg-danger/8 dark:bg-danger/12 border border-danger/20 px-3 py-2 hover:bg-danger/12 transition-colors">
          <ShieldAlert size={14} className="text-danger flex-shrink-0" />
          <span className="text-xs font-semibold text-danger">{a?.overduePayments} overdue payment{Number(a?.overduePayments) > 1 ? 's' : ''}</span>
          <span className="text-xs text-danger/70">({formatCurrency(Number(a?.overdueAmount ?? 0))})</span>
        </Link>
      )}
      {Number(a?.pendingPayments ?? 0) > 0 && (
        <Link to="/payments" className="flex items-center gap-2 rounded-lg bg-secondary/8 dark:bg-secondary/12 border border-secondary/20 px-3 py-2 hover:bg-secondary/12 transition-colors">
          <Clock size={14} className="text-secondary flex-shrink-0" />
          <span className="text-xs font-semibold text-secondary">{a?.pendingPayments} pending payment{Number(a?.pendingPayments) > 1 ? 's' : ''}</span>
          <span className="text-xs text-secondary/70">({formatCurrency(Number(a?.pendingAmount ?? 0))})</span>
        </Link>
      )}
      {openDisputesCount > 0 && (
        <Link to="/disputes" className="flex items-center gap-2 rounded-lg bg-warning/8 dark:bg-warning/12 border border-warning/20 px-3 py-2 hover:bg-warning/12 transition-colors">
          <AlertTriangle size={14} className="text-warning flex-shrink-0" />
          <span className="text-xs font-semibold text-warning">{openDisputesCount} open dispute{openDisputesCount > 1 ? 's' : ''}</span>
        </Link>
      )}
    </div>
  )
}
