import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
import { applySeo, platformPageSeo } from '@/lib/seo'
import { LISTING_TYPES, formatListingPrice, isListingType, listingSeoPath, listingTypeMeta, type ListingType } from '../../../../packages/shared/listingTypes'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'

export interface RegistryListing {
  id: string
  ref: string | null
  listingType: string
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

// A price only means something next to what it is for: monthly rent, a sale
// price or a nightly rate. The price filter appears once a type is chosen.
const PRICE_RANGES: Record<ListingType, { label: string; min: number; max?: number }[]> = {
  rent: [
    { label: 'Under ₵1,000', min: 0, max: 1000 },
    { label: '₵1,000 – ₵2,500', min: 1000, max: 2500 },
    { label: '₵2,500 – ₵5,000', min: 2500, max: 5000 },
    { label: '₵5,000 – ₵10,000', min: 5000, max: 10000 },
    { label: 'Over ₵10,000', min: 10000 },
  ],
  sale: [
    { label: 'Under ₵250k', min: 0, max: 250_000 },
    { label: '₵250k – ₵750k', min: 250_000, max: 750_000 },
    { label: '₵750k – ₵2m', min: 750_000, max: 2_000_000 },
    { label: 'Over ₵2m', min: 2_000_000 },
  ],
  short_let: [
    { label: 'Under ₵300 a night', min: 0, max: 300 },
    { label: '₵300 – ₵700', min: 300, max: 700 },
    { label: '₵700 – ₵1,500', min: 700, max: 1500 },
    { label: 'Over ₵1,500', min: 1500 },
  ],
}

const PAGE_SIZE = 12

function PropertyTypeIcon({ type }: { type: string }) {
  if (type === 'commercial' || type === 'warehouse') return <Warehouse size={14} />
  if (type === 'apartment' || type === 'studio') return <Building2 size={14} />
  return <Home size={14} />
}

export function PublicRegistryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const typeParam = searchParams.get('type')
  const listingType: ListingType | '' = isListingType(typeParam) ? typeParam : ''
  const setListingType = (value: ListingType | '') => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('type', value)
    else next.delete('type')
    setSearchParams(next, { replace: true })
    setPriceRangeIdx(null)
  }
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') ?? '')
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [region, setRegion] = useState<string>('')
  const [propertyType, setPropertyType] = useState<string>('')
  const [priceRangeIdx, setPriceRangeIdx] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const { attach: regionPillAttach, style: regionPillStyle, visible: regionPillVisible } = useSlidingIndicator<HTMLDivElement>(region || '__any_region__')
  const { attach: typePillAttach, style: typePillStyle, visible: typePillVisible } = useSlidingIndicator<HTMLDivElement>(propertyType || '__any_type__')
  const { attach: pricePillAttach, style: pricePillStyle, visible: pricePillVisible } = useSlidingIndicator<HTMLDivElement>(priceRangeIdx ?? '__any_price__')

  // SEO: the registry is one page; /rent, /buy and /short-stay are the indexable pages per purpose
  // (pages/seo/SearchLandingPage.tsx), so a filtered registry names /registry as its canonical address.
  useEffect(() => {
    // Unfiltered, the title and description the server sends; a filter only renames the tab.
    const page = platformPageSeo('/registry')
    const purpose = listingType === 'sale' ? 'for sale' : listingType === 'short_let' ? 'short lets' : 'for rent'
    applySeo({
      title: listingType ? `Houses & apartments ${purpose} in Ghana | RentOS Property Registry` : page.title,
      description: listingType ? `Browse reviewed property listings ${purpose} in Accra, Kumasi, Tema and across Ghana. Prices shown up front; message the agent on RentOS.` : page.description,
      canonical: `${window.location.origin}/registry`,
      siteName: 'RentOS Ghana',
    })
  }, [listingType])

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
  const filtersKey = `${listingType}|${query}|${region}|${propertyType}|${priceRangeIdx}`
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey)
  if (prevFiltersKey !== filtersKey) {
    setPrevFiltersKey(filtersKey)
    setPage(1)
  }

  const priceRanges = listingType ? PRICE_RANGES[listingType] : []
  const priceRange = priceRangeIdx !== null ? priceRanges[priceRangeIdx] ?? null : null

  // The React Compiler memoizes this; no manual useMemo.
  const searchQuery = new URLSearchParams()
  if (listingType) searchQuery.set('listingType', listingType)
  if (query) searchQuery.set('query', query)
  if (region) searchQuery.set('region', region)
  if (propertyType) searchQuery.set('propertyType', propertyType)
  if (priceRange?.min !== undefined) searchQuery.set('minRent', String(priceRange.min))
  if (priceRange?.max !== undefined) searchQuery.set('maxRent', String(priceRange.max))
  searchQuery.set('page', String(page))
  searchQuery.set('pageSize', String(PAGE_SIZE))
  const queryString = searchQuery.toString()

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
    setListingType('')
    setSearchInput('')
    setQuery('')
    setRegion('')
    setPropertyType('')
    setPriceRangeIdx(null)
  }

  const hasFilters = !!(listingType || query || region || propertyType || priceRange)

  return (
    <div className="min-h-screen bg-white dark:bg-[#0c0e1a]">
      {/* Hero */}
      <section className="animate-circle-reveal relative overflow-hidden bg-gradient-to-b from-[#091421] via-[#173a55] to-[#0b1a2a] pt-12 pb-10 md:pt-16 md:pb-14">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute left-1/4 top-1/3 h-96 w-96 rounded-full bg-sky-300/[0.07] blur-[130px]" />
          <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-emerald-300/[0.06] blur-[110px]" />
          <div className="absolute inset-0 bg-[#07111d]/10" />
          <div className="absolute inset-0 opacity-[0.045]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
          <IconWatermark icon={Search} tone="brand" className="animate-parallax-drift -bottom-10 -right-6 size-56 hidden md:block" />
        </div>
        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 backdrop-blur px-4 py-2 text-xs font-semibold text-emerald-300 border border-emerald-400/20 mb-5">
            <ShieldCheck size={14} />
            The RentOS property registry
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold font-display text-white leading-tight tracking-tight">
            Homes for rent, for sale <span className="bg-gradient-to-r from-secondary via-amber-300 to-secondary bg-clip-text text-transparent">and short lets</span> in Ghana
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/78">
            Listings from agents across Ghana, each reviewed by RentOS before it is published, with the price shown up front. Always view a property and check the documents before you pay.
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="mt-8 max-w-2xl mx-auto">
            <div className="flex gap-2 rounded-2xl border border-white/15 bg-[#071522]/55 p-1.5 shadow-2xl shadow-black/35 backdrop-blur-lg">
              <div className="flex-1 relative">
                <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/60" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="City, neighborhood, digital address, or title…"
                  className="w-full rounded-xl bg-transparent py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/58 focus:outline-none"
                />
              </div>
              <Button type="submit" size="md" className="dark-surface-control shrink-0 bg-gradient-to-r from-secondary to-amber-400 px-6 font-bold text-[#0f1f33]">
                Search
              </Button>
            </div>
          </form>
        </div>
      </section>

      {/* Filters + results */}
      <section className="max-w-7xl mx-auto px-6 py-10">
        {/* What the listing is for comes first: it decides what the price means. */}
        <div role="tablist" aria-label="Listing type" className="mb-7 inline-flex w-full flex-wrap gap-1 rounded-2xl border border-border/70 bg-surface/60 p-1 dark:border-white/10 dark:bg-white/[0.03] sm:w-auto">
          {[{ value: '' as const, label: 'All listings' }, ...LISTING_TYPES.map((t) => ({ value: t.value, label: t.label }))].map((t) => {
            const selected = listingType === t.value
            return (
              <button
                key={t.value || 'all'}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setListingType(t.value)}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold transition-colors sm:flex-none ${selected ? 'bg-white text-primary shadow-sm dark:bg-[#0c1626] dark:text-cyan-200' : 'text-muted hover:text-primary-dark dark:text-gray-400 dark:hover:text-white'}`}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-white/50 mr-1">Filter:</span>

          <div ref={regionPillAttach} className="relative isolate flex flex-wrap items-center gap-2">
            <span
              aria-hidden
              className="registry-pill-active pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-primary transition-[transform,width,height] duration-300 ease-out dark:bg-blue-500"
              style={{ ...regionPillStyle, opacity: regionPillVisible ? 1 : 0 }}
            />
            <ChipButton tabKey="__any_region__" active={!region} onClick={() => setRegion('')}>Any region</ChipButton>
            {GHANA_REGIONS.map((r) => (
              <ChipButton key={r} tabKey={r} active={region === r} onClick={() => setRegion(r)}>{r}</ChipButton>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-white/50 mr-1">Type:</span>
          <div ref={typePillAttach} className="relative isolate flex flex-wrap items-center gap-2">
            <span
              aria-hidden
              className="registry-pill-active pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-primary transition-[transform,width,height] duration-300 ease-out dark:bg-blue-500"
              style={{ ...typePillStyle, opacity: typePillVisible ? 1 : 0 }}
            />
            <ChipButton tabKey="__any_type__" active={!propertyType} onClick={() => setPropertyType('')}>Any type</ChipButton>
            {PROPERTY_TYPES.map((t) => (
              <ChipButton key={t.value} tabKey={t.value} active={propertyType === t.value} onClick={() => setPropertyType(t.value)}>{t.label}</ChipButton>
            ))}
          </div>
        </div>

        {listingType && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-white/50 mr-1">{listingTypeMeta(listingType).priceLabel}:</span>
          <div ref={pricePillAttach} className="relative isolate flex flex-wrap items-center gap-2">
            <span
              aria-hidden
              className="registry-pill-active pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-primary transition-[transform,width,height] duration-300 ease-out dark:bg-blue-500"
              style={{ ...pricePillStyle, opacity: pricePillVisible ? 1 : 0 }}
            />
            <ChipButton tabKey="__any_price__" active={priceRangeIdx === null} onClick={() => setPriceRangeIdx(null)}>Any price</ChipButton>
            {priceRanges.map((r, i) => (
              <ChipButton key={r.label} tabKey={i} active={priceRangeIdx === i} onClick={() => setPriceRangeIdx(i)}>{r.label}</ChipButton>
            ))}
          </div>
        </div>
        )}

        {/* Results header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-extrabold font-display text-primary-dark dark:text-white">
              {isLoading ? 'Searching…' : `${total.toLocaleString()} reviewed ${total === 1 ? 'listing' : 'listings'}${listingType ? ` ${listingTypeMeta(listingType).label.toLowerCase()}` : ''}`}
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
            <BadgeCheck size={12} /> All reviewed
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
  tabKey,
  active,
  onClick,
  children,
}: {
  tabKey: string | number
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-tab-key={tabKey}
      onClick={onClick}
      className={`registry-filter-pill relative z-10 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
        active
          ? 'registry-filter-pill-active text-white border-primary dark:border-blue-400'
          : 'bg-[#f2f5f8] dark:bg-[#151b28] text-muted dark:text-white/65 border-white/70 dark:border-white/[0.07] hover:border-primary/30 hover:text-primary-dark dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

export function RegistryCard({ item }: { item: RegistryListing }) {
  const typeLabel = PROPERTY_TYPES.find((t) => t.value === item.propertyType)?.label ?? item.propertyType
  const purpose = listingTypeMeta(item.listingType)

  return (
    <Link to={listingSeoPath(item)} className="group block">
      <Card className="p-0 overflow-hidden hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
        {/* Image */}
        <div className="relative mx-3 mt-3 h-44 overflow-hidden rounded-xl bg-gradient-to-br from-primary/5 to-accent/5 dark:from-primary/15 dark:to-accent/10">
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
          {/* What it is for, and the listing-review mark every registry listing earned */}
          <div className="absolute left-3 top-3 flex gap-1.5">
            <span className="inline-flex items-center rounded-full bg-primary/95 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow backdrop-blur dark:bg-cyan-300/95 dark:text-[#071018]">
              {purpose.label}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/95 text-white backdrop-blur shadow">
              <ShieldCheck size={11} /> Reviewed
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
                {formatListingPrice(item.rentAmount, item.listingType)}
              </p>
              <p className="text-[10px] text-muted dark:text-white/40">{purpose.priceLabel}</p>
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
