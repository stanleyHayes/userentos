import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { STATUS_COLORS } from './analytics-constants'
import { EmptyState } from './PanelEmptyState'

export function StatusBreakdownCard({ title, icon, data, total }: { title: string; icon: React.ReactNode; data: Record<string, number>; total: number }) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a)
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {entries.map(([status, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <div key={status}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-primary-dark dark:text-gray-300 capitalize">{status.replace(/_/g, ' ')}</span>
                  <span className="font-bold" style={{ color: STATUS_COLORS[status] ?? '#94a3b8' }}>{count} <span className="text-muted font-normal">({pct}%)</span></span>
                </div>
                <div className="h-2.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[status] ?? '#94a3b8' }} />
                </div>
              </div>
            )
          })}
          {entries.length === 0 && <EmptyState text="No data" />}
        </div>
      </CardContent>
    </Card>
  )
}
