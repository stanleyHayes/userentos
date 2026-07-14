import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Users, Building2, TrendingUp, AlertTriangle, BarChart3, ClipboardList, FileText, Star, Landmark, HandCoins, PiggyBank } from 'lucide-react'
import { ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, AreaChart, Area } from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { num, tooltipStyle } from './analytics-constants'
import { EmptyState } from './PanelEmptyState'
import { KPICard } from './KPICard'
import { MiniStat } from './MiniStat'
import { GaugeCard } from './GaugeCard'
import { DisputesPieCard } from './DisputesPieCard'
import { RegionBarCard } from './RegionBarCard'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
export function OverviewTab({ users, props, agr, pay, dis, sav, apps, rev, lo, inv }: any) {
  const occupancyRate = props.total > 0 ? Math.round(((props.byStatus?.occupied ?? 0) / props.total) * 100) : 0
  const disputeResRate = dis.resolutionRate ?? 0

  const monthlyVolume = pay.monthlyVolume ?? {}
  const volumeData = Object.entries(monthlyVolume)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, amount]) => ({
      month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short' }),
      amount: amount as number,
    }))

  const complianceViolations = agr.compliance?.violations ?? 0
  const complianceWarnings = agr.compliance?.warnings ?? 0
  const complianceScore = complianceViolations + complianceWarnings > 0
    ? Math.max(100 - (complianceViolations * 10 + complianceWarnings * 3), 0) : 100

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={<Users size={18} />} label="Total Users" value={num(users.total)} detail={`${num(users.verified)} verified · ${num(users.unverified)} unverified`} gradient="from-blue-500 to-indigo-600" />
        <KPICard icon={<Building2 size={18} />} label="Properties" value={num(props.total)} detail={`${num(props.byStatus?.occupied)} occupied · ${num(props.byStatus?.available)} available`} gradient="from-emerald-500 to-teal-600" />
        <KPICard icon={<TrendingUp size={18} />} label="Payment Volume" value={formatCurrency(pay.completedVolume ?? 0)} detail={`${num(pay.total)} total transactions`} gradient="from-amber-500 to-orange-600" />
        <KPICard icon={<AlertTriangle size={18} />} label="Open Disputes" value={num(dis.open)} detail={`${disputeResRate}% resolution rate`} gradient="from-red-500 to-rose-600" alert={(dis.open ?? 0) > 5} />
      </div>

      {/* Row 2: Volume chart + Gauges */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 size={16} className="text-primary dark:text-blue-400" />
              Monthly Payment Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            {volumeData.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={volumeData}>
                    <defs>
                      <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#252a3a" strokeOpacity={0.3} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCurrency(Number(value)), 'Volume']} />
                    <Area type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2.5} fill="url(#volumeFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState text="No payment data" />}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4">
          <GaugeCard label="Occupancy Rate" value={occupancyRate} detail={`${num(props.byStatus?.occupied)}/${num(props.total)} properties`} color="#10b981" />
          <GaugeCard
            label="Compliance Score"
            value={complianceScore}
            color={complianceViolations > 0 ? '#ef4444' : '#10b981'}
            detail={
              complianceViolations > 0 ? `${complianceViolations} violations`
              : complianceWarnings > 0 ? `${complianceWarnings} warnings`
              : 'All clear'
            }
          />
        </div>
      </div>

      {/* Row 3: Quick stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniStat icon={<ClipboardList size={14} />} label="Agreements" value={num(agr.total)} sub={`${num(agr.byStatus?.active)} active`} color="text-blue-500" />
        <MiniStat icon={<FileText size={14} />} label="Applications" value={num(apps.total)} sub={`${apps.approvalRate ?? 0}% approved`} color="text-violet-500" />
        <MiniStat icon={<Star size={14} />} label="Reviews" value={num(rev.total)} sub={`${rev.avgRating ?? 0} avg rating`} color="text-amber-500" />
        <MiniStat icon={<Landmark size={14} />} label="Investments" value={num(inv.total)} sub={formatCurrency(inv.totalInvested ?? 0)} color="text-cyan-500" />
        <MiniStat icon={<HandCoins size={14} />} label="Loans" value={num(lo.total)} sub={`${lo.defaultRate ?? 0}% default`} color="text-orange-500" />
        <MiniStat icon={<PiggyBank size={14} />} label="Savings Plans" value={num(sav.totalPlans)} sub={`${num(sav.activeSavers)} savers`} color="text-emerald-500" />
      </div>

      {/* Row 4: Disputes + Regions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DisputesPieCard disputes={dis} />
        <RegionBarCard regions={props.regions ?? {}} />
      </div>
    </div>
  )
}
