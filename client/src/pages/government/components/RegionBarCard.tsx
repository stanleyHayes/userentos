import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { MapPin } from 'lucide-react'
import { ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { tooltipStyle } from './analytics-constants'
import { EmptyState } from './PanelEmptyState'

export function RegionBarCard({ regions }: { regions: Record<string, number> }) {
  const regionData = Object.entries(regions)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, properties: count }))

  return (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle className="flex items-center gap-2"><MapPin size={16} className="text-emerald-500" />Regional Distribution</CardTitle></CardHeader>
      <CardContent>
        {regionData.length > 0 ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={regionData} layout="vertical">
                <defs>
                  <linearGradient id="regionGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#252a3a" strokeOpacity={0.3} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={100} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="properties" fill="url(#regionGrad)" radius={[0, 6, 6, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <EmptyState text="No regional data" />}
      </CardContent>
    </Card>
  )
}
