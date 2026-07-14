import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Search, MapPin, BedDouble, Bath, ShieldCheck, BadgeCheck,
  Building2, Home, Warehouse, ArrowRight, ChevronLeft, ChevronRight,
  X,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconWatermark } from '@/components/ui/Watermark'
import { GridSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency } from '@/lib/utils'

interface RegistryListing {
  id: string
  title: string
  city: string
  region: string
  digitalAddress: string
  neighborhood: string
  propertyType: string
  rentAmount: number
  bedrooms: number
  bathrooms: number
  listingStatus: 'approved'
  publishedAt: string | null
  image: string | null
}

interface RegistrySearchResponse {
  items: RegistryListing[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const GHANA_REGIONS = [
  'Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central',
  'Volta', 'Northern', 'Upper East', 'Upper West', 'Bono',
  'Bono East', 'Ahafo', 'Western North', 'Oti', 'Savannah', 'North East',
]

const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'studio', label: 'Studio' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'room', label: 'Room' },
  { value: 'shared_room', label: 'Shared Room' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'warehouse', label: 'Warehouse' },
]

const PRICE_RANGES = [
  { label: 'Under ₵1,000', min: 0, max: 1000 },
  { label: '₵1,000 – ₵2,500', min: 1000, max: 2500 },
  { label: '₵2,500 – ₵5,000', min: 2500, max: 5000 },
  { label: '₵5,000 – ₵10,000', min: 5000, max: 10000 },
  { label: 'Over ₵10,000', min: 10000, max: undefined },
]

const PAGE_SIZE = 12

function setMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setOgMeta(property: string, content: string) {
  let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('property', property)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function PropertyTypeIcon({ type }: { type: string }) {
  if (type === 'commercial' || type === 'warehouse') return <Warehouse size={14} />
  if (type === 'apartment' || type === 'studio') return <Building2 size={14} />
  return <Home size={14} />
}

export function PublicRegistryPage() {
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<string>('')
  const [propertyType, setPropertyType] = useState<string>('')
  const [priceRangeIdx, setPriceRangeIdx] = useState<number | null>(null)
  const [page, setPage] = useState(1)

  // SEO meta
  useEffect(() => {
    const title = 'Property Registry — Verified Rentals in Ghana | RentOS'
    const description = 'Search Ghana\'s official property registry. Browse government-verified rental listings with transparent pricing across all 16 regions.'
    document.title = title
    setMeta('description', description)
    setOgMeta('og:title', title)
    setOgMeta('og:description', description)
    setOgMeta('og:type', 'website')
    setOgMeta('og:site_name', 'RentOS Ghana')
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', title)
    setMeta('twitter:description', description)
  }, [])

  // Pageview tracking — fire once per mount, never block render
  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || '/api'
    void fetch(`${base}/public/properties/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: '/registry',
        referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      }),
    }).catch(() => {
      // best-effort
    })
  }, [])

  // Reset page when filters change — React's "compare-prop" pattern (no effect needed)
  const filtersKey = `${query}|${region}|${propertyType}|${priceRangeIdx}`
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey)
  if (prevFiltersKey !== filtersKey) {
    setPrevFiltersKey(filtersKey)
    setPage(1)
  }

  const priceRange = priceRangeIdx !== null ? PRICE_RANGES[priceRangeIdx] : null

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    if (query) p.set('query', query)
    if (region) p.set('region', region)
    if (propertyType) p.set('propertyType', propertyType)
    if (priceRange?.min !== undefined) p.set('minRent', String(priceRange.min))
    if (priceRange?.max !== undefined) p.set('maxRent', String(priceRange.max))
    p.set('page', String(page))
    p.set('pageSize', String(PAGE_SIZE))
    return p.toString()
  }, [query, region, propertyType, priceRange, page])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-registry', queryString],
    queryFn: async () => {
      const base = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${base}/public/properties/search?${queryString}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to load registry')
      }
      return json.data as RegistrySearchResponse
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setQuery(searchInput.trim())
  }

  const clearFilters = () => {
    setSearchInput('')
    setQuery('')
    setRegion('')
    setPropertyType('')
    setPriceRangeIdx(null)
  }

  const hasFilters = !!(query || region || propertyType || priceRange)

  return (
    <div className="min-h-screen bg-white dark:bg-[#0c0e1a]">
      {/* Hero */}
      <section className="animate-circle-reveal relative bg-gradient-to-b from-[#0f1f33] via-primary to-[#0f1f33] pt-12 pb-10 md:pt-16 md:pb-14 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-blue-400/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-400/10 rounded-full blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
          <IconWatermark icon={Search} tone="brand" className="animate-parallax-drift -bottom-10 -right-6 size-56 hidden md:block" />
        </div>
        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 backdrop-blur px-4 py-2 text-xs font-semibold text-emerald-300 border border-emerald-400/20 mb-5">
            <ShieldCheck size={14} />
            Government-Verified Registry
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold font-display text-white leading-tight tracking-tight">
            Search Ghana's <span className="bg-gradient-to-r from-secondary via-amber-300 to-secondary bg-clip-text text-transparent">Property Registry</span>
          </h1>
          <p className="text-base text-white/60 mt-4 max-w-2xl mx-auto">
            Every listing is verified and approved. Transparent pricing, real properties, real landlords — across all 16 regions.
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="mt-8 max-w-2xl mx-auto">
            <div className="flex gap-2 p-1.5 rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur-lg shadow-2xl shadow-black/30">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="City, neighborhood, digital address, or title…"
                  className="w-full pl-11 pr-4 py-3 bg-transparent text-white placeholder:text-white/40 text-sm focus:outline-none rounded-xl"
                />
              </div>
              <Button type="submit" size="md" className="bg-gradient-to-r from-secondary to-amber-400 text-[#0f1f33] font-bold shrink-0 px-6">
                Search
              </Button>
            </div>
          </form>
        </div>
      </section>

      {/* Filters + results */}
      <section className="max-w-7xl mx-auto px-6 py-10">
        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-white/50 mr-1">Filter:</span>

          <ChipButton active={!region} onClick={() => setRegion('')}>Any region</ChipButton>
          {GHANA_REGIONS.map((r) => (
            <ChipButton key={r} active={region === r} onClick={() => setRegion(r)}>{r}</ChipButton>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-white/50 mr-1">Type:</span>
          <ChipButton active={!propertyType} onClick={() => setPropertyType('')}>Any type</ChipButton>
          {PROPERTY_TYPES.map((t) => (
            <ChipButton key={t.value} active={propertyType === t.value} onClick={() => setPropertyType(t.value)}>{t.label}</ChipButton>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-white/50 mr-1">Rent:</span>
          <ChipButton active={priceRangeIdx === null} onClick={() => setPriceRangeIdx(null)}>Any price</ChipButton>
          {PRICE_RANGES.map((r, i) => (
            <ChipButton key={r.label} active={priceRangeIdx === i} onClick={() => setPriceRangeIdx(i)}>{r.label}</ChipButton>
          ))}
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-extrabold font-display text-primary-dark dark:text-white">
              {isLoading ? 'Searching…' : `${total.toLocaleString()} verified ${total === 1 ? 'property' : 'properties'}`}
            </h2>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted hover:text-primary-dark dark:hover:text-white transition-colors"
              >
                <X size={12} /> Clear filters
              </button>
            )}
          </div>
          <Badge variant="success" className="hidden sm:inline-flex items-center gap-1">
            <BadgeCheck size={12} /> All Verified
          </Badge>
        </div>

        {/* Results */}
        {isLoading ? (
          <GridSkeleton cols={3} count={9} />
        ) : isError ? (
          <EmptyState
            preset="general"
            title="Couldn't load registry"
            description="Something went wrong loading the property registry. Please try again."
          />
        ) : items.length === 0 ? (
          <EmptyState
            preset="search"
            title="No matching properties"
            description="Try broadening your search or removing filters to see more results."
            action={hasFilters ? { label: 'Clear filters', onClick: clearFilters } : undefined}
          />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {items.map((item) => (
                <RegistryCard key={item.id} item={item} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} /> Previous
                </Button>
                <span className="text-sm text-muted dark:text-white/60 px-3">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
        active
          ? 'bg-primary text-white border-primary shadow-sm dark:bg-blue-500 dark:border-blue-500'
          : 'bg-white dark:bg-[#161927] text-muted dark:text-white/60 border-border dark:border-[#252a3a] hover:border-primary/40 hover:text-primary-dark dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function RegistryCard({ item }: { item: RegistryListing }) {
  const typeLabel = PROPERTY_TYPES.find((t) => t.value === item.propertyType)?.label ?? item.propertyType

  return (
    <Link to={`/registry/${item.id}`} className="group block">
      <Card className="p-0 overflow-hidden hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
        {/* Image */}
        <div className="relative h-44 bg-gradient-to-br from-primary/5 to-accent/5 dark:from-primary/15 dark:to-accent/10">
          {item.image ? (
            <img
              src={item.image}
              alt={item.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Building2 size={36} className="text-muted/40 dark:text-white/20" />
            </div>
          )}
          {/* Verified badge overlay */}
          <div className="absolute top-3 left-3">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/95 text-white backdrop-blur shadow">
              <ShieldCheck size={11} /> Verified
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="text-sm font-bold text-primary-dark dark:text-white line-clamp-1 group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">
            {item.title}
          </h3>
          <p className="text-xs text-muted dark:text-white/50 mt-1 flex items-center gap-1 line-clamp-1">
            <MapPin size={11} className="shrink-0" />
            {[item.neighborhood, item.city, item.region].filter(Boolean).join(', ')}
          </p>

          {/* Specs */}
          <div className="flex items-center gap-3 mt-3 text-xs text-muted dark:text-white/60">
            <span className="inline-flex items-center gap-1">
              <PropertyTypeIcon type={item.propertyType} />
              {typeLabel}
            </span>
            {item.bedrooms > 0 && (
              <span className="inline-flex items-center gap-1">
                <BedDouble size={12} /> {item.bedrooms}
              </span>
            )}
            {item.bathrooms > 0 && (
              <span className="inline-flex items-center gap-1">
                <Bath size={12} /> {item.bathrooms}
              </span>
            )}
          </div>

          {/* Price */}
          <div className="flex items-end justify-between mt-4 pt-3 border-t border-border/60 dark:border-[#252a3a]/60">
            <div>
              <p className="text-base font-extrabold font-display text-primary-dark dark:text-white">
                {formatCurrency(item.rentAmount)}
              </p>
              <p className="text-[10px] text-muted dark:text-white/40">per month</p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary dark:text-blue-400 group-hover:gap-2 transition-all">
              View <ArrowRight size={12} />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  )
}

