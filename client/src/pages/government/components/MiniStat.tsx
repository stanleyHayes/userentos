import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { accentFromColorClass } from '@/lib/utils'

export function MiniStat({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string
}) {
  return (
    <DashboardMetricCard
      label={label}
      value={value}
      sub={sub}
      icon={icon}
      accent={accentFromColorClass(color)}
    />
  )
}
