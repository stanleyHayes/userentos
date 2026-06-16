import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import {
  Wrench, Star, MapPin, Phone, ShieldCheck, CheckCircle,
  Clock, User, ArrowLeft, Loader2, AlertCircle, Quote,
} from 'lucide-react'
import { BookingModal } from './BookingModal'

interface Worker {
  _id: string
  name: string
  phone: string
  email?: string
  photo?: string
  trades: string[]
  skills: string[]
  bio: string
  location: string
  serviceRadiusKm: number
  hourlyRate?: number
  fixedRates: { service: string; price: number }[]
  availability: {
    monday: string[]
    tuesday: string[]
    wednesday: string[]
    thursday: string[]
    friday: string[]
    saturday: string[]
    sunday: string[]
  }
  status: 'available' | 'busy' | 'offline'
  verificationLevel: 'none' | 'basic' | 'verified' | 'premium'
  rating: number
  reviewCount: number
  completedJobs: number
  emergencyAvailable: boolean
}

interface Review {
  id: string
  rating: number
  review?: string
  createdAt: string
  type: string
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

export function WorkerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [showBooking, setShowBooking] = useState(false)

  const { data: worker, isLoading } = useQuery({
    queryKey: ['worker', id],
    queryFn: () => api.get<Worker>(`/workers/${id}`),
    enabled: !!id,
  })

  const { data: reviewsData } = useQuery({
    queryKey: ['worker-reviews', id],
    queryFn: () => api.get<{ reviews: Review[] }>(`/workers/${id}/reviews`),
    enabled: !!id,
  })

  const reviews = reviewsData?.reviews ?? []

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 flex justify-center">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  if (!worker) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-center">
        <Wrench className="text-muted mx-auto mb-3" size={40} />
        <p className="text-muted">Worker not found.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/workers')} className="mb-4">
        <ArrowLeft size={16} className="mr-1" /> Back
      </Button>

      {/* Profile Header */}
      <Card className="p-6 mb-4">
        <div className="flex gap-5">
          <div className="flex-shrink-0">
            {worker.photo ? (
              <img src={worker.photo} alt={worker.name} className="w-24 h-24 rounded-full object-cover" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-surface dark:bg-[#0c0e1a] flex items-center justify-center">
                <User size={40} className="text-muted" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-primary-dark dark:text-white flex items-center gap-2">
                  {worker.name}
                  {worker.verificationLevel !== 'none' && (
                    <ShieldCheck size={18} className={cn(
                      worker.verificationLevel === 'premium' ? 'text-purple-500' : 'text-green-500'
                    )} />
                  )}
                </h1>
                <div className="flex items-center gap-1 text-sm text-yellow-500 mt-1">
                  <Star size={14} fill="currentColor" />
                  <span className="font-medium">{worker.rating.toFixed(1)}</span>
                  <span className="text-muted">({worker.reviewCount} reviews)</span>
                </div>
              </div>
              <span className={cn(
                'px-2 py-1 rounded text-xs font-bold uppercase',
                worker.status === 'available' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : worker.status === 'busy' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
              )}>
                {worker.status}
              </span>
            </div>

            <p className="text-sm text-muted mt-2 flex items-center gap-1">
              <MapPin size={14} /> {worker.location} · {worker.serviceRadiusKm}km radius
            </p>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {worker.trades.map(t => (
                <span key={t} className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-400">
                  {t}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-4 mt-3 text-sm text-muted">
              <span className="flex items-center gap-1"><CheckCircle size={14} /> {worker.completedJobs} jobs done</span>
              {worker.hourlyRate && <span className="flex items-center gap-1"><Clock size={14} /> GHS {worker.hourlyRate}/hr</span>}
              {worker.emergencyAvailable && (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <AlertCircle size={14} /> Emergency available
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Bio & Skills */}
        <Card className="p-5 space-y-4">
          <h2 className="font-semibold text-primary-dark dark:text-white">About</h2>
          <p className="text-sm text-muted">{worker.bio || 'No bio provided.'}</p>

          {worker.skills.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {worker.skills.map(s => (
                  <span key={s} className="px-2 py-0.5 rounded-full text-xs bg-surface dark:bg-[#0c0e1a] text-muted border border-border dark:border-[#252a3a]">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {worker.fixedRates.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Fixed Rates</h3>
              <div className="space-y-1">
                {worker.fixedRates.map((r, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-primary-dark dark:text-white">{r.service}</span>
                    <span className="font-medium text-primary-dark dark:text-white">GHS {r.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Availability */}
        <Card className="p-5 space-y-4">
          <h2 className="font-semibold text-primary-dark dark:text-white">Availability</h2>
          <div className="space-y-2">
            {DAYS.map(day => {
              const slots = worker.availability[day] ?? []
              return (
                <div key={day} className="flex items-center justify-between text-sm">
                  <span className="text-muted capitalize w-24">{day}</span>
                  {slots.length > 0 ? (
                    <span className="text-primary-dark dark:text-white">{slots.join(', ')}</span>
                  ) : (
                    <span className="text-muted text-xs">Unavailable</span>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Contact / Book */}
      <div className="flex gap-3 mt-4">
        <Button onClick={() => setShowBooking(true)} className="flex-1" disabled={worker.status === 'offline'}>
          <Wrench size={16} className="mr-2" /> Book Service
        </Button>
        <a href={`tel:${worker.phone}`} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border dark:border-[#252a3a] px-4 py-2 text-sm font-medium text-muted hover:text-primary-dark dark:hover:text-white transition-colors">
          <Phone size={16} /> Call {worker.phone}
        </a>
      </div>

      {/* Reviews */}
      {reviews.length > 0 && (
        <Card className="p-5 mt-4 space-y-4">
          <h2 className="font-semibold text-primary-dark dark:text-white flex items-center gap-2">
            <Quote size={18} className="text-primary" /> Reviews ({reviews.length})
          </h2>
          <div className="space-y-3">
            {reviews.map((review) => (
              <div key={review.id} className="border-b border-border dark:border-[#252a3a] pb-3 last:border-0">
                <div className="flex items-center gap-1 mb-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className={cn(
                        i < review.rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'
                      )}
                    />
                  ))}
                  <span className="text-xs text-muted ml-2 capitalize">{review.type}</span>
                </div>
                {review.review && (
                  <p className="text-sm text-muted">{review.review}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {showBooking && (
        <BookingModal
          worker={{ _id: worker._id, name: worker.name, phone: worker.phone, trades: worker.trades, hourlyRate: worker.hourlyRate }}
          onClose={() => setShowBooking(false)}
        />
      )}
    </div>
  )
}
