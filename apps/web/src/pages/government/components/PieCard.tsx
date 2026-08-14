import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { COLORS, tooltipStyle } from './analytics-constants'
import { EmptyState } from './PanelEmptyState'

export function PieCard({ title, data }: { title: string; data: Record<string, number> }) {
  const pieData = Object.entries(data).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {pieData.length > 0 ? (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-44 h-44 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3} strokeWidth={0}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 flex-1 w-full">
              {pieData.map((d, i) => (
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
        ) : <EmptyState text="No data" />}
      </CardContent>
    </Card>
  )
}
