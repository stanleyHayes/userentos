import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { usePlatformAnalytics } from '@/hooks/useApi'
import { formatCurrency } from '@/lib/utils'
import { DashboardSkeleton } from '@/components/ui/Skeleton'
import { Link } from 'react-router-dom'
import {
  Shield, Building2, Users, AlertTriangle, TrendingUp, Scale,
  MapPin, PiggyBank, Clock,
  Gavel, BarChart3, Eye, Star, CreditCard,
  FileText, Bell, MessageSquare, Heart, Mail, HardDrive, Activity,
  UserCheck, Home, DollarSign, Landmark, HandCoins, ClipboardList,
  ShieldCheck
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, RadialBarChart, RadialBar
} from 'recharts'
import { DoodleStars } from '@/components/ui/Doodles'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6']
const STATUS_COLORS: Record<string, string> = {
  filed: '#f59e0b', under_mediation: '#3b82f6', escalated: '#ef4444', resolved: '#10b981', closed: '#6b7280',
  pending: '#f59e0b', processing: '#3b82f6', completed: '#10b981', failed: '#ef4444', refunded: '#8b5cf6',
  active: '#10b981', approved: '#3b82f6', rejected: '#ef4444', withdrawn: '#6b7280',
  draft: '#94a3b8', pending_signatures: '#f59e0b', expired: '#6b7280', terminated: '#ef4444', disputed: '#f97316',
  available: '#10b981', occupied: '#3b82f6', under_dispute: '#ef4444', maintenance_required: '#f59e0b',
  pending_review: '#f59e0b', matured: '#10b981', repaid: '#10b981', defaulted: '#ef4444',
  paused: '#94a3b8', cancelled: '#6b7280', accepted: '#10b981', revoked: '#ef4444',
}

type TabKey = 'overview' | 'properties' | 'financial' | 'people' | 'engagement' | 'system'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <BarChart3 size={14} /> },
  { key: 'properties', label: 'Properties', icon: <Building2 size={14} /> },
  { key: 'financial', label: 'Financial', icon: <DollarSign size={14} /> },
  { key: 'people', label: 'People', icon: <Users size={14} /> },
  { key: 'engagement', label: 'Engagement', icon: <Activity size={14} /> },
  { key: 'system', label: 'System', icon: <HardDrive size={14} /> },
]

export function GovernmentPanel() {
  const { data: raw, isLoading } = usePlatformAnalytics()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  if (isLoading) return <DashboardSkeleton />

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = (raw ?? {}) as Record<string, any>
  const users = a.users ?? {}
  const props = a.properties ?? {}
  const agr = a.agreements ?? {}
  const pay = a.payments ?? {}
  const dis = a.disputes ?? {}
  const apps = a.applications ?? {}
  const rev = a.reviews ?? {}
  const credit = a.creditScores ?? {}
  const inv = a.investments ?? {}
  const lo = a.loans ?? {}
  const tp = a.tenantProfiles ?? {}
  const wal = a.wallets ?? {}
  const sav = a.savings ?? {}
  const notif = a.notifications ?? {}
  const msg = a.messaging ?? {}
  const fav = a.favorites ?? {}
  const invit = a.invitations ?? {}
  const docs = a.documents ?? {}
  const audit = a.auditLogs ?? {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white">
            <Shield size={20} />
          </div>
          <div className="relative">
            <DoodleStars className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
            <h1 className="text-xl sm:text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
              Platform Analytics
            </h1>
            <p className="text-xs text-muted dark:text-gray-400">Complete database snapshot across all {Object.keys(a).length} collections</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/government/reviews">
            <Button size="sm" variant="outline"><Eye size={14} /> <span className="hidden sm:inline">Reviews</span></Button>
          </Link>
          <Link to="/government/simulation">
            <Button size="sm" variant="outline"><Scale size={14} /> <span className="hidden sm:inline">Simulate</span></Button>
          </Link>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeTab === tab.key
                ? 'bg-primary text-white shadow-md'
                : 'bg-surface dark:bg-[#161927] text-muted hover:text-primary-dark dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#252a3a]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          users={users} props={props} agr={agr} pay={pay} dis={dis}
          sav={sav} apps={apps} rev={rev} lo={lo} inv={inv}
        />
      )}
      {activeTab === 'properties' && <PropertiesTab props={props} />}
      {activeTab === 'financial' && <FinancialTab pay={pay} inv={inv} lo={lo} wal={wal} sav={sav} />}
      {activeTab === 'people' && <PeopleTab users={users} tp={tp} credit={credit} apps={apps} rev={rev} />}
      {activeTab === 'engagement' && <EngagementTab dis={dis} rev={rev} notif={notif} msg={msg} fav={fav} invit={invit} props={props} />}
      {activeTab === 'system' && <SystemTab docs={docs} audit={audit} agr={agr} notif={notif} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   OVERVIEW TAB
   ═══════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
function OverviewTab({ users, props, agr, pay, dis, sav, apps, rev, lo, inv }: any) {
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

/* ═══════════════════════════════════════════════════════════════
   PROPERTIES TAB
   ═══════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
function PropertiesTab({ props }: any) {
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

/* ═══════════════════════════════════════════════════════════════
   FINANCIAL TAB
   ═══════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
function FinancialTab({ pay, inv, lo, wal, sav }: any) {
  const monthlyVolume = pay.monthlyVolume ?? {}
  const volumeData = Object.entries(monthlyVolume)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, amount]) => ({
      month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      amount: amount as number,
    }))

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={<CreditCard size={18} />} label="Total Payments" value={num(pay.total)} detail={`Avg: ${formatCurrency(pay.avgPaymentAmount ?? 0)}`} gradient="from-blue-500 to-indigo-600" />
        <KPICard icon={<DollarSign size={18} />} label="Completed Volume" value={formatCurrency(pay.completedVolume ?? 0)} detail={`${num(pay.byStatus?.completed)} completed`} gradient="from-emerald-500 to-teal-600" />
        <KPICard icon={<Landmark size={18} />} label="Total Invested" value={formatCurrency(inv.totalInvested ?? 0)} detail={`${num(inv.total)} investments`} gradient="from-cyan-500 to-blue-600" />
        <KPICard icon={<HandCoins size={18} />} label="Loans Disbursed" value={formatCurrency(lo.totalDisbursed ?? 0)} detail={`${formatCurrency(lo.totalOutstanding ?? 0)} outstanding`} gradient="from-orange-500 to-red-600" />
      </div>

      {/* Volume Chart (12 months) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 size={16} className="text-primary dark:text-blue-400" />Monthly Payment Volume (12 months)</CardTitle></CardHeader>
        <CardContent>
          {volumeData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={volumeData}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252a3a" strokeOpacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCurrency(Number(value)), 'Volume']} />
                  <Bar dataKey="amount" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState text="No payment data" />}
        </CardContent>
      </Card>

      {/* Payment breakdown + Methods + Investments + Loans */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StatusBreakdownCard title="Payment Status" icon={<CreditCard size={16} />} data={pay.byStatus ?? {}} total={pay.total ?? 0} />
        <PieCard title="Payment Methods" data={pay.byMethod ?? {}} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Landmark size={16} className="text-cyan-500" />Investments</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Investments" value={num(inv.total)} />
              <QuickRow label="Total Invested" value={formatCurrency(inv.totalInvested ?? 0)} />
              <QuickRow label="Expected Returns" value={formatCurrency(inv.totalExpectedReturn ?? 0)} />
              <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">By Status</p>
                {Object.entries(inv.byStatus ?? {}).map(([s, c]) => <QuickRow key={s} label={s} value={num(c as number)} />)}
              </div>
              <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">By Type</p>
                {Object.entries(inv.byType ?? {}).map(([s, c]) => <QuickRow key={s} label={s.replace(/_/g, ' ')} value={num(c as number)} />)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><HandCoins size={16} className="text-orange-500" />Loans</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Loans" value={num(lo.total)} />
              <QuickRow label="Total Disbursed" value={formatCurrency(lo.totalDisbursed ?? 0)} />
              <QuickRow label="Total Repaid" value={formatCurrency(lo.totalRepaid ?? 0)} />
              <QuickRow label="Outstanding" value={formatCurrency(lo.totalOutstanding ?? 0)} />
              <QuickRow label="Default Rate" value={`${lo.defaultRate ?? 0}%`} alert={(lo.defaultRate ?? 0) > 10} />
              <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">By Status</p>
                {Object.entries(lo.byStatus ?? {}).map(([s, c]) => <QuickRow key={s} label={s} value={num(c as number)} />)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Wallets + Savings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard size={16} className="text-violet-500" />Wallets</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Wallets" value={num(wal.total)} />
              <QuickRow label="Combined Balance" value={formatCurrency(wal.totalBalance ?? 0)} />
              <QuickRow label="Total Transactions" value={num(wal.totalTransactions)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><PiggyBank size={16} className="text-emerald-500" />RentGuard Savings</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Plans" value={num(sav.totalPlans)} />
              <QuickRow label="Active Savers" value={num(sav.activeSavers)} />
              <QuickRow label="Total Saved" value={formatCurrency(sav.totalSaved ?? 0)} />
              <QuickRow label="Total Targeted" value={formatCurrency(sav.totalTargeted ?? 0)} />
              <QuickRow label="Completion Rate" value={`${sav.completionRate ?? 0}%`} />
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted">Savings Progress</span>
                  <span className="font-bold text-emerald-500">{sav.savingsProgress ?? 0}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all" style={{ width: `${Math.min(sav.savingsProgress ?? 0, 100)}%` }} />
                </div>
              </div>
              <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">By Status</p>
                {Object.entries(sav.byStatus ?? {}).map(([s, c]) => <QuickRow key={s} label={s} value={num(c as number)} />)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PEOPLE TAB
   ═══════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
function PeopleTab({ users, tp, credit, apps, rev: _rev }: any) {
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

/* ═══════════════════════════════════════════════════════════════
   ENGAGEMENT TAB
   ═══════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
function EngagementTab({ dis, rev, notif, msg, fav, invit, props }: any) {
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={<Gavel size={18} />} label="Total Disputes" value={num(dis.total)} detail={`${num(dis.open)} open`} gradient="from-red-500 to-rose-600" />
        <KPICard icon={<Star size={18} />} label="Reviews" value={num(rev.total)} detail={`${rev.avgRating ?? 0}/5 avg · ${rev.wouldRecommendPercent ?? 0}% recommend`} gradient="from-amber-500 to-yellow-600" />
        <KPICard icon={<Bell size={18} />} label="Notifications" value={num(notif.total)} detail={`${num(notif.unread)} unread`} gradient="from-violet-500 to-purple-600" />
        <KPICard icon={<MessageSquare size={18} />} label="Messages" value={num(msg.totalMessages)} detail={`${num(msg.conversations)} conversations`} gradient="from-cyan-500 to-blue-600" />
      </div>

      {/* Disputes deep dive */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DisputesPieCard disputes={dis} />
        <DisputesPipelineCard disputes={dis} />
      </div>

      {/* Reviews + Notifications + Favorites + Invitations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Star size={16} className="text-amber-500" />Review Insights</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Reviews" value={num(rev.total)} />
              <QuickRow label="Verified Reviews" value={num(rev.verified)} />
              <QuickRow label="Average Rating" value={`${rev.avgRating ?? 0}/5`} />
              <QuickRow label="Would Recommend" value={`${rev.wouldRecommendPercent ?? 0}%`} />
              <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Sub-Ratings (avg)</p>
                {Object.entries(rev.avgSubRatings ?? {}).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between py-1">
                    <span className="text-xs text-muted capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-primary-dark dark:text-white">{String(val)}</span>
                      <Star size={10} className="text-amber-400 fill-amber-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Bell size={16} className="text-violet-500" />Notifications</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                <QuickRow label="Total Sent" value={num(notif.total)} />
                <QuickRow label="Unread" value={num(notif.unread)} />
                <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-2">By Channel</p>
                  {Object.entries(notif.byChannel ?? {}).map(([ch, c]) => <QuickRow key={ch} label={ch.replace(/_/g, ' ')} value={num(c as number)} />)}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2"><Heart size={14} className="text-red-400" /><span className="text-[10px] text-muted uppercase tracking-wider">Favorites</span></div>
                <p className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">{num(fav.total)}</p>
                <p className="text-[10px] text-accent mt-1">Property saves</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2"><Mail size={14} className="text-blue-400" /><span className="text-[10px] text-muted uppercase tracking-wider">Invitations</span></div>
                <p className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">{num(invit.total)}</p>
                <p className="text-[10px] text-accent mt-1">{num(invit.byStatus?.pending)} pending</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Property engagement */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Eye size={16} className="text-blue-400" />Property Engagement</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="bg-blue-500/10 rounded-xl p-4">
              <Eye size={20} className="text-blue-500 mx-auto mb-2" />
              <p className="text-xl font-extrabold font-display text-primary-dark dark:text-white">{num(props.engagement?.views)}</p>
              <p className="text-[10px] text-muted">Total Views</p>
            </div>
            <div className="bg-emerald-500/10 rounded-xl p-4">
              <MessageSquare size={20} className="text-emerald-500 mx-auto mb-2" />
              <p className="text-xl font-extrabold font-display text-primary-dark dark:text-white">{num(props.engagement?.inquiries)}</p>
              <p className="text-[10px] text-muted">Inquiries</p>
            </div>
            <div className="bg-red-500/10 rounded-xl p-4">
              <Heart size={20} className="text-red-500 mx-auto mb-2" />
              <p className="text-xl font-extrabold font-display text-primary-dark dark:text-white">{num(props.engagement?.favorites)}</p>
              <p className="text-[10px] text-muted">Favorites</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SYSTEM TAB
   ═══════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
function SystemTab({ docs, audit, agr, notif }: any) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={<FileText size={18} />} label="Documents" value={num(docs.total)} detail={formatFileSize(docs.totalFileSize ?? 0)} gradient="from-blue-500 to-indigo-600" />
        <KPICard icon={<Activity size={18} />} label="Audit Logs" value={num(audit.total)} detail="All recorded actions" gradient="from-emerald-500 to-teal-600" />
        <KPICard icon={<ShieldCheck size={18} />} label="Compliance Flags" value={num((agr.compliance?.violations ?? 0) + (agr.compliance?.warnings ?? 0))} detail={`${num(agr.compliance?.violations)} violations · ${num(agr.compliance?.warnings)} warnings`} gradient="from-red-500 to-rose-600" alert={(agr.compliance?.violations ?? 0) > 0} />
        <KPICard icon={<Bell size={18} />} label="Notifications" value={num(notif.total)} detail={`${num(notif.unread)} unread`} gradient="from-violet-500 to-purple-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText size={16} className="text-blue-400" />Documents by Type</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(docs.byType ?? {}).map(([type, count], i) => (
                <ProgressRow key={type} label={type.replace(/_/g, ' ')} value={num(count as number)} percent={((count as number) / Math.max(docs.total ?? 1, 1)) * 100} color={COLORS[i % COLORS.length]} />
              ))}
              {Object.keys(docs.byType ?? {}).length === 0 && <EmptyState text="No documents" />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity size={16} className="text-emerald-500" />Audit by Action</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(audit.byAction ?? {}).sort(([, a], [, b]) => (b as number) - (a as number)).map(([action, count], i) => (
                <ProgressRow key={action} label={action} value={num(count as number)} percent={((count as number) / Math.max(audit.total ?? 1, 1)) * 100} color={COLORS[i % COLORS.length]} />
              ))}
              {Object.keys(audit.byAction ?? {}).length === 0 && <EmptyState text="No audit logs" />}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PieCard title="Audit by Entity Type" data={audit.byEntity ?? {}} />

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList size={16} className="text-amber-500" />Agreement Compliance</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Agreements" value={num(agr.total)} />
              {Object.entries(agr.byStatus ?? {}).map(([s, c]) => <QuickRow key={s} label={s.replace(/_/g, ' ')} value={num(c as number)} />)}
              <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Renewal Status</p>
                {Object.entries(agr.byRenewalStatus ?? {}).map(([s, c]) => <QuickRow key={s} label={s.replace(/_/g, ' ')} value={num(c as number)} />)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

const tooltipStyle = { background: '#161927', border: '1px solid #252a3a', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }

function num(v: unknown): string {
  return Number(v ?? 0).toLocaleString()
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function EmptyState({ text }: { text: string }) {
  return <div className="h-48 flex items-center justify-center text-muted text-sm">{text}</div>
}

function KPICard({ icon, label, value, detail, gradient, alert }: {
  icon: React.ReactNode; label: string; value: string; detail: string; gradient: string; alert?: boolean
}) {
  return (
    <Card className={`group hover:shadow-lg dark:hover:shadow-black/30 hover:-translate-y-0.5 transition-all overflow-hidden ${alert ? 'ring-1 ring-red-500/30' : ''}`}>
      <CardContent>
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white group-hover:scale-110 transition-transform`}>
            {icon}
          </div>
          {alert && <Badge variant="danger" className="animate-pulse text-[10px]">Alert</Badge>}
        </div>
        <p className="text-xl sm:text-2xl font-extrabold font-display text-primary-dark dark:text-white truncate">{value}</p>
        <p className="text-[11px] text-muted dark:text-gray-500 mt-0.5">{label}</p>
        <p className="text-[10px] text-accent font-medium mt-1 truncate">{detail}</p>
      </CardContent>
    </Card>
  )
}

function MiniStat({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="py-3 px-4">
        <div className={`${color} mb-1.5`}>{icon}</div>
        <p className="text-lg font-extrabold font-display text-primary-dark dark:text-white">{value}</p>
        <p className="text-[10px] text-muted">{label}</p>
        <p className="text-[10px] text-accent mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  )
}

function GaugeCard({ label, value, detail, color }: { label: string; value: number; detail: string; color: string }) {
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

function QuickRow({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-muted capitalize">{label.replace(/_/g, ' ')}</span>
      <span className={`text-xs font-bold ${alert ? 'text-red-500' : 'text-primary-dark dark:text-white'}`}>{value}</span>
    </div>
  )
}

function ProgressRow({ label, value, percent, color }: { label: string; value: string; percent: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-primary-dark dark:text-gray-300 capitalize">{label.replace(/_/g, ' ')}</span>
        <span className="font-bold text-primary-dark dark:text-white">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function StatusBreakdownCard({ title, icon, data, total }: { title: string; icon: React.ReactNode; data: Record<string, number>; total: number }) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a)
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {entries.map(([status, count]) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <div key={status}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-primary-dark dark:text-gray-300 capitalize">{status.replace(/_/g, ' ')}</span>
                  <span className="font-bold" style={{ color: STATUS_COLORS[status] ?? '#94a3b8' }}>{count} <span className="text-muted font-normal">({pct}%)</span></span>
                </div>
                <div className="h-2.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[status] ?? '#94a3b8' }} />
                </div>
              </div>
            )
          })}
          {entries.length === 0 && <EmptyState text="No data" />}
        </div>
      </CardContent>
    </Card>
  )
}

function PieCard({ title, data }: { title: string; data: Record<string, number> }) {
  const pieData = Object.entries(data).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {pieData.length > 0 ? (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-44 h-44 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3} strokeWidth={0}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 flex-1 w-full">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-primary-dark dark:text-gray-300 capitalize">{d.name}</span>
                  </div>
                  <span className="text-xs font-bold text-primary-dark dark:text-white">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <EmptyState text="No data" />}
      </CardContent>
    </Card>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
function DisputesPieCard({ disputes }: { disputes: any }) {
  const data = Object.entries(disputes.byCategory ?? {}).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value: value as number }))
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Gavel size={16} className="text-amber-500" />Disputes by Category</CardTitle></CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-48 h-48 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3} strokeWidth={0}>
                    {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 flex-1 w-full">
              {data.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-primary-dark dark:text-gray-300 capitalize">{d.name}</span>
                  </div>
                  <span className="text-xs font-bold text-primary-dark dark:text-white">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : <EmptyState text="No disputes recorded" />}
      </CardContent>
    </Card>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
function DisputesPipelineCard({ disputes }: { disputes: any }) {
  const statusData = Object.entries(disputes.byStatus ?? {}).map(([status, count]) => ({
    status: status.replace(/_/g, ' '), count: count as number, fill: STATUS_COLORS[status] ?? '#6b7280',
  }))
  const maxCount = Math.max(...statusData.map((x) => x.count), 1)

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Clock size={16} className="text-blue-400" />Dispute Resolution Pipeline</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {statusData.map((d) => (
            <div key={d.status}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-primary-dark dark:text-gray-300 capitalize">{d.status}</span>
                <span className="font-bold" style={{ color: d.fill }}>{d.count}</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.round((d.count / maxCount) * 100)}%`, backgroundColor: d.fill }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-border dark:border-gray-700">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Resolution Rate</span>
            <span className={`font-bold ${(disputes.resolutionRate ?? 0) >= 70 ? 'text-green-500' : (disputes.resolutionRate ?? 0) >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
              {disputes.resolutionRate ?? 0}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function RegionBarCard({ regions }: { regions: Record<string, number> }) {
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
