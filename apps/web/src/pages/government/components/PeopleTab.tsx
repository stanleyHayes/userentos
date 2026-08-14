import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Users, UserCheck, ShieldCheck, FileText } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { COLORS, num, tooltipStyle } from './analytics-constants'
import { EmptyState } from './PanelEmptyState'
import { KPICard } from './KPICard'
import { PieCard } from './PieCard'
import { QuickRow } from './QuickRow'
import { StatusBreakdownCard } from './StatusBreakdownCard'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
export function PeopleTab({ users, tp, credit, apps, rev: _rev }: any) {
  const creditBrackets = credit.brackets ?? {}
  const creditData = Object.entries(creditBrackets).map(([name, value]) => ({ name, value: value as number }))

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={<Users size={18} />} label="Total Users" value={num(users.total)} detail={`${num(users.verified)} verified`} gradient="from-blue-500 to-indigo-600" />
        <KPICard icon={<UserCheck size={18} />} label="Tenant Profiles" value={num(tp.total)} detail={`${num(tp.complete)} complete`} gradient="from-emerald-500 to-teal-600" />
        <KPICard icon={<ShieldCheck size={18} />} label="Avg Credit Score" value={String(credit.avgScore ?? 0)} detail={`${num(credit.total)} scored tenants`} gradient="from-violet-500 to-purple-600" />
        <KPICard icon={<FileText size={18} />} label="Applications" value={num(apps.total)} detail={`${apps.approvalRate ?? 0}% approval rate`} gradient="from-amber-500 to-orange-600" />
      </div>

      {/* Roles + Verification */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PieCard title="Users by Role" data={users.byRole ?? {}} />

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><UserCheck size={16} className="text-emerald-500" />User Verification</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Verified</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-primary-dark dark:text-white">{num(users.verified)}</span>
                  <Badge variant="success" className="text-[10px]">{users.total > 0 ? Math.round((users.verified / users.total) * 100) : 0}%</Badge>
                </div>
              </div>
              <div className="h-3 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${users.total > 0 ? (users.verified / users.total) * 100 : 0}%` }} />
              </div>
              <QuickRow label="Unverified" value={num(users.unverified)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck size={16} className="text-violet-500" />Tenant Verification</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Profiles" value={num(tp.total)} />
              <QuickRow label="Complete Profiles" value={num(tp.complete)} />
              <QuickRow label="Avg Completion" value={`${tp.avgCompletionScore ?? 0}%`} />
              <QuickRow label="ID Verified" value={num(tp.idVerified)} />
              <QuickRow label="Income Verified" value={num(tp.incomeVerified)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Credit Scores + Applications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck size={16} className="text-violet-500" />Credit Score Distribution</CardTitle></CardHeader>
          <CardContent>
            {creditData.length > 0 && creditData.some((d) => d.value > 0) ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="w-48 h-48 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie data={creditData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3} strokeWidth={0}>
                        {creditData.map((_, i) => <Cell key={i} fill={['#10b981', '#3b82f6', '#f59e0b', '#ef4444'][i] ?? COLORS[i]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 flex-1 w-full">
                  {creditData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'][i] }} />
                        <span className="text-xs text-primary-dark dark:text-gray-300 capitalize">{d.name} ({d.name === 'excellent' ? '80-100' : d.name === 'good' ? '60-79' : d.name === 'fair' ? '40-59' : '0-39'})</span>
                      </div>
                      <span className="text-xs font-bold text-primary-dark dark:text-white">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <EmptyState text="No credit scores recorded" />}
          </CardContent>
        </Card>

        <StatusBreakdownCard title="Application Status" icon={<FileText size={16} />} data={apps.byStatus ?? {}} total={apps.total ?? 0} />
      </div>
    </div>
  )
}
