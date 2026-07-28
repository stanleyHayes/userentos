import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { DashboardHero, DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { useAuthStore } from '@/stores/authStore'
import { useMyWorker, useMyEarnings, useUpdateWorker, type WorkerAvailability } from '@/hooks/useProvider'
import { cn, formatCurrency } from '@/lib/utils'
import { Wrench, Star, CheckCircle2, Calendar, Banknote, Plus, Loader2, Wallet, Briefcase, Pencil, X, Check } from 'lucide-react'

interface Booking {
  _id: string
  type: string
  description: string
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'disputed'
  scheduledDate?: string
  quoteAmount?: number
  createdAt: string
}

const STATUS_VARIANTS: Record<string, 'warning' | 'default' | 'success' | 'danger' | 'muted'> = {
  pending: 'warning',
  confirmed: 'default',
  in_progress: 'default',
  completed: 'success',
  cancelled: 'muted',
  disputed: 'danger',
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
type Day = (typeof DAYS)[number]
const TIME_SLOTS = ['08:00-12:00', '12:00-16:00', '16:00-20:00'] as const

const EMPTY_AVAILABILITY: WorkerAvailability = {
  monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
}

export function ServiceProviderDashboard() {
  const user = useAuthStore((s) => s.user)

  const { data: worker, isLoading: workerLoading } = useMyWorker()
  const { data: earnings } = useMyEarnings(!!worker)
  const updateWorker = useUpdateWorker()

  const [editingAvailability, setEditingAvailability] = useState(false)
  const [availabilityDraft, setAvailabilityDraft] = useState<WorkerAvailability>(EMPTY_AVAILABILITY)

  const { data: bookingsData } = useQuery({
    queryKey: ['my-bookings', 'worker'],
    queryFn: () => api.get<{ items: Booking[] }>('/service-bookings?asWorker=true'),
    enabled: !!worker,
  })
  const bookings = bookingsData?.items ?? []
  const pendingJobs = bookings.filter((b) => b.status === 'pending')
  const activeJobs = bookings.filter((b) => b.status === 'confirmed' || b.status === 'in_progress')

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const availability = worker?.availability ?? EMPTY_AVAILABILITY

  // Last 6 calendar months (oldest → newest), filling gaps with zero so the
  // bar chart always renders a full half-year even with no completed jobs.
  const earningsMonths = (() => {
    const now = new Date()
    const result: { key: string; label: string; total: number; jobs: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const hit = earnings?.byMonth.find((m) => m.month === key)
      result.push({
        key,
        label: d.toLocaleString('en-GH', { month: 'short' }),
        total: hit?.total ?? 0,
        jobs: hit?.jobs ?? 0,
      })
    }
    return result
  })()
  const maxMonthTotal = Math.max(...earningsMonths.map((m) => m.total), 1)

  function startEditingAvailability() {
    setAvailabilityDraft({ ...EMPTY_AVAILABILITY, ...availability })
    setEditingAvailability(true)
  }

  function toggleDay(day: Day) {
    setAvailabilityDraft((p) => ({
      ...p,
      // Enabling a day pre-selects all slots; the worker can uncheck below.
      [day]: p[day].length > 0 ? [] : [...TIME_SLOTS],
    }))
  }

  function toggleSlot(day: Day, slot: string) {
    setAvailabilityDraft((p) => ({
      ...p,
      [day]: p[day].includes(slot) ? p[day].filter((s) => s !== slot) : [...p[day], slot],
    }))
  }

  function saveAvailability() {
    if (!worker) return
    updateWorker.mutate(
      { id: worker._id, body: { availability: availabilityDraft } },
      { onSuccess: () => setEditingAvailability(false) },
    )
  }

  if (workerLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  if (!worker) {
    return (
      <div className="space-y-4 max-w-2xl">
        <DashboardHero
          eyebrow="Service provider portal"
          title={`Welcome, ${user?.firstName ?? 'there'}`}
          description="Set up your worker profile to start receiving booking requests"
          tone="landlord"
          watermarkIcon={Wrench}
        />
        <Card>
          <CardContent className="p-8 text-center">
            <Wrench size={28} className="mx-auto text-muted/40 mb-2" />
            <p className="text-sm font-semibold text-primary-dark dark:text-white">Complete your worker profile</p>
            <p className="text-xs text-muted dark:text-gray-500 mt-1 mb-4">Add your trades, location, and rates so clients can find and book you</p>
            <Link to="/workers/join"><Button><Plus size={14} /> Create Worker Profile</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Service provider portal"
        title={`${greeting}, ${user?.firstName ?? 'there'}`}
        description={`${worker.trades.join(', ')} · ${worker.location}`}
        tone="landlord"
        watermarkIcon={Wrench}
        actions={
          <Badge variant={worker.status === 'available' ? 'success' : 'warning'} className="text-[10px] capitalize">
            {worker.status}
          </Badge>
        }
      />

      <div className="stagger-3d grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <DashboardMetricCard label="Rating" value={worker.rating > 0 ? worker.rating.toFixed(1) : '-'} sub={worker.rating > 0 ? 'From completed jobs' : 'No ratings yet'} accent="#f59e0b" icon={<Star size={18} />} href="/bookings" />
        <DashboardMetricCard label="Completed Jobs" value={String(worker.completedJobs)} sub="All time" accent="#10b981" icon={<CheckCircle2 size={18} />} href="/bookings" />
        <DashboardMetricCard label="Pending Requests" value={String(pendingJobs.length)} sub={`${activeJobs.length} active`} accent="#3b82f6" icon={<Calendar size={18} />} href="/bookings" />
        <DashboardMetricCard label="Hourly Rate" value={worker.hourlyRate ? formatCurrency(worker.hourlyRate) : '-'} sub={worker.hourlyRate ? 'Per hour' : 'Not set'} accent="#8b5cf6" icon={<Banknote size={18} />} href="/workers/join" />
      </div>

      {/* Earnings */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-primary-dark dark:text-white flex items-center gap-2">
          <Wallet size={16} className="text-primary" /> Earnings
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <DashboardMetricCard label="Total Earned" value={earnings ? formatCurrency(earnings.totalEarned) : '-'} sub="From completed jobs" accent="#10b981" icon={<Banknote size={18} />} />
          <DashboardMetricCard label="Pending Payout" value={earnings ? formatCurrency(earnings.pendingPayout) : '-'} sub="Awaiting payment" accent="#f59e0b" icon={<Wallet size={18} />} />
          <DashboardMetricCard label="Completed Jobs" value={earnings ? String(earnings.completedJobs) : '-'} sub="All time" accent="#3b82f6" icon={<CheckCircle2 size={18} />} />
          <DashboardMetricCard label="Active Jobs" value={earnings ? String(earnings.activeJobs) : '-'} sub="Confirmed or in progress" accent="#8b5cf6" icon={<Briefcase size={18} />} />
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {/* Per job-type breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Earnings by Job Type</CardTitle>
            </CardHeader>
            <CardContent>
              {!earnings || earnings.byType.length === 0 ? (
                <p className="text-xs text-muted dark:text-gray-500">No completed jobs yet — earnings per job type will appear here.</p>
              ) : (
                <div className="space-y-1.5">
                  {earnings.byType.map((t) => (
                    <div key={t.type} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-surface dark:bg-[#0c0e1a]">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-primary-dark dark:text-white capitalize truncate">{t.type.replace(/_/g, ' ')}</p>
                        <p className="text-[11px] text-muted dark:text-gray-500">{t.jobs} job{t.jobs === 1 ? '' : 's'}</p>
                      </div>
                      <span className="text-sm font-bold text-primary-dark dark:text-white flex-shrink-0">{formatCurrency(t.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Last 6 months bar visualization */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Last 6 Months</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-32">
                {earningsMonths.map((m) => (
                  <div key={m.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <span className="text-[9px] text-muted dark:text-gray-500 truncate">
                      {m.total > 0 ? formatCurrency(m.total) : ''}
                    </span>
                    <div className="w-full flex-1 flex items-end rounded-lg bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                      <div
                        className="w-full bg-primary dark:bg-blue-400 rounded-t-lg transition-all duration-500"
                        style={{ height: `${Math.max(m.total > 0 ? 6 : 0, Math.round((m.total / maxMonthTotal) * 100))}%` }}
                        title={`${m.label}: ${formatCurrency(m.total)} across ${m.jobs} job${m.jobs === 1 ? '' : 's'}`}
                      />
                    </div>
                    <span className="text-[10px] text-muted dark:text-gray-500">{m.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Availability */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Availability</CardTitle>
            {editingAvailability ? (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditingAvailability(false)} disabled={updateWorker.isPending}>
                  <X size={12} /> Cancel
                </Button>
                <Button size="sm" onClick={saveAvailability} disabled={updateWorker.isPending}>
                  {updateWorker.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={startEditingAvailability}>
                <Pencil size={12} /> Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {DAYS.map((day) => {
              const slots = editingAvailability ? availabilityDraft[day] : (availability[day] ?? [])
              const enabled = slots.length > 0
              return (
                <div key={day} className="flex items-start gap-3 p-2 rounded-lg bg-surface dark:bg-[#0c0e1a]">
                  <span className="text-xs font-semibold text-primary-dark dark:text-white capitalize w-20 flex-shrink-0 pt-1">{day}</span>
                  {editingAvailability ? (
                    <div className="flex-1 space-y-1.5">
                      <button
                        onClick={() => toggleDay(day)}
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors',
                          enabled
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        )}
                      >
                        {enabled ? 'Available' : 'Off'}
                      </button>
                      {enabled && (
                        <div className="flex flex-wrap gap-1.5">
                          {TIME_SLOTS.map((slot) => {
                            const checked = slots.includes(slot)
                            return (
                              <label
                                key={slot}
                                className={cn(
                                  'flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] cursor-pointer border transition-colors',
                                  checked
                                    ? 'bg-primary/10 text-primary border-primary dark:bg-blue-500/15 dark:text-blue-400'
                                    : 'text-muted border-border dark:border-[#252a3a] hover:border-primary'
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSlot(day, slot)}
                                  className="rounded w-3 h-3"
                                />
                                {slot}
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className={cn('text-xs pt-1', enabled ? 'text-primary-dark dark:text-white' : 'text-muted dark:text-gray-500')}>
                      {enabled ? slots.join(', ') : 'Unavailable'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Recent Bookings</CardTitle>
            <Link to="/bookings"><span className="text-[11px] text-primary dark:text-blue-400 hover:underline">View all</span></Link>
          </div>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <EmptyState preset="agreements" title="No bookings yet" description="Booking requests from clients will appear here." action={{ label: 'View My Jobs', href: '/bookings' }} compact />
          ) : (
            <div className="space-y-1.5">
              {bookings.slice(0, 5).map((b) => (
                <Link key={b._id} to="/bookings" className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-surface dark:hover:bg-[#0c0e1a]">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-primary-dark dark:text-white truncate capitalize">{b.type}</p>
                    <p className="text-[11px] text-muted dark:text-gray-500 truncate">
                      {b.description}
                      {b.scheduledDate && ` · ${b.scheduledDate}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {b.quoteAmount !== undefined && (
                      <span className="text-sm font-bold text-primary-dark dark:text-white">{formatCurrency(b.quoteAmount)}</span>
                    )}
                    <Badge variant={STATUS_VARIANTS[b.status] ?? 'default'} className="text-[9px] capitalize">{b.status.replace('_', ' ')}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
