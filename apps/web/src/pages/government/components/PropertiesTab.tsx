import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Home, Eye, Building2, DollarSign, MapPin } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { COLORS, num } from './analytics-constants'
import { EmptyState } from './PanelEmptyState'
import { StatusBreakdownCard } from './StatusBreakdownCard'
import { PieCard } from './PieCard'
import { QuickRow } from './QuickRow'
import { ProgressRow } from './ProgressRow'
import { RegionBarCard } from './RegionBarCard'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
export function PropertiesTab({ props }: any) {
  const rentByType = props.avgRentByType ?? {}
  const rentTypeData = Object.entries(rentByType).map(([type, avg]) => ({ type, avg: avg as number }))

  return (
    <div className="space-y-6">
      {/* Status + Listing Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StatusBreakdownCard title="Property Status" icon={<Home size={16} />} data={props.byStatus ?? {}} total={props.total ?? 0} />
        <StatusBreakdownCard title="Listing Status" icon={<Eye size={16} />} data={props.byListingStatus ?? {}} total={props.total ?? 0} />
      </div>

      {/* Type + Stay Type + Furnished */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PieCard title="By Property Type" data={props.byType ?? {}} />
        <PieCard title="By Stay Type" data={props.byStayType ?? {}} />
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 size={16} className="text-blue-400" />Quick Stats</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Properties" value={num(props.total)} />
              <QuickRow label="Furnished" value={num(props.furnished)} />
              <QuickRow label="Unfurnished" value={num(props.unfurnished)} />
              <QuickRow label="Average Rent" value={formatCurrency(props.avgRent ?? 0)} />
              <QuickRow label="Total Views" value={num(props.engagement?.views)} />
              <QuickRow label="Total Inquiries" value={num(props.engagement?.inquiries)} />
              <QuickRow label="Total Favorites" value={num(props.engagement?.favorites)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rent by Type + Top Cities + Regions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign size={16} className="text-amber-500" />Average Rent by Type</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rentTypeData.map((d, i) => <ProgressRow key={d.type} label={d.type} value={formatCurrency(d.avg)} percent={(d.avg / Math.max(...rentTypeData.map((r) => r.avg), 1)) * 100} color={COLORS[i % COLORS.length]} />)}
              {rentTypeData.length === 0 && <EmptyState text="No data" />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><MapPin size={16} className="text-emerald-500" />Top Cities</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic analytics data from API */}
              {(props.topCities ?? []).map((c: any, i: number) => (
                <ProgressRow key={c.city} label={c.city} value={String(c.count)} percent={(c.count / Math.max((props.topCities?.[0]?.count ?? 1), 1)) * 100} color={COLORS[i % COLORS.length]} />
              ))}
              {(props.topCities ?? []).length === 0 && <EmptyState text="No data" />}
            </div>
          </CardContent>
        </Card>
      </div>

      <RegionBarCard regions={props.regions ?? {}} />
    </div>
  )
}
