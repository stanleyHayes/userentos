import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Wrench, Star, Loader2, CheckCircle, Clock,
  X, Phone, ChevronDown, ChevronUp, Briefcase, User,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Booking {
  _id: string
  workerId: string
  requesterId: string
  type: string
  description: string
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'disputed'
  scheduledDate?: string
  scheduledTime?: string
  estimatedCost?: number
  finalCost?: number
  quoteAmount?: number
  quoteAccepted: boolean
  paymentStatus: 'pending' | 'partial' | 'paid'
  rating?: number
  review?: string
  createdAt: string
  worker?: {
    name: string
    phone: string
    photo?: string
    trades: string[]
  }
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  in_progress: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  disputed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
}

export function MyBookingsPage() {
  const [view, setView] = useState<'requester' | 'worker'>('requester')
  const [filter, setFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [ratingInput, setRatingInput] = useState<{ bookingId: string; rating: number; review: string } | null>(null)
  const [quoteInput, setQuoteInput] = useState<{ bookingId: string; amount: string; note: string } | null>(null)
  const [noteInput, setNoteInput] = useState<{ bookingId: string; text: string } | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['my-bookings', view],
    queryFn: () => api.get<{ items: Booking[] }>(`/service-bookings?asWorker=${view === 'worker'}`),
  })

  // Track which row has an in-flight mutation so we only disable that row's
  // buttons (the mutation is shared across all rows).
  const [pendingId, setPendingId] = useState<string | null>(null)

  const updateBooking = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/service-bookings/${id}`, body),
    onMutate: ({ id }) => { setPendingId(id) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
      toast.success('Updated')
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => { setPendingId(null) },
  })

  const bookings = data?.items ?? []
  const filtered = filter
    ? bookings.filter(b => b.status === filter)
    : bookings

  function handleAcceptQuote(booking: Booking) {
    // Requester accepts the quote only; the worker then confirms (pending -> confirmed),
    // which surfaces their "Confirm" action. Jumping straight to 'confirmed' here made
    // that worker step unreachable.
    updateBooking.mutate({ id: booking._id, body: { quoteAccepted: true } })
  }

  function handleComplete(booking: Booking) {
    updateBooking.mutate({ id: booking._id, body: { status: 'completed' } })
  }

  function handleCancel(booking: Booking) {
    updateBooking.mutate({ id: booking._id, body: { status: 'cancelled' } })
  }

  function handleConfirm(booking: Booking) {
    updateBooking.mutate({ id: booking._id, body: { status: 'confirmed' } })
  }

  function handleStartWork(booking: Booking) {
    updateBooking.mutate({ id: booking._id, body: { status: 'in_progress' } })
  }

  function handleSubmitQuote() {
    if (!quoteInput) return
    const amount = Number(quoteInput.amount)
    if (!amount || amount <= 0) { toast.error('Enter a valid quote amount'); return }
    updateBooking.mutate({
      id: quoteInput.bookingId,
      body: { quoteAmount: amount, note: quoteInput.note || 'Quote provided' },
    })
    setQuoteInput(null)
  }

  function handleSubmitNote() {
    if (!noteInput || !noteInput.text.trim()) return
    updateBooking.mutate({
      id: noteInput.bookingId,
      body: { note: noteInput.text.trim() },
    })
    setNoteInput(null)
  }

  function handleSubmitRating() {
    if (!ratingInput) return
    // Review is optional; only send it when non-empty so the server's min-length
    // rule doesn't 400 a star-only rating.
    const review = ratingInput.review.trim()
    updateBooking.mutate({
      id: ratingInput.bookingId,
      body: review ? { rating: ratingInput.rating, review } : { rating: ratingInput.rating },
    })
    setRatingInput(null)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary-dark dark:text-white flex items-center gap-2">
          <Wrench className="text-primary" size={24} />
          My Bookings
        </h1>
        <p className="text-muted text-sm mt-1">Track your service requests and manage jobs.</p>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 mb-4 bg-surface dark:bg-[#0c0e1a] p-1 rounded-lg w-fit">
        <button
          onClick={() => setView('requester')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
            view === 'requester'
              ? 'bg-white dark:bg-[#161927] text-primary-dark dark:text-white shadow-sm'
              : 'text-muted hover:text-primary-dark dark:hover:text-white'
          )}
        >
          <User size={14} /> My Requests
        </button>
        <button
          onClick={() => setView('worker')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
            view === 'worker'
              ? 'bg-white dark:bg-[#161927] text-primary-dark dark:text-white shadow-sm'
              : 'text-muted hover:text-primary-dark dark:hover:text-white'
          )}
        >
          <Briefcase size={14} /> My Jobs
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter('')} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filter === '' ? 'bg-primary text-white' : 'bg-surface dark:bg-[#0c0e1a] text-muted')}>
          All
        </button>
        {(['pending', 'confirmed', 'in_progress', 'completed'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filter === s ? 'bg-primary text-white' : 'bg-surface dark:bg-[#0c0e1a] text-muted')}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 size={32} className="animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Clock className="text-muted mx-auto mb-3" size={40} />
          <p className="text-muted text-sm">No bookings found.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(booking => {
            const rowPending = updateBooking.isPending && pendingId === booking._id
            return (
            <Card key={booking._id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase', STATUS_COLORS[booking.status])}>
                      {STATUS_LABELS[booking.status]}
                    </span>
                    <span className="text-xs text-muted capitalize">{booking.type}</span>
                  </div>
                  <p className="text-sm font-medium text-primary-dark dark:text-white">{booking.description}</p>
                  {view === 'requester' && booking.worker && (
                    <p className="text-xs text-muted mt-1 flex items-center gap-1">
                      <Wrench size={10} /> {booking.worker.name}{booking.worker.trades?.[0] ? ` · ${booking.worker.trades[0]}` : ''}
                    </p>
                  )}
                  {view === 'worker' && (
                    <p className="text-xs text-muted mt-1">Requester ID: {booking.requesterId.slice(0, 8)}...</p>
                  )}
                  {booking.scheduledDate && (
                    <p className="text-xs text-muted mt-0.5">
                      Scheduled: {booking.scheduledDate} {booking.scheduledTime}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  {booking.quoteAmount !== undefined && (
                    <p className="text-sm font-bold text-primary-dark dark:text-white">
                      {booking.quoteAccepted ? `GHS ${booking.quoteAmount.toFixed(2)}` : `Quote: GHS ${booking.quoteAmount.toFixed(2)}`}
                    </p>
                  )}
                  {booking.estimatedCost !== undefined && !booking.quoteAmount && (
                    <p className="text-sm text-muted">Budget: GHS {booking.estimatedCost.toFixed(2)}</p>
                  )}
                </div>
              </div>

              {/* Actions - Requester View */}
              {view === 'requester' && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {booking.status === 'pending' && booking.quoteAmount !== undefined && !booking.quoteAccepted && (
                    <Button size="sm" disabled={rowPending} onClick={() => handleAcceptQuote(booking)}>
                      <CheckCircle size={12} className="mr-1" /> Accept Quote
                    </Button>
                  )}
                  {booking.status === 'in_progress' && (
                    <Button size="sm" variant="ghost" disabled={rowPending} onClick={() => handleComplete(booking)}>
                      <CheckCircle size={12} className="mr-1" /> Mark Complete
                    </Button>
                  )}
                  {booking.status === 'completed' && !booking.rating && (
                    <Button size="sm" variant="ghost" onClick={() => setRatingInput({ bookingId: booking._id, rating: 5, review: '' })}>
                      <Star size={12} className="mr-1" /> Rate
                    </Button>
                  )}
                  {(booking.status === 'pending' || booking.status === 'confirmed') && (
                    <Button size="sm" variant="ghost" disabled={rowPending} onClick={() => handleCancel(booking)}>
                      <X size={12} className="mr-1" /> Cancel
                    </Button>
                  )}
                  {booking.worker?.phone && (
                    <a href={`tel:${booking.worker.phone}`} className="inline-flex items-center px-2 py-1 rounded text-xs text-muted hover:text-primary">
                      <Phone size={12} className="mr-1" /> Call
                    </a>
                  )}
                  <button onClick={() => setExpandedId(expandedId === booking._id ? null : booking._id)} className="text-xs text-muted hover:text-primary ml-auto flex items-center">
                    {expandedId === booking._id ? <><ChevronUp size={12} /> Less</> : <><ChevronDown size={12} /> More</>}
                  </button>
                </div>
              )}

              {/* Actions - Worker View */}
              {view === 'worker' && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {booking.status === 'pending' && booking.quoteAmount === undefined && (
                    <Button size="sm" onClick={() => setQuoteInput({ bookingId: booking._id, amount: '', note: '' })}>
                      <CheckCircle size={12} className="mr-1" /> Provide Quote
                    </Button>
                  )}
                  {booking.status === 'pending' && booking.quoteAccepted && (
                    <Button size="sm" disabled={rowPending} onClick={() => handleConfirm(booking)}>
                      <CheckCircle size={12} className="mr-1" /> Confirm
                    </Button>
                  )}
                  {booking.status === 'confirmed' && (
                    <Button size="sm" disabled={rowPending} onClick={() => handleStartWork(booking)}>
                      <CheckCircle size={12} className="mr-1" /> Start Work
                    </Button>
                  )}
                  {booking.status === 'in_progress' && (
                    <Button size="sm" variant="ghost" disabled={rowPending} onClick={() => handleComplete(booking)}>
                      <CheckCircle size={12} className="mr-1" /> Mark Complete
                    </Button>
                  )}
                  {(booking.status === 'confirmed' || booking.status === 'in_progress') && (
                    <Button size="sm" variant="ghost" onClick={() => setNoteInput({ bookingId: booking._id, text: '' })}>
                      <Clock size={12} className="mr-1" /> Add Note
                    </Button>
                  )}
                  <button onClick={() => setExpandedId(expandedId === booking._id ? null : booking._id)} className="text-xs text-muted hover:text-primary ml-auto flex items-center">
                    {expandedId === booking._id ? <><ChevronUp size={12} /> Less</> : <><ChevronDown size={12} /> More</>}
                  </button>
                </div>
              )}

              {expandedId === booking._id && (
                <div className="mt-3 pt-3 border-t border-border dark:border-[#252a3a] text-sm space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted">Booking ID:</span> <span className="text-primary-dark dark:text-white">{booking._id}</span></div>
                    <div><span className="text-muted">Created:</span> <span className="text-primary-dark dark:text-white">{new Date(booking.createdAt).toLocaleDateString()}</span></div>
                    {booking.finalCost !== undefined && <div><span className="text-muted">Final Cost:</span> <span className="text-primary-dark dark:text-white">GHS {booking.finalCost.toFixed(2)}</span></div>}
                    <div><span className="text-muted">Payment:</span> <span className="text-primary-dark dark:text-white capitalize">{booking.paymentStatus}</span></div>
                  </div>
                  {booking.rating && (
                    <div className="flex items-center gap-1 text-yellow-500">
                      <Star size={14} fill="currentColor" />
                      <span className="font-medium">{booking.rating}</span>
                      {booking.review && <span className="text-muted">— {booking.review}</span>}
                    </div>
                  )}
                </div>
              )}
            </Card>
            )
          })}
        </div>
      )}

      {/* Quote Modal */}
      {quoteInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md p-5 space-y-4">
            <h3 className="font-semibold text-primary-dark dark:text-white">Provide Quote</h3>
            <Input
              id="quote-amount"
              label="Quote Amount (GHS)"
              type="number"
              value={quoteInput.amount}
              onChange={e => setQuoteInput(p => p ? { ...p, amount: e.target.value } : null)}
              placeholder="e.g. 250"
            />
            <textarea
              className="w-full rounded-lg border border-border dark:border-[#252a3a] bg-white dark:bg-[#0c0e1a] px-3 py-2 text-sm text-primary-dark dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
              rows={2}
              placeholder="Optional note for the requester"
              value={quoteInput.note}
              onChange={e => setQuoteInput(p => p ? { ...p, note: e.target.value } : null)}
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setQuoteInput(null)} className="flex-1">Cancel</Button>
              <Button onClick={handleSubmitQuote} className="flex-1">Send Quote</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Note Modal */}
      {noteInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md p-5 space-y-4">
            <h3 className="font-semibold text-primary-dark dark:text-white">Add Note</h3>
            <textarea
              className="w-full rounded-lg border border-border dark:border-[#252a3a] bg-white dark:bg-[#0c0e1a] px-3 py-2 text-sm text-primary-dark dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
              rows={3}
              placeholder="e.g. Arrived on site. Need additional materials."
              value={noteInput.text}
              onChange={e => setNoteInput(p => p ? { ...p, text: e.target.value } : null)}
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setNoteInput(null)} className="flex-1">Cancel</Button>
              <Button onClick={handleSubmitNote} className="flex-1">Add Note</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Rating Modal */}
      {ratingInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md p-5 space-y-4">
            <h3 className="font-semibold text-primary-dark dark:text-white">Rate Service</h3>
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map(star => (
                <button key={star} onClick={() => setRatingInput(p => p ? { ...p, rating: star } : null)}>
                  <Star size={28} className={cn(star <= ratingInput.rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300')} />
                </button>
              ))}
            </div>
            <textarea
              className="w-full rounded-lg border border-border dark:border-[#252a3a] bg-white dark:bg-[#0c0e1a] px-3 py-2 text-sm text-primary-dark dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
              rows={3}
              placeholder="How was the service? (optional)"
              value={ratingInput.review}
              onChange={e => setRatingInput(p => p ? { ...p, review: e.target.value } : null)}
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setRatingInput(null)} className="flex-1">Cancel</Button>
              <Button onClick={handleSubmitRating} className="flex-1">Submit</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
