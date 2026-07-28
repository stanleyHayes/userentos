import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { DashboardHero, DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency } from '@/lib/utils'
import { Wrench, Star, CheckCircle2, Calendar, Banknote, Plus, Loader2 } from 'lucide-react'

interface WorkerProfile {
  _id: string
  userId?: string
  name: string
  trades: string[]
  location: string
  status: string
  rating: number
  completedJobs: number
  hourlyRate?: number
  verificationLevel?: string
}

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

export function ServiceProviderDashboard() {
  const user = useAuthStore((s) => s.user)

  // There is no GET /workers/me — the list endpoint exposes available/busy
  // workers (new profiles default to 'available'), so find our own by userId.
  const { data: workersData, isLoading: workerLoading } = useQuery({
    queryKey: ['workers', 'me', user?.id],
    queryFn: () => api.get<{ items: WorkerProfile[] }>('/workers?limit=50'),
    enabled: !!user,
  })
  const worker = workersData?.items.find((w) => w.userId === user?.id) ?? null

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
