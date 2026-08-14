import { Badge } from '@/components/ui/Badge'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { accentFromColorClass } from '@/lib/utils'

export function KPICard({ icon, label, value, detail, gradient, alert }: {
  icon: React.ReactNode; label: string; value: string; detail: string; gradient: string; alert?: boolean
}) {
  const card = (
    <DashboardMetricCard
      label={label}
      value={value}
      sub={detail}
      icon={icon}
      accent={accentFromColorClass(gradient)}
    />
  )

  if (!alert) return card

  return (
    <div className="relative h-full">
      {card}
      <Badge variant="danger" className="absolute right-3 top-3 z-10 animate-pulse text-[10px]">Alert</Badge>
    </div>
  )
}
