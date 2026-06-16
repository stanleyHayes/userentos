import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  Wrench, Star, MapPin, Phone, Search, Loader2, ShieldCheck,
  AlertCircle, CheckCircle, Clock, User, Eye, Briefcase,
} from 'lucide-react'
import { BookingModal } from './BookingModal'

interface MaintenanceRequest {
  id: string
  title: string
  description: string
  category: string
}

interface Worker {
  _id: string
  name: string
  phone: string
  photo?: string
  trades: string[]
  skills: string[]
  bio: string
  location: string
  hourlyRate?: number
  rating: number
  reviewCount: number
  completedJobs: number
  verificationLevel: 'none' | 'basic' | 'verified' | 'premium'
  emergencyAvailable: boolean
  status: 'available' | 'busy' | 'offline'
}

const TRADE_OPTIONS = [
  { value: '', label: 'All trades' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'painting', label: 'Painting' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'tiling', label: 'Tiling' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'hvac', label: 'HVAC / AC Repair' },
  { value: 'security', label: 'Security Systems' },
  { value: 'gardening', label: 'Gardening / Landscaping' },
  { value: 'appliance', label: 'Appliance Repair' },
  { value: 'pest', label: 'Pest Control' },
]

export function WorkerMarketplacePage() {
  const [searchParams] = useSearchParams()
  const maintenanceId = searchParams.get('maintenanceId')
  const [filters, setFilters] = useState({
    trade: searchParams.get('trade') ?? '',
    location: searchParams.get('location') ?? '',
    emergency: searchParams.get('emergency') === 'true',
    verified: false,
    minRating: '',
  })
  const [page, setPage] = useState(1)
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null)
  const navigate = useNavigate()

  const { data: prefillMaintenance, error: prefillError } = useQuery({
    queryKey: ['maintenance', maintenanceId],
    queryFn: () => api.get<MaintenanceRequest>(`/maintenance/${maintenanceId}`),
    enabled: !!maintenanceId,
    retry: false,
  })

  // If the linked maintenance request can't be loaded (e.g. a non-owner requester),
  // surface it rather than silently dropping the booking context.
  useEffect(() => {
    if (prefillError) {
      toast.error('Could not load the linked maintenance request — your booking will not be linked to it.')
    }
  }, [prefillError])

  const { data, isLoading } = useQuery({
    queryKey: ['workers', filters, page],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.trade) params.set('trade', filters.trade)
      if (filters.location) params.set('location', filters.location)
      if (filters.emergency) params.set('emergency', 'true')
      if (filters.verified) params.set('verified', 'true')
      if (filters.minRating) params.set('minRating', filters.minRating)
      params.set('page', String(page))
      params.set('limit', '20')
      return api.get<{ items: Worker[]; pagination: { page: number; limit: number; total: number; pages: number } }>(`/workers?${params.toString()}`)
    },
  })

  const workers = data?.items ?? []
  const pagination = data?.pagination

  function handleBook(worker: Worker) {
    setSelectedWorker(worker)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-dark dark:text-white flex items-center gap-2">
            <Wrench className="text-primary" size={24} />
            Essential Worker Marketplace
          </h1>
          <p className="text-muted text-sm mt-1">Find verified tradespeople for maintenance, repairs, and emergency services.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => navigate('/workers/join')}>
          <Briefcase size={14} className="mr-1" /> Become a Worker
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid md:grid-cols-5 gap-3">
          <Select id="filter-trade" label="Trade" value={filters.trade} onChange={e => setFilters(p => ({ ...p, trade: e.target.value }))} options={TRADE_OPTIONS} />
          <Input id="filter-location" label="Location" value={filters.location} onChange={e => setFilters(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Accra" />
          <Select id="filter-rating" label="Min Rating" value={filters.minRating} onChange={e => setFilters(p => ({ ...p, minRating: e.target.value }))} options={[
            { value: '', label: 'Any' },
            { value: '3', label: '3+ stars' },
            { value: '4', label: '4+ stars' },
            { value: '4.5', label: '4.5+ stars' },
          ]} />
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={filters.emergency} onChange={e => setFilters(p => ({ ...p, emergency: e.target.checked }))} className="rounded border-border" />
              <span className="text-sm text-muted">Emergency</span>
              <AlertCircle size={14} className="text-red-500" />
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={filters.verified} onChange={e => setFilters(p => ({ ...p, verified: e.target.checked }))} className="rounded border-border" />
              <span className="text-sm text-muted">Verified</span>
              <ShieldCheck size={14} className="text-green-500" />
            </label>
          </div>
          <div className="flex items-end">
            <Button onClick={() => setPage(1)} className="w-full"><Search size={16} className="mr-1" /> Search</Button>
          </div>
        </div>
      </Card>

      {/* Workers grid */}
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 size={32} className="animate-spin text-primary" /></div>
      ) : workers.length === 0 ? (
        <Card className="p-10 text-center">
          <User className="text-muted mx-auto mb-3" size={40} />
          <p className="text-muted text-sm">No workers found matching your criteria.</p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {workers.map(worker => (
            <Card key={worker._id} className="p-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  {worker.photo ? (
                    <img src={worker.photo} alt={worker.name} className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-surface dark:bg-[#0c0e1a] flex items-center justify-center">
                      <User size={28} className="text-muted" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-primary-dark dark:text-white flex items-center gap-1.5">
                        {worker.name}
                        {worker.verificationLevel !== 'none' && (
                          <ShieldCheck size={14} className={cn(
                            worker.verificationLevel === 'premium' ? 'text-purple-500'
                              : 'text-green-500'
                          )} />
                        )}
                      </h3>
                      <div className="flex items-center gap-1 text-xs text-yellow-500 mt-0.5">
                        <Star size={12} fill="currentColor" />
                        <span className="font-medium">{worker.rating.toFixed(1)}</span>
                        <span className="text-muted">({worker.reviewCount} reviews)</span>
                      </div>
                    </div>
                    {worker.emergencyAvailable && (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        <AlertCircle size={10} /> Emergency
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted mt-1 flex items-center gap-1">
                    <MapPin size={10} /> {worker.location}
                  </p>

                  <div className="flex flex-wrap gap-1 mt-2">
                    {worker.trades.map(t => (
                      <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-400">
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                    <span className="flex items-center gap-1"><CheckCircle size={10} /> {worker.completedJobs} jobs</span>
                    {worker.hourlyRate && <span className="flex items-center gap-1"><Clock size={10} /> GHS {worker.hourlyRate}/hr</span>}
                    <span className={cn(
                      'flex items-center gap-1',
                      worker.status === 'available' ? 'text-green-600 dark:text-green-400'
                        : worker.status === 'busy' ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-muted'
                    )}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', worker.status === 'available' ? 'bg-green-500' : worker.status === 'busy' ? 'bg-yellow-500' : 'bg-gray-400')} />
                      {worker.status}
                    </span>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => handleBook(worker)} className="flex-1">Book Now</Button>
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/workers/${worker._id}`)}>
                      <Eye size={14} className="mr-1" /> Profile
                    </Button>
                    <a href={`tel:${worker.phone}`} className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-border dark:border-[#252a3a] text-muted hover:text-primary-dark dark:hover:text-white text-xs font-medium transition-colors">
                      <Phone size={12} className="mr-1" /> Call
                    </a>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-muted py-1.5">Page {page} of {pagination.pages}</span>
          <Button variant="ghost" size="sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}

      {selectedWorker && (
        <BookingModal
          worker={selectedWorker}
          onClose={() => setSelectedWorker(null)}
          prefill={prefillMaintenance ? {
            id: prefillMaintenance.id,
            title: prefillMaintenance.title,
            description: prefillMaintenance.description,
            category: prefillMaintenance.category,
          } : undefined}
        />
      )}
    </div>
  )
}
