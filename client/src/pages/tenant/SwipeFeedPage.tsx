import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Heart, X, Info, MapPin, Bed, Bath, Car, Sofa, RotateCcw, Building2, Sparkles, RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'

type SwipeProperty = {
  id?: string
  _id?: string
  title: string
  description?: string
  type: string
  rentAmount: number
  rentDurationMonths?: number
  bedrooms?: number
  bathrooms?: number
  parkingSpaces?: number
  furnished?: boolean
  images?: string[]
  amenities?: string[]
  matchScore?: number
  address: { street: string; city: string; region: string; neighborhood?: string }
}

type Decision = 'like' | 'pass'
type HistoryEntry = { property: SwipeProperty; decision: Decision }

const SWIPE_THRESHOLD = 120
const ROTATION_FACTOR = 0.08

const pid = (p: SwipeProperty) => (p.id ?? p._id) as string

export function SwipeFeedPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const favoriteIds = useFavoritesStore((s) => s.ids)
  const toggleFavorite = useFavoritesStore((s) => s.toggle)
  const isFavorited = useFavoritesStore((s) => s.isFavorited)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['swipe-recommendations'],
    queryFn: async () => {
      const res = await api.get<{ items: SwipeProperty[] }>('/properties/recommendations/for-me')
      return res.items ?? []
    },
    staleTime: 60_000,
  })

  const [history, setHistory] = useState<HistoryEntry[]>([])
  const decidedIds = useMemo(() => new Set(history.map((h) => pid(h.property))), [history])

  const queue = useMemo(
    () => (data ?? []).filter((p) => {
      const id = pid(p)
      if (!id) return false
      if (decidedIds.has(id)) return false
      if (favoriteIds.includes(id)) return false
      return true
    }),
    [data, decidedIds, favoriteIds],
  )

  const [drag, setDrag] = useState({ x: 0, y: 0, dragging: false })
  const [exit, setExit] = useState<{ id: string; direction: Decision } | null>(null)
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)

  const top = queue[0]
  const next = queue[1]
  const third = queue[2]
  const topId = top ? pid(top) : null

  // Reset drag/exit state when the top card changes (adjust-state-during-render
  // pattern — avoids cascading renders from setState-in-effect).
  const prevTopIdRef = useRef(topId)
  if (prevTopIdRef.current !== topId) {
    prevTopIdRef.current = topId
    setDrag({ x: 0, y: 0, dragging: false })
    setExit(null)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!top || exit) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
    setDrag({ x: 0, y: 0, dragging: true })
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current || startRef.current.pointerId !== e.pointerId) return
    setDrag({
      x: e.clientX - startRef.current.x,
      y: e.clientY - startRef.current.y,
      dragging: true,
    })
  }

  const decide = (decision: Decision) => {
    if (!top) return
    setExit({ id: pid(top), direction: decision })
    if (decision === 'like') void toggleFavorite(pid(top))
    const decided = top
    window.setTimeout(() => {
      setHistory((h) => [...h, { property: decided, decision }])
    }, 220)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current || startRef.current.pointerId !== e.pointerId) return
    startRef.current = null
    const { x } = drag
    if (Math.abs(x) > SWIPE_THRESHOLD) {
      decide(x > 0 ? 'like' : 'pass')
    } else {
      setDrag({ x: 0, y: 0, dragging: false })
    }
  }

  const undo = () => {
    if (history.length === 0) return
    const last = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    if (last.decision === 'like' && isFavorited(pid(last.property))) {
      void toggleFavorite(pid(last.property))
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!top || exit) return
      if (e.key === 'ArrowRight') decide('like')
      else if (e.key === 'ArrowLeft') decide('pass')
      else if (e.key === 'ArrowUp') navigate(`/properties/${pid(top)}`)
      else if (e.key.toLowerCase() === 'z') undo()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topId, exit])

  const dragX = exit ? (exit.direction === 'like' ? 600 : -600) : drag.x
  const dragY = exit ? -40 : drag.y
  const rotation = dragX * ROTATION_FACTOR
  const likeOpacity = Math.min(1, Math.max(0, dragX / SWIPE_THRESHOLD))
  const passOpacity = Math.min(1, Math.max(0, -dragX / SWIPE_THRESHOLD))

  if (user?.activeRole && user.activeRole !== 'tenant') {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">Discover</h1>
        <EmptyState
          preset="properties"
          title="Tenant-only feature"
          description="Switch to your tenant role to discover properties via the swipe feed."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[820px]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight flex items-center gap-2">
            <Sparkles size={20} className="text-primary dark:text-blue-400" />
            Discover
          </h1>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">
            Swipe right to save · left to pass · up for details
          </p>
        </div>
        <Link to="/properties">
          <Button variant="outline" size="sm">
            <Building2 size={14} /> All listings
          </Button>
        </Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        {isLoading ? (
          <div className="w-full max-w-sm h-[520px] rounded-3xl bg-gray-100 dark:bg-[#161927] animate-pulse" />
        ) : queue.length === 0 ? (
          <div className="w-full max-w-sm">
            <EmptyState
              preset="properties"
              title={data && data.length > 0 ? "You're all caught up" : 'No matches yet'}
              description={
                data && data.length > 0
                  ? 'Come back later for new listings, or refine your search preferences in your profile.'
                  : 'Add your search preferences in your profile to see matched properties here.'
              }
              action={{
                label: data && data.length > 0 ? 'Refresh' : 'Update profile',
                onClick: data && data.length > 0 ? () => refetch() : () => navigate('/my-profile'),
              }}
            />
          </div>
        ) : (
          <div className="relative w-full max-w-sm h-[520px]">
            {third && (
              <CardSlot
                property={third}
                interactive={false}
                style={{ transform: 'translateY(16px) scale(0.92)', opacity: 0.6 }}
              />
            )}
            {next && (
              <CardSlot
                property={next}
                interactive={false}
                style={{ transform: 'translateY(8px) scale(0.96)', opacity: 0.85 }}
              />
            )}
            {top && (
              <CardSlot
                property={top}
                interactive
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                  transform: `translate(${dragX}px, ${dragY}px) rotate(${rotation}deg)`,
                  transition: drag.dragging
                    ? 'none'
                    : exit
                      ? 'transform 220ms ease-out, opacity 220ms ease-out'
                      : 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                  opacity: exit ? 0 : 1,
                  cursor: drag.dragging ? 'grabbing' : 'grab',
                }}
                likeOpacity={likeOpacity}
                passOpacity={passOpacity}
                onTapDetail={() => navigate(`/properties/${pid(top)}`)}
              />
            )}
          </div>
        )}
      </div>

      {queue.length > 0 && (
        <div className="flex items-center justify-center gap-5 pt-5">
          <button
            onClick={undo}
            disabled={history.length === 0}
            className="w-12 h-12 rounded-full border border-border/40 dark:border-[#252a3a] bg-white dark:bg-[#161927] flex items-center justify-center text-muted dark:text-gray-400 hover:text-amber-500 disabled:opacity-30 transition-colors shadow-sm"
            title="Undo (Z)"
            aria-label="Undo"
          >
            <RotateCcw size={18} />
          </button>
          <button
            onClick={() => decide('pass')}
            className="w-16 h-16 rounded-full border-2 border-danger/30 bg-white dark:bg-[#161927] flex items-center justify-center text-danger hover:bg-danger hover:text-white transition-colors shadow-md"
            title="Pass (←)"
            aria-label="Pass"
          >
            <X size={28} strokeWidth={3} />
          </button>
          <button
            onClick={() => top && navigate(`/properties/${pid(top)}`)}
            className="w-12 h-12 rounded-full border border-border/40 dark:border-[#252a3a] bg-white dark:bg-[#161927] flex items-center justify-center text-primary dark:text-blue-400 hover:bg-primary/10 dark:hover:bg-blue-400/10 transition-colors shadow-sm"
            title="Details (↑)"
            aria-label="Details"
          >
            <Info size={18} />
          </button>
          <button
            onClick={() => decide('like')}
            className="w-16 h-16 rounded-full border-2 border-success/30 bg-white dark:bg-[#161927] flex items-center justify-center text-success hover:bg-success hover:text-white transition-colors shadow-md"
            title="Save (→)"
            aria-label="Save"
          >
            <Heart size={26} strokeWidth={3} />
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="w-12 h-12 rounded-full border border-border/40 dark:border-[#252a3a] bg-white dark:bg-[#161927] flex items-center justify-center text-muted dark:text-gray-400 hover:text-primary dark:hover:text-blue-400 disabled:opacity-30 transition-colors shadow-sm"
            title="Refresh queue"
            aria-label="Refresh"
          >
            <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      )}
    </div>
  )
}

interface CardSlotProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'property'> {
  property: SwipeProperty
  interactive: boolean
  likeOpacity?: number
  passOpacity?: number
  onTapDetail?: () => void
}

const CardSlot = forwardRef<HTMLDivElement, CardSlotProps>(function CardSlot(
  { property, interactive, likeOpacity = 0, passOpacity = 0, onTapDetail, style, ...rest },
  ref,
) {
  const id = pid(property)
  const img = property.images?.[0]
  return (
    <div
      ref={ref}
      className="absolute inset-0 rounded-3xl overflow-hidden bg-white dark:bg-[#161927] border border-border/30 dark:border-[#252a3a]/60 shadow-xl select-none touch-none"
      style={style}
      {...rest}
    >
      <div className="relative h-72 bg-gradient-to-br from-primary/10 to-accent/10 dark:from-primary/15 dark:to-accent/15">
        {img ? (
          <img
            src={img}
            alt={property.title}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building2 size={56} className="text-primary/20 dark:text-gray-600" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
        {typeof property.matchScore === 'number' && (
          <div className="absolute top-3 left-3">
            <Badge variant="success">{property.matchScore}% match</Badge>
          </div>
        )}
        <div className="absolute top-3 right-3">
          <Badge variant="default">{property.type.replace('_', ' ')}</Badge>
        </div>
        <div className="absolute bottom-3 left-3 right-3 text-white">
          <h2 className="text-xl font-extrabold leading-tight drop-shadow truncate">{property.title}</h2>
          <div className="flex items-center gap-1 text-xs mt-1 opacity-90">
            <MapPin size={12} />
            <span className="truncate">
              {property.address.neighborhood ? `${property.address.neighborhood}, ` : ''}
              {property.address.city}, {property.address.region}
            </span>
          </div>
        </div>

        {interactive && (
          <>
            <div
              className="absolute top-6 left-6 px-3 py-1.5 rounded-lg border-4 border-success text-success font-extrabold text-2xl tracking-wider rotate-[-12deg] uppercase pointer-events-none"
              style={{ opacity: likeOpacity }}
            >
              Save
            </div>
            <div
              className="absolute top-6 right-6 px-3 py-1.5 rounded-lg border-4 border-danger text-danger font-extrabold text-2xl tracking-wider rotate-[12deg] uppercase pointer-events-none"
              style={{ opacity: passOpacity }}
            >
              Nope
            </div>
          </>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-extrabold text-primary dark:text-blue-400">
            {formatCurrency(property.rentAmount)}
          </span>
          <span className="text-xs text-muted dark:text-gray-500">/month</span>
        </div>

        <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted dark:text-gray-400">
          <span className="inline-flex items-center gap-1">
            <Bed size={14} /> {property.bedrooms ?? '—'} bed
          </span>
          <span className="inline-flex items-center gap-1">
            <Bath size={14} /> {property.bathrooms ?? '—'} bath
          </span>
          {(property.parkingSpaces ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1">
              <Car size={14} /> {property.parkingSpaces} parking
            </span>
          )}
          {property.furnished && (
            <span className="inline-flex items-center gap-1">
              <Sofa size={14} /> Furnished
            </span>
          )}
        </div>

        {property.amenities && property.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {property.amenities.slice(0, 4).map((a) => (
              <span
                key={a}
                className="text-[10px] px-2 py-0.5 rounded-full bg-primary/5 dark:bg-blue-400/10 text-primary dark:text-blue-400 font-medium"
              >
                {a}
              </span>
            ))}
            {property.amenities.length > 4 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/10 text-muted dark:text-gray-500 font-medium">
                +{property.amenities.length - 4}
              </span>
            )}
          </div>
        )}

        {interactive && onTapDetail && (
          <button
            onClick={(e) => { e.stopPropagation(); onTapDetail() }}
            className="mt-4 w-full text-center text-xs text-primary dark:text-blue-400 font-semibold hover:underline"
          >
            View full details · #{id?.slice(-6)}
          </button>
        )}
      </div>
    </div>
  )
})
