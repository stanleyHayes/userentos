import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuthStore } from '@/stores/authStore'
import { useMyAnalytics, usePlatformAnalytics, useRegistryStats } from '@/hooks/useApi'
import { formatCurrency } from '@/lib/utils'
import {
  BarChart3, TrendingUp, Users, Building2, DollarSign,
  PiggyBank, AlertTriangle, FileText, Star,
  CreditCard, Briefcase, Shield, Scale,
  Eye, Globe2,
} from 'lucide-react'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { DashboardSkeleton } from '@/components/ui/Skeleton'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts'

export function AnalyticsPage() {
  const user = useAuthStore((s) => s.user)
  const isGov = user?.activeRole === 'government' || user?.activeRole === 'admin' || user?.activeRole === 'super_admin'

  return isGov ? <PlatformAnalytics /> : <UserAnalytics />
}

/* ─── Helpers ─── */

function num(v: unknown) {
  return Number(v ?? 0)
}

function StatCard({ label, value, icon, sub, trend, accent }: {
  label: string; value: string; icon: React.ReactNode; sub?: string; trend?: number; accent?: string
}) {
  return <DashboardMetricCard label={label} value={value} sub={sub} icon={icon} trend={trend} accent={accent ?? '#1e3a5f'} />
}

function HBar({ label, value, max, color = 'bg-primary dark:bg-blue-400', suffix }: {
  label: string; value: number; max: number; color?: string; suffix?: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className="text-[10px] sm:text-xs text-muted w-16 sm:w-24 flex-shrink-0 truncate capitalize">{label}</span>
      <div className="flex-1 h-5 sm:h-6 bg-surface dark:bg-[#0c0e1a] rounded-full overflow-hidden min-w-0">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] sm:text-xs font-medium w-16 sm:w-24 text-right flex-shrink-0 truncate">
        {suffix ?? String(value)}
      </span>
    </div>
  )
}

function DonutChart({ segments, size = 120, stroke = 14 }: {
  segments: { label: string; value: number; color: string }[]; size?: number; stroke?: number
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return <EmptyState preset="general" title="No data" compact />

  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r

  const visibleSegments = segments.filter((s) => s.value > 0)
  const arcs = visibleSegments.reduce<{ seg: typeof visibleSegments[number]; len: number; offset: number }[]>(
    (acc, seg) => {
      const len = (seg.value / total) * circumference
      const offset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0
      acc.push({ seg, len, offset })
      return acc
    },
    [],
  )

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-surface dark:text-[#0c0e1a]" />
        {arcs.map(({ seg, len, offset }) => (
          <circle
            key={seg.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            strokeDasharray={`${len} ${circumference - len}`}
            strokeDashoffset={-offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        ))}
      </svg>
      <div className="space-y-1.5 flex-1 w-full min-w-0">
        {segments.filter(s => s.value > 0).map((seg) => (
          <div key={seg.label} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-xs text-primary-dark dark:text-gray-300 capitalize truncate">{seg.label}</span>
            </div>
            <span className="text-xs font-bold text-primary-dark dark:text-white flex-shrink-0">
              {seg.value} <span className="text-muted font-normal">({Math.round((seg.value / total) * 100)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProgressRing({ value, label, color, detail }: {
  value: number; label: string; color: string; detail?: string
}) {
  const size = 80
  const stroke = 8
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const pct = Math.min(Math.max(value, 0), 100)
  const dashLen = (pct / 100) * circumference

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} className="flex-shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-surface dark:text-[#0c0e1a]" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${dashLen} ${circumference - dashLen}`} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <div>
        <p className="text-xl font-bold text-primary-dark dark:text-white">{pct}%</p>
        <p className="text-xs text-muted">{label}</p>
        {detail && <p className="text-[10px] text-accent mt-0.5">{detail}</p>}
      </div>
    </div>
  )
}

/* ─── Landlord / Tenant Analytics ─── */

function UserAnalytics() {
  const user = useAuthStore((s) => s.user)
  const { data: analytics, isLoading } = useMyAnalytics()
  const isLandlord = user?.activeRole === 'landlord' || user?.activeRole === 'property_manager'

  if (isLoading) return <DashboardSkeleton />

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = analytics as Record<string, any> | undefined

  if (isLandlord) return <LandlordAnalytics a={a} />
  return <TenantAnalytics a={a} />
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LandlordAnalytics({ a }: { a: Record<string, any> | undefined }) {
  const monthlyIncome = (a?.monthlyIncome ?? {}) as Record<string, number>
  const months = Object.entries(monthlyIncome).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
  const maxIncome = Math.max(...months.map(([, v]) => v), 1)

  const propertyTypes = (a?.propertyTypes ?? {}) as Record<string, number>
  const maxType = Math.max(...Object.values(propertyTypes), 1)

  const disputesByStatus = (a?.disputesByStatus ?? {}) as Record<string, number>
  const applicationsByStatus = (a?.applicationsByStatus ?? {}) as Record<string, number>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-dark">Portfolio Analytics</h1>
        <p className="text-sm text-muted mt-1">Your property performance overview</p>
      </div>

      {/* KPI row */}
      <div className="stagger-3d grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Properties" value={String(num(a?.totalProperties))} icon={<Building2 size={18} />} sub={`${num(a?.occupiedProperties)} occupied, ${num(a?.availableProperties)} available`} accent="#7c3aed" />
        <StatCard label="Active Tenants" value={String(num(a?.activeTenants))} icon={<Users size={18} />} sub={`${num(a?.newTenantsThisMonth)} new this month`} accent="#2563eb" />
        <StatCard label="Total Revenue" value={formatCurrency(num(a?.totalRevenue))} icon={<TrendingUp size={18} />} trend={num(a?.revenueChange)} accent="#059669" />
        <StatCard label="This Month" value={formatCurrency(num(a?.thisMonthRevenue))} icon={<DollarSign size={18} />} sub={`Last: ${formatCurrency(num(a?.lastMonthRevenue))}`} accent="#059669" />
      </div>

      {/* Second KPI row */}
      <div className="stagger-3d grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Collection Rate" value={`${num(a?.collectionRate)}%`} icon={<BarChart3 size={18} />} accent="#059669" />
        <StatCard label="Avg. Rent" value={formatCurrency(num(a?.avgRentAmount))} icon={<CreditCard size={18} />} accent="#059669" />
        <StatCard label="Pending Payments" value={String(num(a?.pendingPayments))} icon={<AlertTriangle size={18} />} sub={formatCurrency(num(a?.pendingAmount))} accent="#d97706" />
        <StatCard label="Overdue Payments" value={String(num(a?.overduePayments))} icon={<AlertTriangle size={18} />} sub={formatCurrency(num(a?.overdueAmount))} accent="#dc2626" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Monthly Revenue */}
        <Card>
          <CardHeader><CardTitle>Monthly Revenue (last 6 months)</CardTitle></CardHeader>
          <CardContent>
            {months.length > 0 ? (
              <div className="space-y-3">
                {months.map(([month, amount]) => (
                  <HBar key={month} label={month} value={amount} max={maxIncome} suffix={formatCurrency(amount)} />
                ))}
              </div>
            ) : <EmptyState preset="payments" title="No revenue data yet" description="Revenue will appear here once payments come in." compact />}
          </CardContent>
        </Card>

        {/* Property breakdown */}
        <Card>
          <CardHeader><CardTitle>Property Status</CardTitle></CardHeader>
          <CardContent>
            <DonutChart segments={[
              { label: 'Occupied', value: num(a?.occupiedProperties), color: '#3b82f6' },
              { label: 'Available', value: num(a?.availableProperties), color: '#10b981' },
              { label: 'Maintenance', value: num(a?.maintenanceProperties), color: '#f59e0b' },
            ]} />
          </CardContent>
        </Card>

        {/* Property Types */}
        <Card>
          <CardHeader><CardTitle>Property Types</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(propertyTypes).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(propertyTypes).sort(([, a], [, b]) => b - a).map(([type, count]) => (
                  <HBar key={type} label={type.replace(/_/g, ' ')} value={count} max={maxType} color="bg-secondary/80" />
                ))}
              </div>
            ) : <p className="text-sm text-muted text-center py-6">No property data</p>}
          </CardContent>
        </Card>

        {/* Gauges */}
        <Card>
          <CardHeader><CardTitle>Performance</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <ProgressRing value={num(a?.occupancyRate)} label="Occupancy Rate" color="#10b981" detail={`${num(a?.occupiedProperties)}/${num(a?.totalProperties)} properties`} />
              <ProgressRing value={num(a?.collectionRate)} label="Collection Rate" color="#3b82f6" />
            </div>
          </CardContent>
        </Card>

        {/* Agreements & Disputes */}
        <Card>
          <CardHeader><CardTitle>Agreements & Disputes</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-2xl font-bold text-primary dark:text-blue-400">{num(a?.activeAgreements)}</p>
                <p className="text-[10px] text-muted">Active Leases</p>
              </div>
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-2xl font-bold text-accent">{num(a?.totalAgreements)}</p>
                <p className="text-[10px] text-muted">Total Agreements</p>
              </div>
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-2xl font-bold text-danger">{num(a?.openDisputes)}</p>
                <p className="text-[10px] text-muted">Open Disputes</p>
              </div>
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-2xl font-bold text-warning">{num(a?.expiringLeases)}</p>
                <p className="text-[10px] text-muted">Expiring Soon</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Applications + Reviews */}
        <Card>
          <CardHeader><CardTitle>Applications & Reviews</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Total Applications</span>
                <span className="text-sm font-bold text-primary-dark dark:text-white">{num(a?.totalApplications)}</span>
              </div>
              {Object.entries(applicationsByStatus).length > 0 && (
                <DonutChart size={90} stroke={10} segments={Object.entries(applicationsByStatus).map(([s, c], i) => ({
                  label: s.replace(/_/g, ' '), value: c,
                  color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5],
                }))} />
              )}
              <div className="pt-3 border-t border-border dark:border-gray-700/50 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Star size={14} className="text-amber-400" />
                  <span className="text-xs text-muted">Avg Rating</span>
                </div>
                <span className="text-sm font-bold text-primary-dark dark:text-white">{String(a?.avgRating ?? 0)} / 5</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Total Reviews</span>
                <span className="text-sm font-bold text-primary-dark dark:text-white">{num(a?.totalReviews)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Disputes breakdown (if any) */}
      {Object.keys(disputesByStatus).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Disputes Breakdown</CardTitle></CardHeader>
          <CardContent>
            <DonutChart segments={Object.entries(disputesByStatus).map(([s, c], i) => ({
              label: s.replace(/_/g, ' '), value: c,
              color: ['#f59e0b', '#3b82f6', '#ef4444', '#10b981', '#6b7280'][i % 5],
            }))} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TenantAnalytics({ a }: { a: Record<string, any> | undefined }) {
  const monthlyPayments = (a?.monthlyPayments ?? {}) as Record<string, number>
  const months = Object.entries(monthlyPayments).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
  const maxPayment = Math.max(...months.map(([, v]) => v), 1)
  const applicationsByStatus = (a?.applicationsByStatus ?? {}) as Record<string, number>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-dark">My Analytics</h1>
        <p className="text-sm text-muted mt-1">Your rental and savings overview</p>
      </div>

      <div className="stagger-3d grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Paid" value={formatCurrency(num(a?.totalPaid))} icon={<DollarSign size={18} />} accent="#059669" />
        <StatCard label="Payments Made" value={String(num(a?.paymentCount))} icon={<CreditCard size={18} />} accent="#2563eb" />
        <StatCard label="Wallet Balance" value={formatCurrency(num(a?.walletBalance))} icon={<PiggyBank size={18} />} accent="#7c3aed" />
        <StatCard label="Next Payment" value={formatCurrency(num(a?.nextPaymentAmount))} icon={<TrendingUp size={18} />} accent="#d97706" />
      </div>

      <div className="stagger-3d grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Saved" value={formatCurrency(num(a?.totalSaved))} icon={<PiggyBank size={18} />} accent="#059669" />
        <StatCard label="Savings Target" value={formatCurrency(num(a?.savingsTarget))} icon={<BarChart3 size={18} />} accent="#2563eb" />
        <StatCard label="Active Plans" value={String(num(a?.activePlans))} icon={<FileText size={18} />} accent="#7c3aed" />
        <StatCard label="Pending Payments" value={String(num(a?.pendingPayments))} icon={<AlertTriangle size={18} />} sub={formatCurrency(num(a?.pendingAmount))} accent="#d97706" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Payment history */}
        <Card>
          <CardHeader><CardTitle>Payment History (last 6 months)</CardTitle></CardHeader>
          <CardContent>
            {months.length > 0 ? (
              <div className="space-y-3">
                {months.map(([month, amount]) => (
                  <HBar key={month} label={month} value={amount} max={maxPayment} suffix={formatCurrency(amount)} />
                ))}
              </div>
            ) : <EmptyState preset="payments" title="No payment data yet" description="Payment activity will appear here." compact />}
          </CardContent>
        </Card>

        {/* Savings progress */}
        <Card>
          <CardHeader><CardTitle>Savings Progress</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              <ProgressRing value={num(a?.savingsProgress)} label="Savings Progress" color="#10b981" detail={`${formatCurrency(num(a?.totalSaved))} of ${formatCurrency(num(a?.savingsTarget))}`} />
              <div className="grid grid-cols-3 gap-3 w-full">
                <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                  <p className="text-lg font-bold text-accent">{formatCurrency(num(a?.totalSaved))}</p>
                  <p className="text-[10px] text-muted">Saved</p>
                </div>
                <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                  <p className="text-lg font-bold text-primary dark:text-blue-400">{formatCurrency(num(a?.savingsTarget))}</p>
                  <p className="text-[10px] text-muted">Target</p>
                </div>
                <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                  <p className="text-lg font-bold text-secondary">{num(a?.activePlans)}</p>
                  <p className="text-[10px] text-muted">Plans</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agreements */}
        <Card>
          <CardHeader><CardTitle>Agreements & Disputes</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-2xl font-bold text-primary dark:text-blue-400">{num(a?.activeAgreements)}</p>
                <p className="text-[10px] text-muted">Active Leases</p>
              </div>
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-2xl font-bold text-accent">{num(a?.totalAgreements)}</p>
                <p className="text-[10px] text-muted">Total</p>
              </div>
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-2xl font-bold text-danger">{num(a?.openDisputes)}</p>
                <p className="text-[10px] text-muted">Open Disputes</p>
              </div>
              <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-3 text-center">
                <p className="text-2xl font-bold text-warning">{num(a?.overduePayments)}</p>
                <p className="text-[10px] text-muted">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Applications */}
        <Card>
          <CardHeader><CardTitle>Applications</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Total Applications</span>
                <span className="text-sm font-bold text-primary-dark dark:text-white">{num(a?.totalApplications)}</span>
              </div>
              {Object.entries(applicationsByStatus).length > 0 ? (
                <DonutChart size={90} stroke={10} segments={Object.entries(applicationsByStatus).map(([s, c], i) => ({
                  label: s.replace(/_/g, ' '), value: c,
                  color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5],
                }))} />
              ) : <EmptyState preset="agreements" title="No applications yet" compact />}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ─── Platform Analytics (Gov / Admin) ─── */

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6']

function PlatformAnalytics() {
  const { data: analytics, isLoading } = usePlatformAnalytics()
  const user = useAuthStore((s) => s.user)
  const canSeeRegistryStats =
    user?.activeRole === 'admin' || user?.activeRole === 'super_admin'

  if (isLoading) return <DashboardSkeleton />

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = analytics as Record<string, any> | undefined
  const users = d?.users ?? {}
  const props = d?.properties ?? {}
  const agr = d?.agreements ?? {}
  const pay = d?.payments ?? {}
  const dis = d?.disputes ?? {}
  const apps = d?.applications ?? {}
  const rev = d?.reviews ?? {}
  const credit = d?.creditScores ?? {}
  const inv = d?.investments ?? {}
  const lo = d?.loans ?? {}
  const sav = d?.savings ?? {}

  const monthlyVolume = (pay.monthlyVolume ?? {}) as Record<string, number>
  const months = Object.entries(monthlyVolume).sort(([a], [b]) => a.localeCompare(b)).slice(-12)
  const maxVol = Math.max(...months.map(([, v]) => v), 1)

  const rentByType = (props.avgRentByType ?? {}) as Record<string, number>
  const maxRent = Math.max(...Object.values(rentByType), 1)

  const regions = (props.regions ?? {}) as Record<string, number>
  const maxRegion = Math.max(...Object.values(regions), 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-dark">Platform Analytics</h1>
        <p className="text-sm text-muted mt-1">National rental market insights</p>
      </div>

      {/* Top KPIs */}
      <div className="stagger-3d grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Users" value={String(users.total ?? 0)} icon={<Users size={18} />} sub={`${users.verified ?? 0} verified`} accent="#2563eb" />
        <StatCard label="Properties" value={String(props.total ?? 0)} icon={<Building2 size={18} />} sub={`Avg rent: ${formatCurrency(props.avgRent ?? 0)}`} accent="#7c3aed" />
        <StatCard label="Payment Volume" value={formatCurrency(pay.completedVolume ?? 0)} icon={<TrendingUp size={18} />} sub={`${pay.total ?? 0} transactions`} accent="#059669" />
        <StatCard label="Open Disputes" value={String(dis.open ?? 0)} icon={<AlertTriangle size={18} />} sub={`${dis.resolutionRate ?? 0}% resolved`} accent="#dc2626" />
      </div>

      <div className="stagger-3d grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Active Agreements" value={String(agr.byStatus?.active ?? 0)} icon={<FileText size={18} />} sub={`${agr.total ?? 0} total`} accent="#059669" />
        <StatCard label="Applications" value={String(apps.total ?? 0)} icon={<Briefcase size={18} />} sub={`${apps.approvalRate ?? 0}% approval rate`} accent="#2563eb" />
        <StatCard label="Avg. Rating" value={`${rev.avgRating ?? 0} / 5`} icon={<Star size={18} />} sub={`${rev.total ?? 0} reviews`} accent="#d97706" />
        <StatCard label="Avg. Credit Score" value={String(credit.avgScore ?? 0)} icon={<Shield size={18} />} sub={`${credit.total ?? 0} scored`} accent="#4f46e5" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Monthly Volume */}
        <Card>
          <CardHeader><CardTitle>Monthly Payment Volume</CardTitle></CardHeader>
          <CardContent>
            {months.length > 0 ? (
              <div className="space-y-2.5">
                {months.map(([month, amount]) => (
                  <HBar key={month} label={month} value={amount} max={maxVol} suffix={formatCurrency(amount)} />
                ))}
              </div>
            ) : <p className="text-sm text-muted text-center py-6">No payment data</p>}
          </CardContent>
        </Card>

        {/* Rent by Type */}
        <Card>
          <CardHeader><CardTitle>Avg. Rent by Property Type</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(rentByType).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(rentByType).sort(([, a], [, b]) => b - a).map(([type, avg]) => (
                  <HBar key={type} label={type.replace(/_/g, ' ')} value={avg} max={maxRent} color="bg-secondary/80" suffix={formatCurrency(avg)} />
                ))}
              </div>
            ) : <EmptyState preset="general" title="No data" compact />}
          </CardContent>
        </Card>

        {/* Users by Role */}
        <Card>
          <CardHeader><CardTitle>Users by Role</CardTitle></CardHeader>
          <CardContent>
            <DonutChart segments={Object.entries(users.byRole ?? {}).map(([role, count], i) => ({
              label: role.replace(/_/g, ' '), value: count as number, color: COLORS[i % COLORS.length],
            }))} />
          </CardContent>
        </Card>

        {/* Property Status */}
        <Card>
          <CardHeader><CardTitle>Property Status</CardTitle></CardHeader>
          <CardContent>
            <DonutChart segments={Object.entries(props.byStatus ?? {}).map(([status, count], i) => ({
              label: status.replace(/_/g, ' '), value: count as number, color: COLORS[i % COLORS.length],
            }))} />
          </CardContent>
        </Card>

        {/* Disputes */}
        <Card>
          <CardHeader><CardTitle>Disputes by Category</CardTitle></CardHeader>
          <CardContent>
            <DonutChart segments={Object.entries(dis.byCategory ?? {}).map(([cat, count], i) => ({
              label: cat.replace(/_/g, ' '), value: count as number,
              color: ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'][i % 6],
            }))} />
          </CardContent>
        </Card>

        {/* Regional Distribution */}
        <Card>
          <CardHeader><CardTitle>Regional Distribution</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(regions).length > 0 ? (
              <div className="space-y-2.5">
                {Object.entries(regions).sort(([, a], [, b]) => b - a).slice(0, 10).map(([region, count]) => (
                  <HBar key={region} label={region} value={count} max={maxRegion} color="bg-emerald-500/80 dark:bg-emerald-400/80" />
                ))}
              </div>
            ) : <p className="text-sm text-muted text-center py-6">No regional data</p>}
          </CardContent>
        </Card>

        {/* Payment Status */}
        <Card>
          <CardHeader><CardTitle>Payment Breakdown</CardTitle></CardHeader>
          <CardContent>
            <DonutChart segments={Object.entries(pay.byStatus ?? {}).map(([status, count], i) => ({
              label: status.replace(/_/g, ' '), value: count as number, color: COLORS[i % COLORS.length],
            }))} />
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader><CardTitle>Payment Methods</CardTitle></CardHeader>
          <CardContent>
            <DonutChart segments={Object.entries(pay.byMethod ?? {}).map(([method, count], i) => ({
              label: method.replace(/_/g, ' '), value: count as number, color: COLORS[i % COLORS.length],
            }))} />
          </CardContent>
        </Card>
      </div>

      {/* Financial row */}
      <div className="stagger-3d grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Invested" value={formatCurrency(inv.totalInvested ?? 0)} icon={<TrendingUp size={18} />} sub={`${inv.total ?? 0} investments`} accent="#059669" />
        <StatCard label="Expected Returns" value={formatCurrency(inv.totalExpectedReturn ?? 0)} icon={<DollarSign size={18} />} accent="#059669" />
        <StatCard label="Loans Disbursed" value={formatCurrency(lo.totalDisbursed ?? 0)} icon={<Scale size={18} />} sub={`${lo.defaultRate ?? 0}% default rate`} accent="#7c3aed" />
        <StatCard label="Total Saved" value={formatCurrency(sav.totalSaved ?? 0)} icon={<PiggyBank size={18} />} sub={`${sav.activeSavers ?? 0} active savers`} accent="#059669" />
      </div>

      {/* Bottom gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <ProgressRing
              value={props.total > 0 ? Math.round(((props.byStatus?.occupied ?? 0) / props.total) * 100) : 0}
              label="Occupancy Rate"
              color="#10b981"
              detail={`${props.byStatus?.occupied ?? 0}/${props.total ?? 0} properties`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <ProgressRing value={dis.resolutionRate ?? 0} label="Dispute Resolution" color="#f59e0b" detail={`${(dis.byStatus?.resolved ?? 0) + (dis.byStatus?.closed ?? 0)} resolved`} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <ProgressRing value={apps.approvalRate ?? 0} label="Application Approval" color="#3b82f6" detail={`${apps.byStatus?.approved ?? 0} approved`} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <ProgressRing value={sav.savingsProgress ?? 0} label="Savings Progress" color="#8b5cf6" detail={`${formatCurrency(sav.totalSaved ?? 0)} of ${formatCurrency(sav.totalTargeted ?? 0)}`} />
          </CardContent>
        </Card>
      </div>

      {/* Credit Score distribution */}
      <Card>
        <CardHeader><CardTitle>Credit Score Distribution</CardTitle></CardHeader>
        <CardContent>
          <DonutChart segments={[
            { label: 'Excellent (80-100)', value: credit.brackets?.excellent ?? 0, color: '#10b981' },
            { label: 'Good (60-79)', value: credit.brackets?.good ?? 0, color: '#3b82f6' },
            { label: 'Fair (40-59)', value: credit.brackets?.fair ?? 0, color: '#f59e0b' },
            { label: 'Poor (0-39)', value: credit.brackets?.poor ?? 0, color: '#ef4444' },
          ]} />
        </CardContent>
      </Card>

      {/* Public Registry analytics — admin/super_admin only */}
      {canSeeRegistryStats && <PublicRegistryAnalytics />}
    </div>
  )
}

function PublicRegistryAnalytics() {
  const { data, isLoading, isError } = useRegistryStats()

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Public Registry — Last 30 Days</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted text-center py-6">Loading registry analytics…</p>
        </CardContent>
      </Card>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader><CardTitle>Public Registry — Last 30 Days</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted text-center py-6">Could not load registry analytics.</p>
        </CardContent>
      </Card>
    )
  }

  const trend = data.dailyTrend ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public Registry — Last 30 Days</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="stagger-3d grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
          <StatCard
            label="Total Pageviews"
            value={String(data.totalViews ?? 0)}
            icon={<Eye size={18} />}
            sub="Last 30 days"
            accent="#2563eb"
          />
          <StatCard
            label="Unique Viewers"
            value={String(data.uniqueViewers ?? 0)}
            icon={<Globe2 size={18} />}
            sub="Distinct IP hashes"
            accent="#7c3aed"
          />
          <StatCard
            label="Top Property"
            value={data.topProperties?.[0]?.title ?? '—'}
            icon={<Building2 size={18} />}
            sub={data.topProperties?.[0] ? `${data.topProperties[0].views} views` : 'No views yet'}
            accent="#c9a227"
          />
        </div>

        {/* Daily trend chart */}
        <div className="h-56 w-full">
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="registryViewsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d: string) => d.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: '12px', borderRadius: 8 }}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="views"
                  stroke="#3b82f6"
                  fill="url(#registryViewsGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted text-center py-6">No views in the last 30 days</p>
          )}
        </div>

        {/* Top properties leaderboard */}
        {data.topProperties && data.topProperties.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted dark:text-white/50 mb-3">
              Top 10 Properties
            </h3>
            <div className="space-y-2">
              {data.topProperties.map((row, i) => (
                <div
                  key={row.propertyId}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface dark:bg-[#0c0e1a] px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 dark:bg-blue-500/15 text-[10px] font-bold text-primary dark:text-blue-400 shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-xs font-medium text-primary-dark dark:text-white truncate">
                      {row.title}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-primary-dark dark:text-white shrink-0 inline-flex items-center gap-1">
                    <Eye size={11} />
                    {row.views}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
