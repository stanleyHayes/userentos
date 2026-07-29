import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/layout/PageHeader'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { DashboardSkeleton } from '@/components/ui/Skeleton'
import { useHousingDemand } from '@/hooks/useHousing'
import { formatCurrency } from '@/lib/utils'
import { Building2, Home, FileText, Briefcase, TrendingUp } from 'lucide-react'

function vacancyVariant(rate: number): 'success' | 'warning' | 'danger' {
  if (rate < 20) return 'success'
  if (rate <= 50) return 'warning'
  return 'danger'
}

export function HousingDemandPage() {
  const { data, isLoading } = useHousingDemand()

  if (isLoading) return <DashboardSkeleton />

  const regions = data?.regions ?? []
  const trend = (data?.rentTrend ?? []).slice(-6)
  const summary = data?.summary
  const maxAvgRent = Math.max(...regions.map((r) => r.avgRent), 1)
  const maxNewListings = Math.max(...trend.map((m) => m.newListings), 1)

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Home}
        title="Housing Demand"
        description="Rental prices and vacancy across regions"
      />

      {/* Summary stat cards */}
      <div className="stagger-3d grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <DashboardMetricCard
          label="Total Listings"
          value={String(summary?.totalListings ?? 0)}
          sub={`${regions.length} regions`}
          icon={<Building2 size={20} />}
          accent="#3b82f6"
        />
        <DashboardMetricCard
          label="Overall Vacancy"
          value={`${summary?.overallVacancyRate ?? 0}%`}
          sub="of listings available"
          icon={<Home size={20} />}
          accent="#f59e0b"
        />
        <DashboardMetricCard
          label="Active Agreements"
          value={String(summary?.activeAgreements ?? 0)}
          sub="occupied units"
          icon={<FileText size={20} />}
          accent="#10b981"
        />
        <DashboardMetricCard
          label="Applications / Listing"
          value={String(summary?.applicationsPerListing ?? 0)}
          sub={`${summary?.totalApplications ?? 0} total applications`}
          icon={<Briefcase size={20} />}
          accent="#8b5cf6"
        />
      </div>

      {/* Regions */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 size={16} className="text-blue-500" />Demand by Region</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {regions.length === 0 ? (
            <div className="p-6"><EmptyState preset="general" title="No regional data" description="Regional housing data will appear here once properties are listed." compact /></div>
          ) : (
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-muted dark:text-gray-500 border-b border-border/40 dark:border-[#252a3a]/40">
                  <th className="py-3 px-4 font-semibold">Region</th>
                  <th className="py-3 px-4 font-semibold text-right">Listings</th>
                  <th className="py-3 px-4 font-semibold w-1/3">Avg. Rent</th>
                  <th className="py-3 px-4 font-semibold">Rent Range</th>
                  <th className="py-3 px-4 font-semibold">Vacancy</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <tr key={r.region} className="border-b border-border/20 dark:border-[#252a3a]/20">
                    <td className="py-3 px-4 font-bold text-primary-dark dark:text-white">{r.region}</td>
                    <td className="py-3 px-4 text-right font-semibold text-primary-dark dark:text-white">{r.listings}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden min-w-16">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light"
                            style={{ width: `${(r.avgRent / maxAvgRent) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-primary-dark dark:text-white whitespace-nowrap">{formatCurrency(r.avgRent)}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted dark:text-gray-400 whitespace-nowrap">
                      {formatCurrency(r.minRent)} – {formatCurrency(r.maxRent)}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={vacancyVariant(r.vacancyRate)} className="text-[10px]">{r.vacancyRate}%</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Rent trend — last 6 months */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp size={16} className="text-emerald-500" />New Listings Trend (last 6 months)</CardTitle></CardHeader>
        <CardContent>
          {trend.length === 0 ? (
            <EmptyState preset="general" title="No trend data" description="New listings will appear here over time." compact />
          ) : (
            <div className="flex items-end gap-2 sm:gap-4 h-44">
              {trend.map((m) => (
                <div key={m.month} className="flex-1 min-w-0 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-[10px] font-bold text-primary-dark dark:text-white">{m.newListings}</span>
                  <div
                    className="w-full max-w-12 rounded-t-md bg-gradient-to-t from-primary to-primary-light transition-all duration-500"
                    style={{ height: `${Math.max((m.newListings / maxNewListings) * 100, 4)}%` }}
                    title={`${m.month}: ${m.newListings} new listings, avg rent ${formatCurrency(m.avgRent)}`}
                  />
                  <span className="text-[10px] text-muted dark:text-gray-500">{m.month.slice(5)}</span>
                  <span className="text-[9px] text-muted dark:text-gray-500 hidden sm:block">{formatCurrency(m.avgRent)} avg</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
