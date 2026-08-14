import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { formatCurrency } from '@/lib/utils'
import { api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import {
  Heart, Building2, MapPin, Bed, Bath, Car, Sofa, ExternalLink,
} from 'lucide-react'
import type { Property, PropertyStatus } from '@/types'
import { DoodleStars } from '@/components/ui/Doodles'
import { IconWatermark } from '@/components/ui/Watermark'

const statusVariant: Record<PropertyStatus, 'success' | 'default' | 'danger' | 'warning'> = {
  available: 'success', occupied: 'default', under_dispute: 'danger', maintenance_required: 'warning',
}

export function SavedPropertiesPage() {
  const favoriteIds = useFavoritesStore((s) => s.ids)
  const toggleFavorite = useFavoritesStore((s) => s.toggle)

  // Stable query key — refetch only when the serialized ID list actually changes.
  // We use JSON.stringify so the key only changes on real additions/removals,
  // not on every store subscription tick.
  const idsKey = JSON.stringify([...favoriteIds].sort())
  const { data: properties, isLoading } = useQuery({
    queryKey: ['favorite-properties-full', idsKey],
    queryFn: async () => {
      const ids = useFavoritesStore.getState().ids
      if (ids.length === 0) return []
      const results = await Promise.all(
        ids.map((id) => api.get<Property>(`/properties/${id}`).catch(() => null))
      )
      return results.filter((r): r is Property => r !== null)
    },
    // Keep showing previous data while refetching so cards don't flash
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })

  // Filter cached properties to only show currently-favorited ones.
  // This handles the optimistic removal instantly without waiting for refetch.
  const items = (properties ?? []).filter((p) => {
    const pid = p.id
    return favoriteIds.includes(pid)
  })

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="relative overflow-hidden">
          <DoodleStars className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
          <IconWatermark icon={Heart} className="right-10 top-1/2 size-28 -translate-y-1/2 rotate-[-8deg]" />
          <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">Saved Properties</h1>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">Your bookmarked listings</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-border/40 dark:border-[#252a3a]/40 bg-white dark:bg-[#161927] p-5 space-y-3">
              <div className="h-4 bg-gray-200 dark:bg-[#252a3a] rounded w-2/3" />
              <div className="h-3 bg-gray-200 dark:bg-[#252a3a] rounded w-1/2" />
              <div className="h-5 bg-gray-200 dark:bg-[#252a3a] rounded w-1/3" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="relative overflow-hidden">
          <DoodleStars className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
          <IconWatermark icon={Heart} className="right-10 top-1/2 size-28 -translate-y-1/2 rotate-[-8deg]" />
          <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">Saved Properties</h1>
          <p className="text-sm text-muted dark:text-gray-400 mt-1">
            {items.length > 0 ? `${items.length} saved listing${items.length !== 1 ? 's' : ''}` : 'Your bookmarked listings'}
          </p>
        </div>
        <Link to="/properties">
          <Button variant="outline" size="sm">
            <Building2 size={14} /> Browse Listings
          </Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          preset="properties"
          title="No saved properties"
          description="Browse property listings and tap the heart icon to save ones you're interested in."
          action={{ label: 'Browse Properties', href: '/properties' }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => {
            const pid = p.id
            return (
              <Card key={pid} className="group hover:shadow-lg dark:hover:shadow-black/20 hover:-translate-y-0.5 transition-all overflow-hidden">
                {/* Image area */}
                <div className="relative h-40 bg-gradient-to-br from-primary/5 to-accent/5 dark:from-primary/10 dark:to-accent/10 flex items-center justify-center">
                  {p.images?.length > 0 ? (
                    <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <Building2 size={32} className="text-primary/20 dark:text-gray-600" />
                  )}
                  <div className="absolute top-2 left-2">
                    <Badge variant={statusVariant[p.status as PropertyStatus] ?? 'default'}>
                      {p.status?.replace('_', ' ')}
                    </Badge>
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); toggleFavorite(pid) }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 dark:bg-[#161927]/90 backdrop-blur flex items-center justify-center hover:bg-white dark:hover:bg-[#161927] transition-colors"
                    title="Remove from saved"
                  >
                    <Heart size={14} className="fill-danger text-danger" />
                  </button>
                </div>

                <CardContent>
                  <Link to={`/properties/${pid}`} className="block">
                    <h3 className="text-sm font-bold text-primary-dark dark:text-white truncate group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">
                      {p.title}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-muted dark:text-gray-500 mt-1">
                      <MapPin size={10} />
                      <span className="truncate">{p.address?.street}, {p.address?.city}</span>
                    </div>

                    <div className="flex items-center gap-2 mt-2.5">
                      <span className="text-base font-extrabold text-primary dark:text-blue-400">{formatCurrency(p.rentAmount)}</span>
                      <span className="text-[10px] text-muted dark:text-gray-500">/mo</span>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-2.5">
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted dark:text-gray-500">
                        <Bed size={10} /> {p.bedrooms ?? '-'} bed
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted dark:text-gray-500">
                        <Bath size={10} /> {p.bathrooms ?? '-'} bath
                      </span>
                      {(p.parkingSpaces ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted dark:text-gray-500">
                          <Car size={10} /> {p.parkingSpaces} park
                        </span>
                      )}
                      {p.furnished && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted dark:text-gray-500">
                          <Sofa size={10} /> furnished
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30 dark:border-[#252a3a]/30">
                      <span className="text-[10px] text-muted dark:text-gray-500 capitalize">{p.type}</span>
                      <span className="text-[10px] text-primary dark:text-blue-400 font-semibold flex items-center gap-1">
                        View details <ExternalLink size={9} />
                      </span>
                    </div>
                  </Link>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
