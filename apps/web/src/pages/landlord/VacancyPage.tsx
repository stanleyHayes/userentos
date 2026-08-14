import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { Building2, Home, Percent, CalendarClock, Banknote, DoorOpen } from 'lucide-react'
import { useVacancy } from '@/hooks/useLandlordOps'
import { cn, formatCurrency } from '@/lib/utils'

export function VacancyPage() {
  const { data, isLoading } = useVacancy()

  const summary = data?.summary

  // Vacant units first so they get attention, then occupied.
  const items = useMemo(
    () =>
      (data?.items ?? []).slice().sort((a, b) => {
        if (a.status !== b.status) return a.status === 'vacant' ? -1 : 1
        return b.daysListed - a.daysListed
      }),
    [data],
  )

  const occupancyRate = summary?.occupancyRate ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight flex items-center gap-2">
            <DoorOpen size={22} className="text-primary dark:text-blue-400" /> Vacancy
          </h1>
          <p className="text-sm text-muted dark:text-gray-500 mt-1">
            Occupancy across your portfolio and how long units sit on the market.
          </p>
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : (
        <>
          {/* Stat cards */}
          <div className="stagger-3d grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            <DashboardMetricCard
              label="Occupancy rate"
              value={`${occupancyRate}%`}
              sub={`${summary?.occupied ?? 0} of ${summary?.total ?? 0} occupied`}
              icon={<Percent size={18} />}
              accent={occupancyRate >= 80 ? '#10b981' : occupancyRate >= 50 ? '#f59e0b' : '#ef4444'}
            />
            <DashboardMetricCard
              label="Vacant units"
              value={String(summary?.vacant ?? 0)}
              sub="Awaiting tenants"
              icon={<Building2 size={18} />}
              accent="#f59e0b"
            />
            <DashboardMetricCard
              label="Avg days vacant"
              value={String(summary?.avgDaysVacant ?? 0)}
              sub="Days on market"
              icon={<CalendarClock size={18} />}
              accent="#3b82f6"
            />
            <DashboardMetricCard
              label="Uncollected rent"
              value={formatCurrency(summary?.vacantRentValue ?? 0)}
              sub="Per month from vacant units"
              icon={<Banknote size={18} />}
              accent="#ef4444"
            />
          </div>

          {/* Property list */}
          {items.length === 0 ? (
            <EmptyState
              preset="properties"
              title="No properties yet"
              description="List your first property to start tracking occupancy and vacancy."
              action={{ label: 'Add your first', href: '/properties/new' }}
            />
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Properties</CardTitle>
                  <Badge variant="muted" className="text-[10px]">{items.length} total</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {items.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 py-2.5 border-b border-border/20 dark:border-[#252a3a]/20 last:border-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            'neumorphic-icon w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                            p.status === 'occupied'
                              ? 'bg-accent/10 dark:bg-accent/15 text-accent'
                              : 'bg-secondary/10 dark:bg-secondary/15 text-secondary',
                          )}
                        >
                          <Home size={13} />
                        </div>
                        <div className="min-w-0">
                          <Link
                            to={`/properties/${p.id}`}
                            className="text-xs font-semibold text-primary-dark dark:text-white truncate block hover:text-primary dark:hover:text-blue-400 transition-colors"
                          >
                            {p.title}
                          </Link>
                          <p className="text-[10px] text-muted dark:text-gray-500 truncate">
                            {p.city ?? '—'}
                            {p.status === 'vacant' && (
                              <> &middot; {p.daysListed} day{p.daysListed === 1 ? '' : 's'} listed</>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-bold text-primary-dark dark:text-white">
                          {formatCurrency(p.rentAmount)}/mo
                        </span>
                        <Badge
                          variant={p.status === 'occupied' ? 'success' : 'warning'}
                          className="text-[9px] capitalize"
                        >
                          {p.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
