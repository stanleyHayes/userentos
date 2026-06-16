import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DashboardHero, DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { usePlatformAnalytics } from '@/hooks/useApi'
import { formatCurrency } from '@/lib/utils'
import {
  Building2, Users, AlertTriangle, ChevronRight, Shield, TrendingUp,
  Star,
} from 'lucide-react'
import { DashboardSkeleton } from '@/components/ui/Skeleton'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts'

const COLORS = ['#1e3a5f', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6', '#ec4899']

export function GovernmentDashboard() {
  const { data: analytics, isLoading } = usePlatformAnalytics()

  if (isLoading) return <DashboardSkeleton />

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = analytics as Record<string, any> | undefined

  // Extract nested data with fallbacks
  const users = a?.users ?? {}
  const properties = a?.properties ?? {}
  const agreements = a?.agreements ?? {}
  const payments = a?.payments ?? {}
  const disputes = a?.disputes ?? {}
  const applications = a?.applications ?? {}
  const reviews = a?.reviews ?? {}
  const creditScores = a?.creditScores ?? {}
  const investments = a?.investments ?? {}
  const loans = a?.loans ?? {}
  const tenantProfiles = a?.tenantProfiles ?? {}
  const savings = a?.savings ?? {}
  const wallets = a?.wallets ?? {}

  const disputesByCat = (disputes.byCategory ?? {}) as Record<string, number>
  const disputesByStatus = (disputes.byStatus ?? {}) as Record<string, number>
  const rentByType = (properties.avgRentByType ?? {}) as Record<string, number>
  const monthlyVolume = (payments.monthlyVolume ?? {}) as Record<string, number>
  const regions = (properties.regions ?? {}) as Record<string, number>
  const topCities = (properties.topCities ?? []) as { city: string; count: number }[]
  const paymentByMethod = (payments.byMethod ?? {}) as Record<string, number>
  const creditBrackets = (creditScores.brackets ?? {}) as Record<string, number>

  const pieData = Object.entries(disputesByCat).map(([name, value]) => ({ name: name.replace('_', ' '), value }))
  const volumeData = Object.entries(monthlyVolume).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, amount]) => ({ month, amount }))
  const rentData = Object.entries(rentByType).map(([type, avg]) => ({ type, avg }))
  const regionData = Object.entries(regions).sort(([, a], [, b]) => b - a).slice(0, 8).map(([region, count]) => ({ region, count }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <DashboardHero
        title="Government Dashboard"
        description="National rental market overview · Platform analytics"
        tone="government"
        actions={
          <Link to="/government">
            <Button size="sm" className="bg-white/10 border-0 text-white hover:bg-white/20"><Shield size={14} /> <span className="hidden sm:inline">Control Panel</span><span className="sm:hidden">Panel</span></Button>
          </Link>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <DashboardMetricCard label="Properties" value={String(properties.total ?? 0)} sub={`${properties.byStatus?.occupied ?? 0} occupied`} icon={<Building2 size={20} />} accent="#3b82f6" href="/properties" />
        <DashboardMetricCard label="Users" value={String(users.total ?? 0)} sub={`${users.byRole?.tenant ?? 0} tenants, ${users.byRole?.landlord ?? 0} landlords`} icon={<Users size={20} />} accent="#10b981" href="/users" />
        <DashboardMetricCard label="Payment Volume" value={formatCurrency(Number(payments.completedVolume ?? 0))} sub={`${agreements.byStatus?.active ?? 0} active agreements`} icon={<TrendingUp size={20} />} accent="#f59e0b" href="/analytics" />
        <DashboardMetricCard label="Open Disputes" value={String(disputes.open ?? 0)} sub={`of ${disputes.total ?? 0} total`} icon={<AlertTriangle size={20} />} accent="#ef4444" href="/disputes" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Payment volume chart */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="truncate">Monthly Payment Volume</CardTitle>
              <Link to="/analytics" className="text-xs text-primary dark:text-blue-400 hover:underline flex items-center gap-1">
                Full analytics <ChevronRight size={12} />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {volumeData.length > 0 ? (
              <div className="h-48 sm:h-56 min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={volumeData}>
                    <defs>
                      <linearGradient id="govGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1e3a5f" />
                        <stop offset="100%" stopColor="#2d5a8e" />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ background: '#161927', border: 'none', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }} formatter={(value) => [formatCurrency(Number(value)), 'Volume']} />
                    <Bar dataKey="amount" fill="url(#govGrad)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-56 flex items-center justify-center text-muted dark:text-gray-500 text-sm">No data</div>
            )}
          </CardContent>
        </Card>

        {/* Dispute pie */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Disputes by Category</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#161927', border: 'none', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted text-sm">No disputes</div>
            )}
            <div className="mt-2 space-y-1.5">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-primary-dark dark:text-gray-300 capitalize">{d.name}</span>
                  </div>
                  <span className="font-bold text-primary-dark dark:text-white">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Rent by Type, RentGuard, Dispute Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Rent by type */}
        <Card className="overflow-hidden">
          <CardHeader><CardTitle className="text-sm">Avg. Rent by Type</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rentData.map((d) => {
                const maxRent = Math.max(...rentData.map((r) => r.avg), 1)
                return (
                  <div key={d.type}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-primary-dark dark:text-gray-300 capitalize">{d.type}</span>
                      <span className="font-bold text-primary-dark dark:text-white">{formatCurrency(d.avg)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light" style={{ width: `${(d.avg / maxRent) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
              {rentData.length === 0 && <p className="text-xs text-muted text-center py-4">No data</p>}
            </div>
          </CardContent>
        </Card>

        {/* RentGuard / Savings adoption */}
        <Card>
          <CardHeader><CardTitle className="text-sm">RentGuard Adoption</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-xl font-extrabold font-display text-primary dark:text-blue-400">{savings.activeSavers ?? 0}</p>
                <p className="text-[10px] text-muted dark:text-gray-500">Active Savers</p>
              </div>
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-xl font-extrabold font-display text-accent">{formatCurrency(savings.totalSaved ?? 0)}</p>
                <p className="text-[10px] text-muted dark:text-gray-500">Total Saved</p>
              </div>
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-xl font-extrabold font-display text-secondary">{savings.completionRate ?? 0}%</p>
                <p className="text-[10px] text-muted dark:text-gray-500">Completion Rate</p>
              </div>
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-xl font-extrabold font-display text-primary-dark dark:text-white">{savings.totalPlans ?? 0}</p>
                <p className="text-[10px] text-muted dark:text-gray-500">Total Plans</p>
              </div>
            </div>
            {savings.savingsProgress > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-muted dark:text-gray-500">Overall Progress</span>
                  <span className="font-bold text-accent">{savings.savingsProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-accent to-emerald-400" style={{ width: `${Math.min(100, savings.savingsProgress)}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dispute status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Dispute Status</CardTitle>
              <Badge variant={disputes.resolutionRate >= 70 ? 'success' : disputes.resolutionRate >= 40 ? 'warning' : 'danger'} className="text-[10px]">{disputes.resolutionRate ?? 0}% resolved</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {Object.entries(disputesByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-xs text-primary-dark dark:text-gray-300 capitalize">{status.replace('_', ' ')}</span>
                  <Badge variant={
                    status === 'resolved' || status === 'closed' ? 'success' :
                    status === 'escalated' ? 'danger' :
                    status === 'filed' ? 'warning' : 'default'
                  }>{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Users & Applications — wider cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Verification - with donut chart */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users size={16} className="text-emerald-500" />User Verification</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="relative w-28 h-28 flex-shrink-0">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="5" className="text-border dark:text-[#252a3a]" />
                  <circle cx="32" cy="32" r="26" fill="none" stroke="#10b981" strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={`${(users.total > 0 ? (users.verified / users.total) : 0) * 163.4} 163.4`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-extrabold font-display text-accent">{users.total > 0 ? Math.round((users.verified / users.total) * 100) : 0}%</span>
                  <span className="text-[9px] text-muted">verified</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-accent/10 p-2.5 text-center">
                    <p className="text-lg font-extrabold font-display text-accent">{users.verified ?? 0}</p>
                    <p className="text-[9px] text-muted">Verified</p>
                  </div>
                  <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2.5 text-center">
                    <p className="text-lg font-extrabold font-display text-primary-dark dark:text-white">{users.unverified ?? 0}</p>
                    <p className="text-[9px] text-muted">Unverified</p>
                  </div>
                </div>
                {users.byRole && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(users.byRole as Record<string, number>).map(([role, count]) => (
                      <div key={role} className="flex items-center justify-between">
                        <span className="text-[10px] text-muted capitalize">{role.replace('_', ' ')}</span>
                        <span className="text-[10px] font-bold text-primary-dark dark:text-white">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Applications - with visual breakdown */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Building2 size={16} className="text-blue-500" />Applications</CardTitle>
              <Badge variant="default" className="text-[10px]">{applications.approvalRate ?? 0}% approved</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="text-center flex-shrink-0">
                <p className="text-4xl font-extrabold font-display text-primary-dark dark:text-white">{applications.total ?? 0}</p>
                <p className="text-[10px] text-muted mt-1">Total</p>
              </div>
              <div className="flex-1 space-y-2.5">
                {Object.entries((applications.byStatus ?? {}) as Record<string, number>).map(([status, count]) => {
                  const total = applications.total || 1
                  const colors: Record<string, string> = { approved: 'bg-accent', pending: 'bg-amber-500', rejected: 'bg-danger', withdrawn: 'bg-gray-400' }
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between text-[11px] mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${colors[status] ?? 'bg-muted'}`} />
                          <span className="text-muted capitalize">{status.replace('_', ' ')}</span>
                        </div>
                        <span className="font-bold text-primary-dark dark:text-white">{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                        <div className={`h-full rounded-full ${colors[status] ?? 'bg-muted'}`} style={{ width: `${(count / total) * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Reviews + Credit Scores + Tenant Profiles */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Reviews */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Star size={16} className="text-amber-400" />Reviews & Ratings</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-center">
                <p className="text-3xl font-extrabold font-display text-primary-dark dark:text-white">{reviews.avgRating ?? 0}</p>
                <div className="flex items-center gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} size={12} className={s <= Math.round(reviews.avgRating ?? 0) ? 'text-secondary fill-secondary' : 'text-border dark:text-[#252a3a]'} />
                  ))}
                </div>
                <p className="text-[9px] text-muted mt-1">{reviews.total ?? 0} reviews</p>
              </div>
              <div className="flex-1 space-y-1.5">
                {reviews.avgSubRatings && Object.entries(reviews.avgSubRatings as Record<string, number>).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[9px] text-muted w-20 capitalize truncate">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                      <div className="h-full rounded-full bg-secondary" style={{ width: `${(val / 5) * 100}%` }} />
                    </div>
                    <span className="text-[9px] font-bold w-5 text-right">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-accent/10 px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] text-muted">Would Recommend</span>
              <span className="text-sm font-bold text-accent">{reviews.wouldRecommendPercent ?? 0}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Credit Score */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield size={16} className="text-violet-500" />Credit Scores</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="5" className="text-border dark:text-[#252a3a]" />
                  <circle cx="32" cy="32" r="26" fill="none" stroke="#8b5cf6" strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={`${((creditScores.avgScore ?? 0) / 100) * 163.4} 163.4`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-extrabold font-display text-violet-500">{creditScores.avgScore ?? 0}</span>
                  <span className="text-[8px] text-muted">avg</span>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-muted mb-2">{creditScores.total ?? 0} tenants scored</p>
                <div className="space-y-2">
                  {[
                    { label: 'Excellent (80+)', key: 'excellent', color: 'bg-accent' },
                    { label: 'Good (60-79)', key: 'good', color: 'bg-blue-500' },
                    { label: 'Fair (40-59)', key: 'fair', color: 'bg-secondary' },
                    { label: 'Poor (<40)', key: 'poor', color: 'bg-danger' },
                  ].map((b) => {
                    const count = creditBrackets[b.key] ?? 0
                    const total = creditScores.total || 1
                    return (
                      <div key={b.key}>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-muted">{b.label}</span>
                          <span className="font-bold text-primary-dark dark:text-white">{count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                          <div className={`h-full rounded-full ${b.color}`} style={{ width: `${(count / total) * 100}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tenant Profiles */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users size={16} className="text-cyan-500" />Tenant Profiles</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-xl font-extrabold font-display text-primary-dark dark:text-white">{tenantProfiles.total ?? 0}</p>
                <p className="text-[9px] text-muted">Total</p>
              </div>
              <div className="rounded-lg bg-accent/10 p-3 text-center">
                <p className="text-xl font-extrabold font-display text-accent">{tenantProfiles.complete ?? 0}</p>
                <p className="text-[9px] text-muted">Complete</p>
              </div>
            </div>
            <div className="mb-3">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-muted">Avg. Completion</span>
                <span className="font-bold text-primary dark:text-blue-400">{tenantProfiles.avgCompletionScore ?? 0}%</span>
              </div>
              <div className="h-2 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-primary to-blue-400" style={{ width: `${tenantProfiles.avgCompletionScore ?? 0}%` }} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-surface dark:bg-[#0c0e1a] px-3 py-2">
                <span className="text-[11px] text-muted">ID Verified</span>
                <span className="text-sm font-bold text-accent">{tenantProfiles.idVerified ?? 0}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface dark:bg-[#0c0e1a] px-3 py-2">
                <span className="text-[11px] text-muted">Income Verified</span>
                <span className="text-sm font-bold text-secondary">{tenantProfiles.incomeVerified ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 5: Financial — Loans + Investments side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Loans */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><TrendingUp size={16} className="text-orange-500" />Loans</CardTitle>
              <Badge variant={loans.defaultRate > 10 ? 'danger' : loans.defaultRate > 5 ? 'warning' : 'success'} className="text-[10px]">{loans.defaultRate ?? 0}% default</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-blue-500/10 p-3 text-center">
                <p className="text-lg font-extrabold font-display text-primary dark:text-blue-400">{formatCurrency(loans.totalDisbursed ?? 0)}</p>
                <p className="text-[9px] text-muted">Disbursed</p>
              </div>
              <div className="rounded-lg bg-accent/10 p-3 text-center">
                <p className="text-lg font-extrabold font-display text-accent">{formatCurrency(loans.totalRepaid ?? 0)}</p>
                <p className="text-[9px] text-muted">Repaid</p>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-3 text-center">
                <p className="text-lg font-extrabold font-display text-secondary">{formatCurrency(loans.totalOutstanding ?? 0)}</p>
                <p className="text-[9px] text-muted">Outstanding</p>
              </div>
            </div>
            {loans.byStatus && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(loans.byStatus as Record<string, number>).map(([status, count]) => (
                  <Badge key={status} variant={status === 'defaulted' ? 'danger' : status === 'active' ? 'success' : 'default'} className="text-[10px] capitalize">{status} ({count})</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Investments */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 size={16} className="text-cyan-500" />Investments</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-xl font-extrabold font-display text-primary-dark dark:text-white">{investments.total ?? 0}</p>
                <p className="text-[9px] text-muted">Total</p>
              </div>
              <div className="rounded-lg bg-blue-500/10 p-3 text-center">
                <p className="text-lg font-extrabold font-display text-primary dark:text-blue-400">{formatCurrency(investments.totalInvested ?? 0)}</p>
                <p className="text-[9px] text-muted">Invested</p>
              </div>
              <div className="rounded-lg bg-accent/10 p-3 text-center">
                <p className="text-lg font-extrabold font-display text-accent">{formatCurrency(investments.totalExpectedReturn ?? 0)}</p>
                <p className="text-[9px] text-muted">Expected Return</p>
              </div>
            </div>
            {investments.byType && Object.keys(investments.byType).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(investments.byType as Record<string, number>).map(([type, count]) => (
                  <Badge key={type} variant="default" className="text-[10px] capitalize">{type.replace('_', ' ')} ({count})</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 6: Payments + Property Engagement + Agreements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Breakdown */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp size={16} className="text-emerald-500" />Payment Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">{payments.total ?? 0}</p>
                <p className="text-[9px] text-muted">Total</p>
              </div>
              <div className="rounded-lg bg-accent/10 px-3 py-2 text-center flex-1">
                <p className="text-sm font-bold text-accent">{formatCurrency(payments.avgPaymentAmount ?? 0)}</p>
                <p className="text-[9px] text-muted">Avg. Amount</p>
              </div>
            </div>
            {payments.byStatus && (
              <div className="space-y-1.5 mb-3">
                {Object.entries(payments.byStatus as Record<string, number>).map(([status, count]) => {
                  const total = payments.total || 1
                  const colors: Record<string, string> = { completed: 'bg-accent', pending: 'bg-amber-500', failed: 'bg-danger', refunded: 'bg-violet-500', processing: 'bg-blue-500' }
                  return (
                    <div key={status} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${colors[status] ?? 'bg-muted'}`} />
                      <span className="text-[10px] text-muted capitalize flex-1">{status}</span>
                      <div className="w-16 h-1.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                        <div className={`h-full rounded-full ${colors[status] ?? 'bg-muted'}`} style={{ width: `${(count / total) * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-bold text-primary-dark dark:text-white w-6 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}
            {Object.keys(paymentByMethod).length > 0 && (
              <div className="border-t border-border/30 dark:border-[#252a3a]/30 pt-2">
                <p className="text-[9px] text-muted font-semibold uppercase tracking-wider mb-1.5">By Method</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(paymentByMethod).map(([method, count]) => (
                    <Badge key={method} variant="default" className="text-[10px] capitalize">{method.replace('_', ' ')} ({count})</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Property Engagement */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 size={16} className="text-blue-500" />Property Engagement</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
              <div className="rounded-lg bg-blue-500/10 p-3 text-center">
                <p className="text-lg font-extrabold font-display text-primary dark:text-blue-400">{(properties.engagement?.views ?? 0).toLocaleString()}</p>
                <p className="text-[9px] text-muted">Views</p>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-3 text-center">
                <p className="text-lg font-extrabold font-display text-secondary">{(properties.engagement?.inquiries ?? 0).toLocaleString()}</p>
                <p className="text-[9px] text-muted">Inquiries</p>
              </div>
              <div className="rounded-lg bg-rose-500/10 p-3 text-center">
                <p className="text-lg font-extrabold font-display text-rose-500">{(properties.engagement?.favorites ?? 0).toLocaleString()}</p>
                <p className="text-[9px] text-muted">Favorites</p>
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between rounded-lg bg-surface dark:bg-[#0c0e1a] px-3 py-2">
                <span className="text-[11px] text-muted">Avg. Rent</span>
                <span className="text-sm font-bold text-primary-dark dark:text-white">{formatCurrency(properties.avgRent ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface dark:bg-[#0c0e1a] px-3 py-2">
                <span className="text-[11px] text-muted">Furnished</span>
                <span className="text-sm font-bold text-accent">{properties.furnished ?? 0}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface dark:bg-[#0c0e1a] px-3 py-2">
                <span className="text-[11px] text-muted">Unfurnished</span>
                <span className="text-sm font-bold text-primary-dark dark:text-white">{properties.unfurnished ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agreements & Compliance */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield size={16} className="text-indigo-500" />Agreements</CardTitle></CardHeader>
          <CardContent>
            <div className="text-center mb-4">
              <p className="text-3xl font-extrabold font-display text-primary-dark dark:text-white">{agreements.total ?? 0}</p>
              <p className="text-[9px] text-muted">Total Agreements</p>
            </div>
            {agreements.byStatus && (
              <div className="space-y-2 mb-3">
                {Object.entries(agreements.byStatus as Record<string, number>).map(([status, count]) => {
                  const colors: Record<string, string> = { active: 'bg-accent', expired: 'bg-gray-400', pending_signatures: 'bg-amber-500' }
                  return (
                    <div key={status} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${colors[status] ?? 'bg-muted'}`} />
                        <span className="text-[11px] text-muted capitalize">{status.replace('_', ' ')}</span>
                      </div>
                      <span className="text-[11px] font-bold text-primary-dark dark:text-white">{count}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="border-t border-border/30 dark:border-[#252a3a]/30 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted">Violations</span>
                <Badge variant="danger" className="text-[10px]">{agreements.compliance?.violations ?? 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted">Warnings</span>
                <Badge variant="warning" className="text-[10px]">{agreements.compliance?.warnings ?? 0}</Badge>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-muted">Wallets</span>
                <span className="text-[11px] font-bold text-primary-dark dark:text-white">{wallets.total ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted">Total Balance</span>
                <span className="text-[11px] font-bold text-accent">{formatCurrency(wallets.totalBalance ?? 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 7: Regional Distribution — full width */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 size={16} className="text-blue-500" />Regional Property Distribution</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {regionData.length > 0 ? (
                <div className="h-56 min-w-0 overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={regionData} layout="vertical">
                      <defs>
                        <linearGradient id="regionGrad2" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#06b6d4" />
                        </linearGradient>
                      </defs>
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="region" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={90} />
                      <Tooltip contentStyle={{ background: '#161927', border: '1px solid #334155', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }} />
                      <Bar dataKey="count" fill="url(#regionGrad2)" radius={[0, 6, 6, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-muted text-sm">No regional data</div>
              )}
            </div>
            <div>
              {topCities.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted font-semibold uppercase tracking-wider mb-3">Top Cities</p>
                  <div className="space-y-2">
                    {topCities.slice(0, 8).map((c, i) => (
                      <div key={c.city} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted w-4">{i + 1}.</span>
                          <span className="text-xs text-primary-dark dark:text-white">{c.city}</span>
                        </div>
                        <Badge variant="default" className="text-[10px]">{c.count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
