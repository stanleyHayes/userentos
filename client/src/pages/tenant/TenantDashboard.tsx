import { Link } from 'react-router-dom'
import type { Property } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useMyAnalytics, usePayments, useSavingsPlans, useAgreements, useNotifications, useDisputes, usePropertyRecommendations, useMaintenanceRequests, useMyAchievements, useMyStreak } from '@/hooks/useApi'
import { StreakRing } from '@/components/badges/StreakRing'
import { BadgeCard } from '@/components/badges/BadgeCard'
import { DashboardActionItem, DashboardActionPanel, DashboardHero, DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { formatCurrency, formatDate } from '@/lib/utils'
import { api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import {
  FileText, CreditCard, PiggyBank, Wallet, ChevronRight,
  CheckCircle, AlertTriangle, Star, Building2, Scale,
  Calendar, ArrowRight, Bell, Clock, UserCircle, Heart, Home, XCircle,
  ClipboardList, ShieldAlert, Wrench, Trophy,
} from 'lucide-react'
import { DashboardSkeleton } from '@/components/ui/Skeleton'
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'

export function TenantDashboard() {
  const user = useAuthStore((s) => s.user)
  const { data: analytics, isLoading } = useMyAnalytics()
  const { data: paymentsData } = usePayments()
  const { data: plansData } = useSavingsPlans()
  const { data: agreementsData } = useAgreements()
  const { data: notifData } = useNotifications()
  const { data: disputesData } = useDisputes()
  const { data: creditData } = useQuery({ queryKey: ['credit-score'], queryFn: () => api.get<{ score: number; factors: Record<string, number> }>('/credit/me') })
  const { data: profileData } = useQuery({ queryKey: ['tenant-profile'], queryFn: () => api.get<{ completionScore: number; profileComplete: boolean }>('/tenant-profile/me') })
  const { data: recommendations } = usePropertyRecommendations()
  const { data: maintenanceData } = useMaintenanceRequests()
  const { data: streakData } = useMyStreak()
  const { data: achievementsData } = useMyAchievements()
  const favoriteIds = useFavoritesStore((s) => s.ids)
  const favIdsKey = JSON.stringify([...favoriteIds].sort())
  const { data: favPropsItems } = useQuery({
    queryKey: ['favorite-properties-detail', favIdsKey],
    queryFn: async () => {
      const ids = useFavoritesStore.getState().ids
      if (ids.length === 0) return []
      const results = await Promise.all(
        ids.slice(0, 6).map((id) => api.get<Property & { _id?: string }>(`/properties/${id}`).catch(() => null))
      )
      return results.filter((r): r is Property & { _id?: string } => r !== null)
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
  const favPropsData = { items: (favPropsItems ?? []).filter((p) => favoriteIds.includes(p.id ?? p._id)) }

  const payments = paymentsData?.items ?? []
  const plans = plansData?.items ?? []
  const agreements = agreementsData?.items ?? []
  const notifications = (notifData?.items ?? []).filter((n) => !n.read).slice(0, 4)
  const disputes = disputesData?.items ?? []
  const completedPayments = payments.filter((p) => p.status === 'completed')
  const myMaintenance = (maintenanceData?.items ?? []).slice(0, 3)
  const recentPayments = completedPayments.slice(-8).reverse()
  const activePlan = plans.find((p) => p.status === 'active')
  const activeAgreement = agreements.find((a) => a.status === 'active')
  const openDisputes = disputes.filter((d) => d.status !== 'resolved' && d.status !== 'closed')

  if (isLoading) return <DashboardSkeleton />

  const a = analytics as Record<string, number> | undefined
  const credit = creditData as { score: number; factors: Record<string, number> } | undefined
  const creditScore = credit?.score ?? 0
  const profileScore = profileData?.completionScore ?? 0
  const profileComplete = profileData?.profileComplete ?? false

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // Payment chart
  const monthMap: Record<string, number> = {}
  for (const p of completedPayments) {
    const m = (p.paidAt ?? p.createdAt).slice(0, 7)
    monthMap[m] = (monthMap[m] ?? 0) + p.amount
  }
  const chartData = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, total]) => ({ month, total }))

  return (
    <div className="space-y-6">
      {/* === Hero greeting === */}
      <DashboardHero
        title={`${greeting}, ${user?.firstName ?? 'there'}`}
        description={
          <>
            <span className="hidden sm:inline">{new Date().toLocaleDateString('en-GH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span className="sm:hidden">{new Date().toLocaleDateString('en-GH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </>
        }
        tone="tenant"
        actions={
          <div className="hidden gap-2 md:flex">
            <Link to="/payments"><Button size="sm" className="bg-white/10 border-0 text-white hover:bg-white/20"><CreditCard size={14} /> Pay Rent</Button></Link>
            <Link to="/savings"><Button size="sm" className="bg-white/10 border-0 text-white hover:bg-white/20"><PiggyBank size={14} /> Save</Button></Link>
          </div>
        }
      >
        {!profileComplete && (
          <Link to="/my-profile" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs text-white transition-colors hover:bg-white/15">
            <div className="relative h-6 w-6">
              <svg className="h-6 w-6 -rotate-90" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" />
                <circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(profileScore / 100) * 62.8} 62.8`} />
              </svg>
            </div>
            Profile {profileScore}% complete - finish to unlock bidding
            <ChevronRight size={12} />
          </Link>
        )}
      </DashboardHero>

      {/* === KPI strip === */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <DashboardMetricCard icon={<FileText size={18} />} label="Agreements" value={String(a?.activeAgreements ?? 0)} sub="Active" accent="#3b82f6" href="/agreements" />
        <DashboardMetricCard icon={<CreditCard size={18} />} label="Next Payment" value={formatCurrency(a?.nextPaymentAmount ?? 0)} sub={activeAgreement ? `Due ${formatDate(activeAgreement.endDate).split(' ').slice(0,2).join(' ')}` : 'No active lease'} accent="#f59e0b" href="/payments" />
        <DashboardMetricCard icon={<PiggyBank size={18} />} label="Total Saved" value={formatCurrency(a?.totalSaved ?? 0)} sub={`${a?.savingsProgress ?? 0}% of target`} accent="#10b981" href="/savings" />
        <DashboardMetricCard icon={<Wallet size={18} />} label="Wallet" value={formatCurrency(a?.walletBalance ?? 0)} sub="Available balance" accent="#8b5cf6" href="/savings" />
      </div>

      {/* === Residence Status === */}
      {activeAgreement ? (
        <Link to="/agreements" className="block rounded-xl border border-accent/20 dark:border-accent/30 bg-accent/5 dark:bg-accent/8 px-4 py-3 hover:border-accent/40 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/15 dark:bg-accent/20 flex items-center justify-center flex-shrink-0">
              <Home size={18} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-primary-dark dark:text-white">Currently Residing</p>
                <Badge variant="success" className="text-[10px]">Active</Badge>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted flex-shrink-0" />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pl-12 text-xs text-muted dark:text-gray-400">
            <span>{formatCurrency(activeAgreement.rentAmount)}/mo</span>
            <span className="text-border dark:text-[#252a3a]">&middot;</span>
            <span>{formatDate(activeAgreement.startDate).split(',')[0]} - {formatDate(activeAgreement.endDate).split(',')[0]}</span>
            {activeAgreement.landlordName && (
              <>
                <span className="text-border dark:text-[#252a3a]">&middot;</span>
                <span>Landlord: <strong className="text-primary-dark dark:text-gray-300">{activeAgreement.landlordName}</strong></span>
              </>
            )}
          </div>
        </Link>
      ) : (
        <Link to="/properties" className="block rounded-xl border border-border/40 dark:border-[#252a3a]/40 bg-surface/50 dark:bg-[#0c0e1a]/40 px-4 py-3 hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted/10 dark:bg-gray-700/30 flex items-center justify-center flex-shrink-0">
              <XCircle size={18} className="text-muted dark:text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary-dark dark:text-white">No Active Lease</p>
              <p className="text-xs text-muted dark:text-gray-400 mt-0.5">You're not under any rental agreement</p>
            </div>
            <ChevronRight size={16} className="text-muted flex-shrink-0" />
          </div>
        </Link>
      )}

      {/* === Alert banners === */}
      {(Number(a?.overduePayments ?? 0) > 0 || Number(a?.pendingPayments ?? 0) > 0 || openDisputes.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {Number(a?.overduePayments ?? 0) > 0 && (
            <Link to="/payments" className="flex items-center gap-2 rounded-lg bg-danger/8 dark:bg-danger/12 border border-danger/20 px-3 py-2 hover:bg-danger/12 transition-colors">
              <ShieldAlert size={14} className="text-danger flex-shrink-0" />
              <span className="text-xs font-semibold text-danger">{a?.overduePayments} overdue payment{Number(a?.overduePayments) > 1 ? 's' : ''}</span>
              <span className="text-xs text-danger/70">({formatCurrency(Number(a?.overdueAmount ?? 0))})</span>
            </Link>
          )}
          {Number(a?.pendingPayments ?? 0) > 0 && (
            <Link to="/payments" className="flex items-center gap-2 rounded-lg bg-secondary/8 dark:bg-secondary/12 border border-secondary/20 px-3 py-2 hover:bg-secondary/12 transition-colors">
              <Clock size={14} className="text-secondary flex-shrink-0" />
              <span className="text-xs font-semibold text-secondary">{a?.pendingPayments} pending payment{Number(a?.pendingPayments) > 1 ? 's' : ''}</span>
              <span className="text-xs text-secondary/70">({formatCurrency(Number(a?.pendingAmount ?? 0))})</span>
            </Link>
          )}
          {openDisputes.length > 0 && (
            <Link to="/disputes" className="flex items-center gap-2 rounded-lg bg-warning/8 dark:bg-warning/12 border border-warning/20 px-3 py-2 hover:bg-warning/12 transition-colors">
              <AlertTriangle size={14} className="text-warning flex-shrink-0" />
              <span className="text-xs font-semibold text-warning">{openDisputes.length} open dispute{openDisputes.length > 1 ? 's' : ''}</span>
            </Link>
          )}
        </div>
      )}

      <DashboardActionPanel
        title="Today"
        description="The fastest path through rent, profile, and home tasks."
        action={{ label: 'Open dashboard', href: '/dashboard' }}
      >
        <DashboardActionItem
          title={profileComplete ? 'Profile ready' : 'Finish tenant passport'}
          description={profileComplete ? 'Your profile can be shared with landlords.' : `${profileScore}% complete - finish the missing sections before applying.`}
          icon={<UserCircle size={16} />}
          href="/my-profile"
          tone={profileComplete ? 'success' : 'warning'}
          meta={`${profileScore}%`}
        />
        <DashboardActionItem
          title={Number(a?.overduePayments ?? 0) > 0 ? 'Clear overdue rent' : 'Rent payments'}
          description={Number(a?.overduePayments ?? 0) > 0 ? `${formatCurrency(Number(a?.overdueAmount ?? 0))} needs attention.` : activeAgreement ? `Next tracked amount is ${formatCurrency(Number(a?.nextPaymentAmount ?? 0))}.` : 'Track rent and payment history.'}
          icon={<CreditCard size={16} />}
          href="/payments"
          tone={Number(a?.overduePayments ?? 0) > 0 ? 'danger' : 'default'}
        />
        <DashboardActionItem
          title={myMaintenance.length > 0 ? 'Maintenance updates' : 'Request maintenance'}
          description={myMaintenance.length > 0 ? `${myMaintenance.length} recent request${myMaintenance.length === 1 ? '' : 's'} in progress.` : 'Report repairs and keep a record.'}
          icon={<Wrench size={16} />}
          href="/maintenance"
          tone={myMaintenance.length > 0 ? 'warning' : 'accent'}
        />
        <DashboardActionItem
          title={openDisputes.length > 0 ? 'Review disputes' : 'Find a place'}
          description={openDisputes.length > 0 ? `${openDisputes.length} open case${openDisputes.length === 1 ? '' : 's'} need follow-up.` : recommendations?.length ? 'Fresh recommendations are ready.' : 'Browse available listings.'}
          icon={openDisputes.length > 0 ? <Scale size={16} /> : <Home size={16} />}
          href={openDisputes.length > 0 ? '/disputes' : '/properties'}
          tone={openDisputes.length > 0 ? 'danger' : 'success'}
        />
      </DashboardActionPanel>

      {/* === Your Streak + Recent Badges === */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Trophy size={14} className="text-orange-500" /> Your Streak</CardTitle>
              <Link to="/achievements" className="text-[11px] text-primary dark:text-blue-400 hover:underline">View all</Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <StreakRing streak={streakData?.currentStreak ?? 0} size={112} />
              <div className="flex-1 min-w-0">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2">
                    <p className="text-[10px] text-muted dark:text-gray-500">Current</p>
                    <p className="text-sm font-bold text-primary-dark dark:text-white">{streakData?.currentStreak ?? 0} mo</p>
                  </div>
                  <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2">
                    <p className="text-[10px] text-muted dark:text-gray-500">Longest</p>
                    <p className="text-sm font-bold text-primary-dark dark:text-white">{streakData?.longestStreak ?? 0} mo</p>
                  </div>
                </div>
                <Link to="/payments">
                  <Button size="sm" variant="outline" className="w-full text-xs">Keep it going!</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Badges</CardTitle>
              <Link to="/achievements" className="text-[11px] text-primary dark:text-blue-400 hover:underline">See all</Link>
            </div>
          </CardHeader>
          <CardContent>
            {(achievementsData?.items?.length ?? 0) === 0 ? (
              <div className="text-center py-6">
                <Trophy size={28} className="mx-auto text-muted/40 mb-2" />
                <p className="text-sm text-muted dark:text-gray-500">No badges yet — pay rent on time to earn your first one.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {(achievementsData?.items ?? []).slice(0, 6).map((a) => (
                  <BadgeCard
                    key={a.code}
                    title={a.title}
                    description={a.description}
                    icon={a.icon}
                    tier={a.tier}
                    earned
                    earnedAt={a.earnedAt}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* === Main 3-col grid === */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">

        {/* Left: Chart + Activity (8 cols) */}
        <div className="lg:col-span-8 space-y-6">

          {/* Payment chart + summary */}
          <Card className="overflow-hidden p-0">
            <div className="p-4 sm:p-5 pb-0">
              <div className="flex items-center justify-between mb-1 gap-2">
                <div className="min-w-0">
                  <p className="text-sm sm:text-base font-bold text-primary-dark dark:text-white tracking-tight">Rent Payments</p>
                  <p className="text-[11px] sm:text-xs text-muted dark:text-gray-500">Monthly spending overview</p>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-lg font-extrabold font-display text-primary-dark dark:text-white">{formatCurrency(completedPayments.reduce((s, p) => s + p.amount, 0))}</p>
                    <p className="text-[10px] text-muted dark:text-gray-500">Total paid</p>
                  </div>
                  <Link to="/payments">
                    <Button size="sm" variant="outline" className="text-xs gap-1"><span className="hidden sm:inline">View all</span><span className="sm:hidden">All</span> <ArrowRight size={12} /></Button>
                  </Link>
                </div>
              </div>
            </div>

            {chartData.length > 1 ? (
              <div className="h-44 sm:h-52 mt-2 min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f015" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={35} />
                    <Tooltip contentStyle={{ background: '#0c0e1a', border: '1px solid #252a3a', borderRadius: 12, color: '#e2e8f0', fontSize: 12, padding: '8px 12px' }} formatter={(value) => [formatCurrency(Number(value)), 'Paid']} cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2.5} fill="url(#areaFill)" dot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2.5 }} activeDot={{ r: 7, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2.5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-52 flex flex-col items-center justify-center text-center px-5">
                <div className="w-14 h-14 rounded-2xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center mb-3">
                  <CreditCard size={24} className="text-primary/40" />
                </div>
                <p className="text-sm font-medium text-primary-dark dark:text-white">No payments yet</p>
                <p className="text-xs text-muted dark:text-gray-500 mt-1">Your payment chart will build up here over time</p>
                <Link to="/payments"><Button size="sm" className="mt-4">Make first payment</Button></Link>
              </div>
            )}

            {/* Payment mini-cards strip */}
            {recentPayments.length > 0 && (
              <div className="px-3 sm:px-5 py-3 sm:py-4 bg-surface/50 dark:bg-[#0c0e1a]/50 border-t border-border/30 dark:border-[#252a3a]/30">
                <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-1">
                  {recentPayments.slice(0, 4).map((p) => (
                    <div key={p.id} className="flex-shrink-0 flex items-center gap-2.5 rounded-xl bg-white dark:bg-[#161927] border border-border/50 dark:border-[#252a3a]/50 px-3.5 py-2.5 min-w-[180px]">
                      <div className="w-8 h-8 rounded-lg bg-accent/10 dark:bg-accent/20 flex items-center justify-center">
                        <CheckCircle size={14} className="text-accent" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-primary-dark dark:text-white">{formatCurrency(p.amount)}</p>
                        <p className="text-[10px] text-muted dark:text-gray-500 truncate">{p.paidAt?.slice(0, 10)} - {p.method.replace('_', ' ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Recent activity — timeline style */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Activity</CardTitle>
                <span className="text-[10px] text-muted dark:text-gray-500">{recentPayments.length + openDisputes.length + notifications.length} events</span>
              </div>
            </CardHeader>
            <CardContent>
              {(recentPayments.length === 0 && openDisputes.length === 0 && notifications.length === 0) ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-2xl bg-surface dark:bg-[#0c0e1a] flex items-center justify-center mx-auto mb-3">
                    <Clock size={20} className="text-muted/40" />
                  </div>
                  <p className="text-sm text-muted dark:text-gray-500">No recent activity</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="space-y-0">
                    {(() => {
                      const items: { key: string; lineColor: string; iconBg: string; icon: React.ReactNode; title: string; detail: string; badge?: React.ReactNode; time: string }[] = [
                        ...recentPayments.slice(0, 4).map((p) => ({
                          key: p.id, lineColor: '#10b981', iconBg: 'bg-accent',
                          icon: <CheckCircle size={12} className="text-white" />,
                          title: 'Rent Payment',
                          detail: `${formatCurrency(p.amount)} via ${p.method.replace('_', ' ')}`,
                          badge: <Badge variant="success" className="text-[9px]">Paid</Badge>,
                          time: p.paidAt ? formatDate(p.paidAt) : '',
                        })),
                        ...openDisputes.slice(0, 2).map((d) => ({
                          key: d.id, lineColor: '#ef4444', iconBg: 'bg-danger',
                          icon: <AlertTriangle size={12} className="text-white" />,
                          title: d.title,
                          detail: d.description.slice(0, 60) + '...',
                          badge: <Badge variant="warning" className="text-[9px]">{d.status.replace('_', ' ')}</Badge>,
                          time: formatDate(d.createdAt),
                        })),
                        ...notifications.slice(0, 2).map((n) => ({
                          key: n.id, lineColor: '#f59e0b', iconBg: 'bg-secondary',
                          icon: <Bell size={12} className="text-white" />,
                          title: n.title,
                          detail: n.message,
                          time: formatDate(n.createdAt),
                        })),
                      ]

                      return items.map((item, i) => (
                        <TimelineItem
                          key={item.key}
                          icon={item.icon}
                          iconBg={item.iconBg}
                          title={item.title}
                          detail={item.detail}
                          badge={item.badge}
                          time={item.time}
                          lineColor={item.lineColor}
                          isLast={i === items.length - 1}
                        />
                      ))
                    })()}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-4">

          {/* Credit score ring */}
          <Card>
            <CardContent>
              <div className="flex flex-col items-center text-center">
                <div className="relative w-28 h-28 mb-3">
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-border dark:text-[#252a3a]" />
                    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(creditScore / 100) * 263.9} 263.9`} className={creditScore >= 80 ? 'text-accent' : creditScore >= 60 ? 'text-blue-500 dark:text-blue-400' : creditScore >= 40 ? 'text-secondary' : 'text-danger'} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-2xl font-extrabold font-display ${creditScore >= 80 ? 'text-accent' : creditScore >= 60 ? 'text-blue-500 dark:text-blue-400' : creditScore >= 40 ? 'text-secondary' : 'text-danger'}`}>{creditScore}</span>
                    <span className="text-[10px] text-muted dark:text-gray-500">out of 100</span>
                  </div>
                </div>
                <p className="text-sm font-bold text-primary-dark dark:text-white">Rent Credit Score</p>
                <p className={`text-xs font-semibold ${creditScore >= 80 ? 'text-accent' : creditScore >= 60 ? 'text-blue-500 dark:text-blue-400' : creditScore >= 40 ? 'text-secondary' : 'text-danger'}`}>
                  {creditScore >= 80 ? 'Excellent' : creditScore >= 60 ? 'Good' : creditScore >= 40 ? 'Fair' : 'Needs Work'}
                </p>

                {/* Mini factor bars */}
                {credit?.factors && (
                  <div className="w-full mt-4 space-y-2">
                    {[
                      { label: 'Payments', key: 'paymentHistory', max: 40 },
                      { label: 'Savings', key: 'savingsConsistency', max: 20 },
                      { label: 'Compliance', key: 'agreementCompliance', max: 20 },
                    ].map((f) => (
                      <div key={f.key} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted dark:text-gray-500 w-16 text-left">{f.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500 dark:bg-blue-400" style={{ width: `${((credit.factors[f.key] ?? 0) / f.max) * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-primary-dark dark:text-gray-300 w-8 text-right">{credit.factors[f.key] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                )}

                <Link to="/credit-score" className="text-[11px] text-primary dark:text-blue-400 hover:underline mt-3">View full breakdown</Link>
              </div>
            </CardContent>
          </Card>

          {/* Savings progress */}
          {activePlan && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Savings Goal</CardTitle>
                  <Link to="/savings"><Badge variant="success" className="cursor-pointer text-[10px]">On track</Badge></Link>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">{formatCurrency(activePlan.currentAmount)}</p>
                <p className="text-[11px] text-muted dark:text-gray-500 mb-3">of {formatCurrency(activePlan.targetAmount)} target</p>
                <div className="h-2.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-accent to-emerald-400" style={{ width: `${Math.min(100, (activePlan.currentAmount / activePlan.targetAmount) * 100)}%` }} />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-accent font-semibold">{Math.min(100, Math.round((activePlan.currentAmount / activePlan.targetAmount) * 100))}%</span>
                  <span className="text-[10px] text-muted dark:text-gray-500">Due {formatDate(activePlan.targetDate)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Active lease */}
          {activeAgreement && (
            <Card>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                    <FileText size={18} className="text-primary dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-primary-dark dark:text-white">Active Lease</p>
                    <p className="text-lg font-extrabold font-display text-primary dark:text-blue-400">{formatCurrency(activeAgreement.rentAmount)}<span className="text-xs font-normal text-muted dark:text-gray-400">/mo</span></p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="Start" value={formatDate(activeAgreement.startDate).split(',')[0]} icon={<Calendar size={12} />} />
                  <MiniStat label="End" value={formatDate(activeAgreement.endDate).split(',')[0]} icon={<Calendar size={12} />} />
                  <MiniStat label="Advance" value={`${activeAgreement.advanceMonths} months`} icon={<Clock size={12} />} />
                  <MiniStat label="Status" value="Active" icon={<CheckCircle size={12} className="text-accent" />} />
                </div>
              </CardContent>
            </Card>
          )}

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
                    <Link key={n.id} to={n.actionUrl ?? '#'} className="flex items-start gap-2.5 group">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 mt-2 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-primary-dark dark:text-white group-hover:text-primary dark:group-hover:text-blue-400 transition-colors truncate">{n.title}</p>
                        <p className="text-[10px] text-muted dark:text-gray-500 truncate">{n.message}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* My Maintenance Requests */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Wrench size={14} className="text-primary dark:text-blue-400" /> My Maintenance Requests
                </CardTitle>
                <Link to="/maintenance" className="text-[11px] text-primary dark:text-blue-400 hover:underline">View all</Link>
              </div>
            </CardHeader>
            <CardContent>
              {myMaintenance.length > 0 ? (
                <div className="space-y-2">
                  {myMaintenance.map((m) => (
                    <Link key={m.id} to="/maintenance" className="flex items-start gap-2.5 group">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Wrench size={12} className="text-primary dark:text-blue-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-primary-dark dark:text-white truncate group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">{m.title}</p>
                        <p className="text-[10px] text-muted dark:text-gray-500 capitalize">{m.status.replace('_', ' ')} &middot; {m.priority}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-3">
                  <Wrench size={20} className="mx-auto text-muted/30 mb-2" />
                  <p className="text-xs text-muted dark:text-gray-500">No maintenance requests</p>
                  <Link to="/maintenance" className="text-[11px] text-primary dark:text-blue-400 hover:underline mt-1 inline-block">Report an issue</Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick links — gradient tiles */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {[
              { label: 'Properties', desc: 'Browse rentals', icon: <Building2 size={20} />, href: '/properties', gradient: 'from-primary/10 to-blue-500/10 dark:from-primary/20 dark:to-blue-500/20', iconColor: 'text-primary dark:text-blue-400' },
              { label: 'Rental Laws', desc: 'Know your rights', icon: <Scale size={20} />, href: '/legal', gradient: 'from-violet-500/10 to-purple-500/10 dark:from-violet-500/20 dark:to-purple-500/20', iconColor: 'text-violet-500' },
              { label: 'Disputes', desc: 'File or track', icon: <AlertTriangle size={20} />, href: '/disputes', gradient: 'from-secondary/10 to-amber-500/10 dark:from-secondary/20 dark:to-amber-500/20', iconColor: 'text-secondary' },
              { label: 'My Profile', desc: `${profileScore}% complete`, icon: <UserCircle size={20} />, href: '/my-profile', gradient: 'from-accent/10 to-emerald-500/10 dark:from-accent/20 dark:to-emerald-500/20', iconColor: 'text-accent' },
            ].map((link) => (
              <Link key={link.label} to={link.href} className={`group rounded-2xl bg-gradient-to-br ${link.gradient} border border-border/30 dark:border-[#252a3a]/30 p-4 hover:shadow-lg dark:hover:shadow-black/20 hover:-translate-y-0.5 transition-all`}>
                <div className={`${link.iconColor} mb-2 group-hover:scale-110 transition-transform`}>{link.icon}</div>
                <p className="text-xs font-bold text-primary-dark dark:text-white">{link.label}</p>
                <p className="text-[10px] text-muted dark:text-gray-500">{link.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recommended Properties */}
      {(recommendations?.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-primary-dark dark:text-white flex items-center gap-2">
              <Star size={16} className="text-secondary" /> Recommended for You
            </h3>
            <Link to="/properties" className="text-xs text-primary dark:text-blue-400 hover:underline flex items-center gap-1">View all <ChevronRight size={12} /></Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(recommendations as Array<Property & { _id?: string }> | undefined ?? []).slice(0, 3).map((p) => (
              <Link key={p.id ?? p._id} to={`/properties/${p.id ?? p._id}`}>
                <Card className="group hover:shadow-lg dark:hover:shadow-black/20 hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden">
                  <CardContent>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-secondary/10 dark:bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                        <Building2 size={16} className="text-secondary dark:text-amber-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-primary-dark dark:text-white truncate group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">{p.title}</p>
                        <p className="text-xs text-muted dark:text-gray-500 truncate">{p.address?.city}, {p.address?.region}</p>
                        <p className="text-sm font-bold text-primary dark:text-blue-400 mt-1">{formatCurrency(p.rentAmount)}<span className="text-[10px] font-normal text-muted dark:text-gray-500">/mo</span></p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Saved Properties */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-primary-dark dark:text-white flex items-center gap-2">
            <Heart size={16} className="text-danger" /> Saved Properties
          </h3>
          <Link to="/properties" className="text-xs text-primary dark:text-blue-400 hover:underline flex items-center gap-1">Browse all <ChevronRight size={12} /></Link>
        </div>
        {(favPropsData?.items?.length ?? 0) > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {favPropsData!.items.slice(0, 3).map((p) => (
              <Link key={p.id ?? p._id} to={`/properties/${p.id ?? p._id}`}>
                <Card className="group hover:shadow-lg dark:hover:shadow-black/20 hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden">
                  <CardContent>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                        <Building2 size={16} className="text-primary dark:text-blue-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-primary-dark dark:text-white truncate group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">{p.title}</p>
                        <p className="text-xs text-muted dark:text-gray-500 truncate">{p.address?.city}, {p.address?.region}</p>
                        <p className="text-sm font-bold text-primary dark:text-blue-400 mt-1">{formatCurrency(p.rentAmount)}<span className="text-[10px] font-normal text-muted dark:text-gray-500">/mo</span></p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent>
              <div className="text-center py-4">
                <Heart size={24} className="mx-auto text-muted dark:text-gray-600 mb-2" />
                <p className="text-sm font-semibold text-primary-dark dark:text-white">No saved properties yet</p>
                <p className="text-xs text-muted dark:text-gray-500 mt-1">Browse listings and tap the heart icon to save properties you like.</p>
                <Link to="/properties" className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-primary dark:text-blue-400 hover:underline">
                  <Building2 size={12} /> Explore Properties <ArrowRight size={12} />
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* === Bottom row: Applications, Payment Stats, Rental History === */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Applications Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">My Applications</CardTitle>
              <Badge variant={Number(a?.pendingApplications ?? 0) > 0 ? 'warning' : 'muted'} className="text-[10px]">{a?.totalApplications ?? 0} total</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {Number(a?.totalApplications ?? 0) > 0 ? (
              <div className="space-y-2.5">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {Object.entries((a as Record<string, any> | undefined)?.applicationsByStatus as Record<string, any> | undefined ?? {}).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${status === 'approved' ? 'bg-accent' : status === 'pending' ? 'bg-secondary' : status === 'rejected' ? 'bg-danger' : 'bg-muted'}`} />
                      <span className="text-xs text-primary-dark dark:text-gray-300 capitalize">{status.replace('_', ' ')}</span>
                    </div>
                    <span className="text-xs font-bold text-primary-dark dark:text-white">{String(count)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <ClipboardList size={20} className="mx-auto text-muted/30 mb-2" />
                <p className="text-xs text-muted dark:text-gray-500">No applications yet</p>
                <Link to="/properties" className="text-[11px] text-primary dark:text-blue-400 hover:underline mt-1 inline-block">Browse properties</Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Summary */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Payment Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted dark:text-gray-400">Total Paid (all time)</span>
                <span className="text-xs font-bold text-accent">{formatCurrency(Number(a?.totalPaid ?? 0))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted dark:text-gray-400">Payments Made</span>
                <span className="text-xs font-bold text-primary-dark dark:text-white">{a?.paymentCount ?? 0}</span>
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
                <span className="text-xs text-muted dark:text-gray-400">Wallet Balance</span>
                <span className="text-xs font-bold text-violet-500">{formatCurrency(Number(a?.walletBalance ?? 0))}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rental History */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Rental History</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2.5 text-center">
                  <p className="text-lg font-extrabold font-display text-primary dark:text-blue-400">{a?.totalAgreements ?? 0}</p>
                  <p className="text-[10px] text-muted dark:text-gray-500">Total Leases</p>
                </div>
                <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2.5 text-center">
                  <p className="text-lg font-extrabold font-display text-accent">{a?.activeAgreements ?? 0}</p>
                  <p className="text-[10px] text-muted dark:text-gray-500">Active</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted dark:text-gray-400">Savings Plans</span>
                <span className="text-xs font-bold text-primary-dark dark:text-white">{a?.activePlans ?? 0} active</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted dark:text-gray-400">Savings Progress</span>
                <span className="text-xs font-bold text-accent">{a?.savingsProgress ?? 0}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted dark:text-gray-400">Open Disputes</span>
                <span className="text-xs font-bold text-danger">{a?.openDisputes ?? 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// === Sub-components ===

function TimelineItem({ icon, iconBg, title, detail, badge, time, lineColor, isLast }: {
  icon: React.ReactNode; iconBg: string; title: string; detail: string; badge?: React.ReactNode; time: string; lineColor: string; isLast: boolean
}) {
  return (
    <div className="relative flex gap-2.5 sm:gap-3.5 py-3 pl-1 group">
      {/* Colored connector line */}
      {!isLast && (
        <div
          className="absolute left-[13px] sm:left-[15px] top-[34px] sm:top-[38px] bottom-0 w-[2px] rounded-full opacity-30"
          style={{ backgroundColor: lineColor }}
        />
      )}
      <div className={`relative z-10 w-[26px] h-[26px] sm:w-[30px] sm:h-[30px] rounded-full ${iconBg} flex items-center justify-center flex-shrink-0 ring-4 ring-white dark:ring-[#161927]`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 flex-wrap">
          <p className="text-xs sm:text-sm font-semibold text-primary-dark dark:text-white truncate">{title}</p>
          {badge}
        </div>
        <p className="text-[11px] text-muted dark:text-gray-500 truncate">{detail}</p>
        <p className="text-[10px] text-muted/60 dark:text-gray-600 mt-0.5">{time}</p>
      </div>
    </div>
  )
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2.5">
      <div className="flex items-center gap-1 text-muted dark:text-gray-500 mb-0.5">{icon}<span className="text-[10px]">{label}</span></div>
      <p className="text-xs font-bold text-primary-dark dark:text-white">{value}</p>
    </div>
  )
}
