import { Card, CardContent } from '@/components/ui/Card'
import { ResponsiveContainer, RadialBarChart, RadialBar } from 'recharts'

export function GaugeCard({ label, value, detail, color }: { label: string; value: number; detail: string; color: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-4">
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="100%" data={[{ name: label, value, fill: color }]} startAngle={90} endAngle={-270}>
                <RadialBar dataKey="value" cornerRadius={10} background={{ fill: 'rgba(148,163,184,0.15)' }} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">{value}%</p>
            <p className="text-xs text-muted dark:text-gray-400">{label}</p>
            <p className="text-[10px] text-accent mt-1">{detail}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
