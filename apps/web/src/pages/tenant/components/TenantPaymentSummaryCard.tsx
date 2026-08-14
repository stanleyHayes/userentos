import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { formatCurrency } from '@/lib/utils'

interface TenantPaymentSummaryCardProps {
  analytics: Record<string, number> | undefined
}

export function TenantPaymentSummaryCard({ analytics: a }: TenantPaymentSummaryCardProps) {
  /* Payment Summary */
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Payment Summary</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted dark:text-gray-400">Total Paid (all time)</span>
            <span className="text-xs font-bold text-accent">{formatCurrency(Number(a?.totalPaid ?? 0))}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted dark:text-gray-400">Payments Made</span>
            <span className="text-xs font-bold text-primary-dark dark:text-white">{a?.paymentCount ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted dark:text-gray-400">Pending</span>
            <span className="text-xs font-bold text-secondary">{formatCurrency(Number(a?.pendingAmount ?? 0))}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted dark:text-gray-400">Overdue</span>
            <span className="text-xs font-bold text-danger">{formatCurrency(Number(a?.overdueAmount ?? 0))}</span>
          </div>
          <div className="border-t border-border/30 dark:border-[#252a3a]/30 pt-2 flex items-center justify-between">
            <span className="text-xs text-muted dark:text-gray-400">Wallet Balance</span>
            <span className="text-xs font-bold text-violet-500">{formatCurrency(Number(a?.walletBalance ?? 0))}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
