import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { accentFromColorClass } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string
  icon: React.ReactNode
  color: string
  bg: string
}

export function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <DashboardMetricCard
      label={label}
      value={value}
      icon={icon}
      accent={accentFromColorClass(color)}
    />
  )
}
