import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DashboardActionItem, DashboardActionPanel, DashboardHero, DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { useAuthStore } from '@/stores/authStore'
import { useMyAnalytics, useProperties, usePayments, useNotifications, useAgreements, useDisputes, useMySubscription, useMaintenanceRequests } from '@/hooks/useApi'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Building2, Users, CreditCard, AlertTriangle, ChevronRight,
  Plus, CheckCircle, Wrench,
  PieChart, Home, Calendar, ArrowRight, DollarSign, Percent, Star, BarChart3, Package, Crown,
} from 'lucide-react'
import { DashboardSkeleton } from '@/components/ui/Skeleton'
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { useThemeStore } from '@/stores/themeStore'
import type { PropertyStatus } from '@/types'

const statusVariant: Record<PropertyStatus, 'success' | 'default' | 'danger' | 'warning'> = {
  available: 'success', occupied: 'default', under_dispute: 'danger', maintenance_required: 'warning',
}

const statusColors: Record<string, string> = {
  occupied: '#3b82f6',
  available: '#10b981',
  maintenance_required: '#f59e0b',
  under_dispute: '#ef4444',
}

export function LandlordDashboard() {
  const user = useAuthStore((s) => s.user)
  const { data: analytics, isLoading } = useMyAnalytics()
  const { data: propertiesData } = useProperties({ mine: true })
  const { data: paymentsData } = usePayments()
  const { data: notifData } = useNotifications()
  const { data: agreementsData } = useAgreements()
  const { data: disputesData } = useDisputes()
  const { data: subscriptionData } = useMySubscription()
  const { data: maintenanceData } = useMaintenanceRequests()
  const isDark = useThemeStore((s) => s.resolvedTheme()) === 'dark'

  const properties = propertiesData?.items ?? []
  const payments = (paymentsData?.items ?? []).filter((p) => p.status === 'completed')
  const recentPayments = payments.slice(-6).reverse()
  const notifications = (notifData?.items ?? []).filter((n) => !n.read).slice(0, 5)
  const agreements = agreementsData?.items ?? []
  const activeAgreements = agreements.filter((a) => a.status === 'active')
  const disputes = disputesData?.items ?? []
  const openDisputes = disputes.filter((d) => d.status !== 'resolved' && d.status !== 'closed')
  const openMaintenance = (maintenanceData?.items ?? []).filter(
    (m) => m.status !== 'completed' && m.status !== 'cancelled'
  )

  if (isLoading) return <DashboardSkeleton />
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = analytics as Record<string, any> | undefined
  const monthlyIncome = (a?.monthlyIncome ?? {}) as Record<string, number>
  const chartData = Object.entries(monthlyIncome).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, amount]) => ({ month, amount }))
  const revenueChange = Number(a?.revenueChange ?? 0)
  const occupancyRate = Number(a?.occupancyRate ?? 0)
  const collectionRate = Number(a?.collectionRate ?? 0)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const propertyTypes = (a?.propertyTypes ?? {}) as Record<string, number>
  const applicationsByStatus = (a?.applicationsByStatus ?? {}) as Record<string, number>

  // Property status breakdown for donut visualization
  const statusCounts: Record<string, number> = {}
  for (const p of properties) {
    statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1
  }

  return (
    <div className="space-y-6">
      {/* Hero greeting */}
      <DashboardHero
        title={`${greeting}, ${user?.firstName ?? 'there'}`}
        description="Your property portfolio overview"
        tone="landlord"
        actions={
          <>
            <div className="hidden gap-2 sm:flex">
              <Link to="/properties/new"><Button size="sm" className="bg-white/10 border-0 text-white hover:bg-white/20"><Plus size={14} /> Add Property</Button></Link>
              <Link to="/analytics"><Button size="sm" className="bg-white/10 border-0 text-white hover:bg-white/20"><PieChart size={14} /> Analytics</Button></Link>
            </div>
            <Link to="/properties/new" className="sm:hidden">
              <Button size="sm" className="bg-white/10 border-0 text-white hover:bg-white/20"><Plus size={14} /></Button>
            </Link>
          </>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <DashboardMetricCard
          label="Properties"
          value={String(a?.totalProperties ?? 0)}
          sub={`${a?.occupiedProperties ?? 0} occupied`}
          icon={<Building2 size={18} />}
          accent="#3b82f6"
          href="/properties"
        />
        <DashboardMetricCard
          label="Active Tenants"
          value={String(a?.activeTenants ?? 0)}
          sub={`${a?.activeAgreements ?? 0} agreements`}
          icon={<Users size={18} />}
          accent="#10b981"
          href="/tenants"
        />
        <DashboardMetricCard
          label="Revenue"
          value={formatCurrency(Number(a?.thisMonthRevenue ?? a?.totalRevenue ?? 0))}
          sub={revenueChange !== 0
            ? `${revenueChange > 0 ? '+' : ''}${revenueChange}% vs last month`
            : 'This month'}
          icon={<DollarSign size={18} />}
          accent="#f59e0b"
          href="/payments"
          trend={revenueChange}
        />
        <DashboardMetricCard
          label="Occupancy"
          value={`${occupancyRate}%`}
          sub={`${a?.availableProperties ?? 0} vacant`}
          icon={<Percent size={18} />}
          accent={occupancyRate >= 80 ? '#10b981' : occupancyRate >= 50 ? '#f59e0b' : '#ef4444'}
          href="/properties"
        />
      </div>

      {/* Alert banners */}
      {(Number(a?.overduePayments ?? 0) > 0 || Number(a?.expiringLeases ?? 0) > 0 || openMaintenance.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {Number(a?.overduePayments ?? 0) > 0 && (
            <Link to="/payments" className="flex items-center gap-2 rounded-lg bg-danger/8 dark:bg-danger/12 border border-danger/20 px-3 py-2 hover:bg-danger/12 transition-colors">
              <AlertTriangle size={14} className="text-danger flex-shrink-0" />
              <span className="text-xs font-semibold text-danger">{a?.overduePayments} overdue payment{Number(a?.overduePayments) > 1 ? 's' : ''}</span>
              <span className="text-xs text-danger/70">({formatCurrency(Number(a?.overdueAmount ?? 0))})</span>
            </Link>
          )}
          {Number(a?.expiringLeases ?? 0) > 0 && (
            <Link to="/agreements" className="flex items-center gap-2 rounded-lg bg-secondary/8 dark:bg-secondary/12 border border-secondary/20 px-3 py-2 hover:bg-secondary/12 transition-colors">
              <Calendar size={14} className="text-secondary flex-shrink-0" />
              <span className="text-xs font-semibold text-secondary">{a?.expiringLeases} lease{Number(a?.expiringLeases) > 1 ? 's' : ''} expiring soon</span>
            </Link>
          )}
          {openMaintenance.length > 0 && (
            <Link to="/maintenance" className="flex items-center gap-2 rounded-lg bg-warning/8 dark:bg-warning/12 border border-warning/20 px-3 py-2 hover:bg-warning/12 transition-colors">
              <Wrench size={14} className="text-warning flex-shrink-0" />
              <span className="text-xs font-semibold text-warning">{openMaintenance.length} maintenance request{openMaintenance.length === 1 ? '' : 's'} open</span>
            </Link>
          )}
        </div>
      )}

      <DashboardActionPanel
        title="Today"
        description="Portfolio actions ordered by urgency."
        action={{ label: 'Manage properties', href: '/properties' }}
      >
        <DashboardActionItem
          title={Number(a?.pendingApplications ?? 0) > 0 ? 'Review applications' : 'Applications clear'}
          description={Number(a?.pendingApplications ?? 0) > 0 ? `${a?.pendingApplications} applicant${Number(a?.pendingApplications) === 1 ? '' : 's'} waiting for a decision.` : 'No pending tenant applications right now.'}
          icon={<Users size={16} />}
          href="/applications"
          tone={Number(a?.pendingApplications ?? 0) > 0 ? 'warning' : 'success'}
          meta={String(a?.pendingApplications ?? 0)}
        />
        <DashboardActionItem
          title={Number(a?.overduePayments ?? 0) > 0 ? 'Overdue rent' : 'Collections'}
          description={Number(a?.overduePayments ?? 0) > 0 ? `${formatCurrency(Number(a?.overdueAmount ?? 0))} is overdue.` : `${collectionRate}% collection rate across active leases.`}
          icon={<CreditCard size={16} />}
          href="/payments"
          tone={Number(a?.overduePayments ?? 0) > 0 ? 'danger' : 'default'}
        />
        <DashboardActionItem
          title={openMaintenance.length > 0 ? 'Maintenance queue' : 'Maintenance clear'}
          description={openMaintenance.length > 0 ? `${openMaintenance.length} open request${openMaintenance.length === 1 ? '' : 's'} to coordinate.` : 'No open maintenance requests.'}
          icon={<Wrench size={16} />}
          href="/maintenance"
          tone={openMaintenance.length > 0 ? 'warning' : 'success'}
        />
        <DashboardActionItem
          title={(a?.availableProperties ?? 0) > 0 ? 'Fill vacancies' : 'Add a listing'}
          description={(a?.availableProperties ?? 0) > 0 ? `${a?.availableProperties} available propert${Number(a?.availableProperties) === 1 ? 'y' : 'ies'} can be promoted.` : 'Create a listing when your portfolio grows.'}
          icon={<Building2 size={16} />}
          href={(a?.availableProperties ?? 0) > 0 ? '/properties' : '/properties/new'}
          tone="accent"
        />
      </DashboardActionPanel>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">

        {/* Left: Revenue chart + payments (8 cols) */}
        <div className="lg:col-span-8 space-y-4 sm:space-y-6">

          {/* Revenue chart */}
          <Card className="overflow-hidden p-0">
            <div className="p-4 sm:p-5 pb-0">
              <div className="flex items-center justify-between mb-1 gap-2">
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-bold text-primary-dark dark:text-white tracking-tight">Revenue Overview</p>
                  <p className="text-[11px] sm:text-xs text-muted dark:text-gray-500">Monthly income from all properties</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-lg font-extrabold font-display text-primary-dark dark:text-white">{formatCurrency(Number(a?.totalRevenue ?? 0))}</p>
                    <p className="text-[10px] text-muted dark:text-gray-500">Total earned</p>
                  </div>
                  <Link to="/analytics">
                    <Button size="sm" variant="outline" className="text-xs gap-1"><span className="hidden sm:inline">Details</span> <ArrowRight size={12} /></Button>
                  </Link>
                </div>
              </div>
            </div>

            {chartData.length > 1 ? (
              <div className="h-44 sm:h-56 mt-2 min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revAreaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={isDark ? '#60a5fa' : '#1e3a5f'} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={isDark ? '#3b82f6' : '#2d5a8e'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#252a3a' : '#e2e8f0'} strokeOpacity={0.3} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={35} />
                    <Tooltip
                      contentStyle={{ background: isDark ? '#0c0e1a' : '#fff', border: `1px solid ${isDark ? '#252a3a' : '#e2e8f0'}`, borderRadius: 12, color: isDark ? '#e2e8f0' : '#161927', fontSize: 12, padding: '8px 12px' }}
                      formatter={(value) => [formatCurrency(Number(value)), 'Revenue']}
                      cursor={{ stroke: isDark ? '#60a5fa' : '#1e3a5f', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Area type="monotone" dataKey="amount" stroke={isDark ? '#60a5fa' : '#1e3a5f'} strokeWidth={2.5} fill="url(#revAreaFill)" dot={{ r: 5, fill: isDark ? '#60a5fa' : '#1e3a5f', stroke: isDark ? '#0c0e1a' : '#fff', strokeWidth: 2.5 }} activeDot={{ r: 7, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2.5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-56 flex flex-col items-center justify-center text-center px-5">
                <div className="w-14 h-14 rounded-2xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center mb-3">
                  <CreditCard size={24} className="text-primary/40" />
                </div>
                <p className="text-sm font-medium text-primary-dark dark:text-white">No revenue data yet</p>
                <p className="text-xs text-muted dark:text-gray-500 mt-1">Revenue chart will build up as tenants make payments</p>
              </div>
            )}

            {/* Recent payments strip */}
            {recentPayments.length > 0 && (
              <div className="px-3 sm:px-5 py-3 sm:py-4 bg-surface/50 dark:bg-[#0c0e1a]/50 border-t border-border/30 dark:border-[#252a3a]/30">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-muted dark:text-gray-500 uppercase tracking-wider">Recent Payments</p>
                  <Link to="/payments" className="text-[11px] text-primary dark:text-blue-400 hover:underline">View all</Link>
                </div>
                <div className="space-y-0">
                  {recentPayments.slice(0, 4).map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-2 border-b border-border/20 dark:border-[#252a3a]/20 last:border-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-accent/10 dark:bg-accent/20 flex items-center justify-center flex-shrink-0">
                          <CheckCircle size={12} className="text-accent" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-primary-dark dark:text-white truncate">Tenant {p.tenantId.slice(0, 8)}...</p>
                          <p className="text-[10px] text-muted dark:text-gray-500">{p.paidAt ? formatDate(p.paidAt) : ''} &middot; {p.method?.replace('_', ' ') ?? 'N/A'}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-accent flex-shrink-0 ml-2">+{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Disputes & Agreements row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Open Disputes */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Open Disputes</CardTitle>
                  <Link to="/disputes"><Badge variant={openDisputes.length > 0 ? 'danger' : 'muted'} className="cursor-pointer text-[10px]">{openDisputes.length}</Badge></Link>
                </div>
              </CardHeader>
              <CardContent>
                {openDisputes.length > 0 ? (
                  <div className="space-y-2">
                    {openDisputes.slice(0, 3).map((d) => (
                      <div key={d.id} className="flex items-start gap-2.5 py-1.5">
                        <div className="w-7 h-7 rounded-lg bg-danger/10 dark:bg-danger/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <AlertTriangle size={12} className="text-danger" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-primary-dark dark:text-white truncate">{d.title}</p>
                          <p className="text-[10px] text-muted dark:text-gray-500 capitalize">{d.status.replace('_', ' ')} &middot; {formatDate(d.createdAt).split(',')[0]}</p>
                        </div>
                      </div>
                    ))}
                    {openDisputes.length > 3 && (
                      <Link to="/disputes" className="text-[11px] text-primary dark:text-blue-400 hover:underline flex items-center gap-1 pt-1">
                        +{openDisputes.length - 3} more <ChevronRight size={10} />
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <CheckCircle size={20} className="mx-auto text-accent/40 mb-2" />
                    <p className="text-xs text-muted dark:text-gray-500">No open disputes</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Expiring Leases */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Lease Activity</CardTitle>
                  <Link to="/agreements"><Badge variant="default" className="cursor-pointer text-[10px]">{activeAgreements.length} active</Badge></Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2.5 text-center">
                    <p className="text-lg font-extrabold font-display text-primary dark:text-blue-400">{activeAgreements.length}</p>
                    <p className="text-[10px] text-muted dark:text-gray-500">Active</p>
                  </div>
                  <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2.5 text-center">
                    <p className="text-lg font-extrabold font-display text-secondary">{a?.expiringLeases ?? 0}</p>
                    <p className="text-[10px] text-muted dark:text-gray-500">Expiring soon</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted dark:text-gray-500">Collection rate</span>
                  <span className="font-bold text-primary-dark dark:text-white">{collectionRate}%</span>
                </div>
                <div className="h-2 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden mt-1.5">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, collectionRate)}%`,
                      backgroundColor: collectionRate >= 80 ? '#10b981' : collectionRate >= 50 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-4">

          {/* Subscription Plan */}
          <Card className="overflow-hidden">
            <div className={`px-4 py-3 ${subscriptionData?.package ? 'bg-gradient-to-r from-primary/10 to-blue-500/10 dark:from-primary/20 dark:to-blue-500/20' : 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-500/20'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${subscriptionData?.package ? 'bg-primary/15 dark:bg-primary/25' : 'bg-amber-500/15 dark:bg-amber-500/25'}`}>
                    {subscriptionData?.package ? <Crown size={14} className="text-primary dark:text-blue-400" /> : <Package size={14} className="text-amber-500" />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-primary-dark dark:text-white">
                      {subscriptionData?.package?.name ?? 'No Plan'}
                    </p>
                    <p className="text-[10px] text-muted dark:text-gray-500">
                      {subscriptionData?.package
                        ? subscriptionData.package.price === 0 ? 'Free plan' : `${formatCurrency(subscriptionData.package.price)}/${subscriptionData.package.billingCycle === 'yearly' ? 'yr' : 'mo'}`
                        : 'Subscribe to add properties'}
                    </p>
                  </div>
                </div>
                <Link to="/subscription">
                  <Button size="sm" variant="outline" className="text-[10px] h-7">
                    {subscriptionData?.package ? 'Manage' : 'Subscribe'}
                  </Button>
                </Link>
              </div>
            </div>
            {subscriptionData?.package && (
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-muted dark:text-gray-400">Properties used</span>
                  <span className="text-[11px] font-bold text-primary-dark dark:text-white">
                    {subscriptionData.propertyCount} / {subscriptionData.maxProperties === -1 ? 'Unlimited' : subscriptionData.maxProperties}
                  </span>
                </div>
                {subscriptionData.maxProperties !== -1 && (
                  <div className="h-2 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (subscriptionData.propertyCount / subscriptionData.maxProperties) * 100)}%`,
                        backgroundColor: subscriptionData.propertyCount >= subscriptionData.maxProperties ? '#ef4444' : subscriptionData.propertyCount >= subscriptionData.maxProperties * 0.8 ? '#f59e0b' : '#10b981',
                      }}
                    />
                  </div>
                )}
                {!subscriptionData.canAddProperty && (
                  <p className="text-[10px] text-danger mt-2 font-medium">Property limit reached. Upgrade your plan to add more.</p>
                )}
              </CardContent>
            )}
          </Card>

          {/* Property breakdown */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Property Portfolio</CardTitle>
                <Link to="/properties"><span className="text-[11px] text-primary dark:text-blue-400 hover:underline cursor-pointer">Manage</span></Link>
              </div>
            </CardHeader>
            <CardContent>
              {/* Occupancy ring */}
              <div className="flex items-center gap-4 mb-4">
                <div className="relative w-20 h-20 flex-shrink-0">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" strokeWidth="6" className="text-border dark:text-[#252a3a]" />
                    <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${(occupancyRate / 100) * 201} 201`}
                      className={occupancyRate >= 80 ? 'text-accent' : occupancyRate >= 50 ? 'text-secondary' : 'text-danger'}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-lg font-extrabold font-display ${occupancyRate >= 80 ? 'text-accent' : occupancyRate >= 50 ? 'text-secondary' : 'text-danger'}`}>{occupancyRate}%</span>
                  </div>
                </div>
                <div className="space-y-1.5 flex-1">
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <div key={status} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusColors[status] ?? '#94a3b8' }} />
                      <span className="text-[11px] text-muted dark:text-gray-400 capitalize flex-1">{status.replace('_', ' ')}</span>
                      <span className="text-[11px] font-bold text-primary-dark dark:text-white">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Property list */}
              <div className="space-y-1.5 border-t border-border/30 dark:border-[#252a3a]/30 pt-3">
                {properties.slice(0, 4).map((p) => (
                  <Link key={p.id} to={`/properties/${p.id}`} className="flex items-center justify-between py-1.5 group">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary/8 dark:bg-primary/15 flex items-center justify-center flex-shrink-0">
                        <Home size={14} className="text-primary dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-primary-dark dark:text-white truncate group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">{p.title}</p>
                        <p className="text-[10px] text-muted dark:text-gray-500 truncate">{p.address.city} &middot; {formatCurrency(p.rentAmount)}/mo</p>
                      </div>
                    </div>
                    <Badge variant={statusVariant[p.status]} className="text-[9px] flex-shrink-0 ml-2">
                      {p.status === 'maintenance_required' ? 'maint.' : p.status.replace('_', ' ')}
                    </Badge>
                  </Link>
                ))}
                {properties.length > 4 && (
                  <Link to="/properties" className="text-[11px] text-primary dark:text-blue-400 hover:underline flex items-center gap-1 pt-1">
                    View all {properties.length} properties <ChevronRight size={10} />
                  </Link>
                )}
                {properties.length === 0 && (
                  <div className="text-center py-4">
                    <Building2 size={20} className="mx-auto text-muted/30 mb-2" />
                    <p className="text-xs text-muted dark:text-gray-500">No properties yet</p>
                    <Link to="/properties/new"><Button size="sm" className="mt-2 text-xs">Add your first</Button></Link>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          {notifications.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Alerts</CardTitle>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[10px] text-white font-bold">{notifications.length}</div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {notifications.map((n) => (
                    <div key={n.id} className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary dark:bg-blue-400 mt-2 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-primary-dark dark:text-white truncate">{n.title}</p>
                        <p className="text-[10px] text-muted dark:text-gray-500 line-clamp-1">{n.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Tenants', desc: 'Manage tenants', icon: <Users size={18} />, href: '/tenants', gradient: 'from-accent/10 to-emerald-500/10 dark:from-accent/20 dark:to-emerald-500/20', iconColor: 'text-accent' },
              { label: 'Payments', desc: 'Track income', icon: <CreditCard size={18} />, href: '/payments', gradient: 'from-secondary/10 to-amber-500/10 dark:from-secondary/20 dark:to-amber-500/20', iconColor: 'text-secondary' },
              { label: 'Disputes', desc: `${openDisputes.length} open`, icon: <AlertTriangle size={18} />, href: '/disputes', gradient: 'from-red-500/10 to-rose-500/10 dark:from-red-500/20 dark:to-rose-500/20', iconColor: 'text-danger' },
              { label: 'Analytics', desc: 'Full insights', icon: <PieChart size={18} />, href: '/analytics', gradient: 'from-violet-500/10 to-purple-500/10 dark:from-violet-500/20 dark:to-purple-500/20', iconColor: 'text-violet-500' },
            ].map((link) => (
              <Link key={link.label} to={link.href} className={`group rounded-2xl bg-gradient-to-br ${link.gradient} border border-border/30 dark:border-[#252a3a]/30 p-3 sm:p-4 hover:shadow-lg dark:hover:shadow-black/20 hover:-translate-y-0.5 transition-all`}>
                <div className={`${link.iconColor} mb-2 group-hover:scale-110 transition-transform`}>{link.icon}</div>
                <p className="text-xs font-bold text-primary-dark dark:text-white">{link.label}</p>
                <p className="text-[10px] text-muted dark:text-gray-500">{link.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* === Bottom row: Financial Summary, Property Types, Applications, Reviews === */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Financial Summary */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Financial Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted dark:text-gray-400">Total Revenue</span>
                <span className="text-xs font-bold text-primary-dark dark:text-white">{formatCurrency(Number(a?.totalRevenue ?? 0))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted dark:text-gray-400">This Month</span>
                <span className="text-xs font-bold text-accent">{formatCurrency(Number(a?.thisMonthRevenue ?? 0))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted dark:text-gray-400">Pending</span>
                <span className="text-xs font-bold text-secondary">{formatCurrency(Number(a?.pendingAmount ?? 0))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted dark:text-gray-400">Overdue</span>
                <span className="text-xs font-bold text-danger">{formatCurrency(Number(a?.overdueAmount ?? 0))}</span>
              </div>
              <div className="border-t border-border/30 dark:border-[#252a3a]/30 pt-2 flex items-center justify-between">
                <span className="text-xs text-muted dark:text-gray-400">Avg Rent/Property</span>
                <span className="text-xs font-bold text-primary-dark dark:text-white">{formatCurrency(Number(a?.avgRentAmount ?? 0))}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Property Types */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Property Types</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(propertyTypes).length > 0 ? (
              <div className="space-y-2.5">
                {Object.entries(propertyTypes).map(([type, count]) => {
                  const maxCount = Math.max(...Object.values(propertyTypes), 1)
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-primary-dark dark:text-gray-300 capitalize">{type.replace('_', ' ')}</span>
                        <span className="font-bold text-primary-dark dark:text-white">{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary to-blue-400" style={{ width: `${(count / maxCount) * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-4">
                <BarChart3 size={20} className="mx-auto text-muted/30 mb-2" />
                <p className="text-xs text-muted dark:text-gray-500">No property data</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Applications */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Applications</CardTitle>
              <Badge variant={Number(a?.pendingApplications ?? 0) > 0 ? 'warning' : 'muted'} className="text-[10px]">{a?.totalApplications ?? 0} total</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2.5 text-center">
                <p className="text-lg font-extrabold font-display text-secondary">{a?.pendingApplications ?? 0}</p>
                <p className="text-[10px] text-muted dark:text-gray-500">Pending</p>
              </div>
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2.5 text-center">
                <p className="text-lg font-extrabold font-display text-accent">{applicationsByStatus.approved ?? 0}</p>
                <p className="text-[10px] text-muted dark:text-gray-500">Approved</p>
              </div>
            </div>
            {Object.entries(applicationsByStatus).filter(([s]) => s !== 'pending' && s !== 'approved').map(([status, count]) => (
              <div key={status} className="flex items-center justify-between py-1">
                <span className="text-[11px] text-muted dark:text-gray-400 capitalize">{status.replace('_', ' ')}</span>
                <span className="text-[11px] font-bold text-primary-dark dark:text-white">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Reviews & Rating */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Reviews & Rating</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col items-center text-center mb-3">
              <div className="flex items-center gap-1 mb-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} size={16} className={s <= Math.round(Number(a?.avgRating ?? 0)) ? 'text-secondary fill-secondary' : 'text-border dark:text-[#252a3a]'} />
                ))}
              </div>
              <p className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">{a?.avgRating ?? 0}</p>
              <p className="text-[10px] text-muted dark:text-gray-500">{a?.totalReviews ?? 0} review{Number(a?.totalReviews ?? 0) !== 1 ? 's' : ''}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted dark:text-gray-400">Total Agreements</span>
                <span className="text-[11px] font-bold text-primary-dark dark:text-white">{a?.totalAgreements ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted dark:text-gray-400">New Tenants (month)</span>
                <span className="text-[11px] font-bold text-accent">{a?.newTenantsThisMonth ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted dark:text-gray-400">Total Disputes</span>
                <span className="text-[11px] font-bold text-danger">{a?.totalDisputes ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
