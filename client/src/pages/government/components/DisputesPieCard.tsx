import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Gavel } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { COLORS, tooltipStyle } from './analytics-constants'
import { EmptyState } from './PanelEmptyState'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
export function DisputesPieCard({ disputes }: { disputes: any }) {
  const data = Object.entries(disputes.byCategory ?? {}).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value: value as number }))
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Gavel size={16} className="text-amber-500" />Disputes by Category</CardTitle></CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-48 h-48 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3} strokeWidth={0}>
                    {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 flex-1 w-full">
              {data.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-primary-dark dark:text-gray-300 capitalize">{d.name}</span>
                  </div>
                  <span className="text-xs font-bold text-primary-dark dark:text-white">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <EmptyState text="No disputes recorded" />}
      </CardContent>
    </Card>
  )
}
