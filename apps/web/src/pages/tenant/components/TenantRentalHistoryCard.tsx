import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

interface TenantRentalHistoryCardProps {
  analytics: Record<string, number> | undefined
}

export function TenantRentalHistoryCard({ analytics: a }: TenantRentalHistoryCardProps) {
  /* Rental History */
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Rental History</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2.5 text-center">
              <p className="text-lg font-extrabold font-display text-primary dark:text-blue-400">{a?.totalAgreements ?? 0}</p>
              <p className="text-[10px] text-muted dark:text-gray-500">Total Leases</p>
            </div>
            <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2.5 text-center">
              <p className="text-lg font-extrabold font-display text-accent">{a?.activeAgreements ?? 0}</p>
              <p className="text-[10px] text-muted dark:text-gray-500">Active</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted dark:text-gray-400">Savings Plans</span>
            <span className="text-xs font-bold text-primary-dark dark:text-white">{a?.activePlans ?? 0} active</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted dark:text-gray-400">Savings Progress</span>
            <span className="text-xs font-bold text-accent">{a?.savingsProgress ?? 0}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted dark:text-gray-400">Open Disputes</span>
            <span className="text-xs font-bold text-danger">{a?.openDisputes ?? 0}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
