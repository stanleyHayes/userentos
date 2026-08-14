import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Clock } from 'lucide-react'
import { STATUS_COLORS } from './analytics-constants'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
export function DisputesPipelineCard({ disputes }: { disputes: any }) {
  const statusData = Object.entries(disputes.byStatus ?? {}).map(([status, count]) => ({
    status: status.replace(/_/g, ' '), count: count as number, fill: STATUS_COLORS[status] ?? '#6b7280',
  }))
  const maxCount = Math.max(...statusData.map((x) => x.count), 1)

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Clock size={16} className="text-blue-400" />Dispute Resolution Pipeline</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {statusData.map((d) => (
            <div key={d.status}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-primary-dark dark:text-gray-300 capitalize">{d.status}</span>
                <span className="font-bold" style={{ color: d.fill }}>{d.count}</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.round((d.count / maxCount) * 100)}%`, backgroundColor: d.fill }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-border dark:border-gray-700">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Resolution Rate</span>
            <span className={`font-bold ${(disputes.resolutionRate ?? 0) >= 70 ? 'text-green-500' : (disputes.resolutionRate ?? 0) >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
              {disputes.resolutionRate ?? 0}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
