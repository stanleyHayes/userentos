import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import { api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, MapPin, Image, Calendar, User,
  Eye, ClipboardCheck,
} from 'lucide-react'
import { DoodleCircle } from '@/components/ui/Doodles'

export function PropertyReviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['pending-review-properties'],
    queryFn: () => api.get<{ items: PropertyCard[]; total: number }>('/properties/pending-review'),
  })

  const properties = data?.items ?? []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative">
        <DoodleCircle className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
        <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
          Property Reviews
        </h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-1">
          Review and approve property listings before they become visible to tenants
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-border/60 dark:border-[#252a3a]/60 bg-white dark:bg-[#161927] px-4 py-2.5">
          <ClipboardCheck size={16} className="text-amber-500" />
          <span className="text-sm font-bold text-primary-dark dark:text-white">{properties.length}</span>
          <span className="text-xs text-muted dark:text-gray-500">pending review</span>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : properties.length === 0 ? (
        <EmptyState
          preset="properties"
          title="No pending reviews"
          description="All property listings have been reviewed. Check back later for new submissions."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map((property) => (
            <ReviewPropertyCard key={property.id} property={property} />
          ))}
        </div>
      )}
    </div>
  )
}

interface PropertyCard {
  id: string
  images?: string[]
  title: string
  rentAmount: number
  address?: { city?: string; region?: string }
  landlordId?: string
  createdAt?: string
  type?: string
}

function ReviewPropertyCard({ property }: { property: PropertyCard }) {
  const p = property

  return (
    <Link to={`/properties/${p.id}`}>
      <Card className="group overflow-hidden p-0 hover:shadow-xl dark:hover:shadow-black/30 hover:-translate-y-1 transition-all cursor-pointer">
        {/* Image area */}
        <div className="relative h-40 bg-gradient-to-br from-primary/10 to-accent/5 dark:from-primary/20 dark:to-accent/10 flex items-center justify-center overflow-hidden">
          {(p.images?.length ?? 0) > 0 ? (
            <img
              src={p.images?.[0]}
              alt={p.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <Building2 size={40} className="text-primary/20" />
          )}
          <div className="absolute top-3 left-3">
            <Badge variant="warning" className="backdrop-blur">Pending Review</Badge>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
          <p className="absolute bottom-2 left-3 text-white text-lg font-extrabold font-display">
            {formatCurrency(p.rentAmount)}
            <span className="text-xs font-normal opacity-70">/mo</span>
          </p>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-primary-dark dark:text-white truncate group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">
              {p.title}
            </h3>
            <div className="flex items-center gap-1 text-xs text-muted dark:text-gray-500 mt-1">
              <MapPin size={11} />
              <span className="truncate">
                {p.address?.city}, {p.address?.region}
              </span>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-muted dark:text-gray-500">
              <User size={12} />
              <span className="truncate">Landlord {p.landlordId?.slice(0, 8)}...</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted dark:text-gray-500">
              <Image size={12} />
              <span>{p.images?.length ?? 0} images</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted dark:text-gray-500">
              <Building2 size={12} />
              <span className="capitalize">{p.type}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted dark:text-gray-500">
              <Calendar size={12} />
              <span>{p.createdAt ? formatDate(p.createdAt) : 'N/A'}</span>
            </div>
          </div>

          {/* Review button */}
          <Button size="sm" className="w-full">
            <Eye size={12} /> Review Property
          </Button>
        </div>
      </Card>
    </Link>
  )
}
