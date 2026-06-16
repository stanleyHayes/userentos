import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Switch } from '@/components/ui/Switch'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency } from '@/lib/utils'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/Skeleton'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import InputAdornment from '@mui/material/InputAdornment'
import {
  Plus, Search, MapPin, SlidersHorizontal,
  Bed, Bath, Car, Sofa, ArrowUpDown, Eye, Building2,
  Grid3X3, List, Send, Accessibility,
} from 'lucide-react'
import { DoodleStars } from '@/components/ui/Doodles'
import type { Property, PropertyStatus } from '@/types'

const statusVariant: Record<PropertyStatus, 'success' | 'default' | 'danger' | 'warning'> = {
  available: 'success', occupied: 'default', under_dispute: 'danger', maintenance_required: 'warning',
}

const listingStatusVariant: Record<string, 'default' | 'warning' | 'success' | 'danger'> = {
  draft: 'default', pending_review: 'warning', approved: 'success', rejected: 'danger',
}

const listingStatusLabel: Record<string, string> = {
  draft: 'Draft', pending_review: 'Pending Review', approved: 'Approved', rejected: 'Rejected',
}

const REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central', 'Northern', 'Volta', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Savannah', 'North East', 'Oti', 'Western North']
const TYPES = ['apartment', 'house', 'room', 'studio', 'townhouse', 'hostel', 'shared_room', 'commercial', 'warehouse']
const AMENITIES = ['Water', 'Electricity', 'WiFi', 'Parking', 'Security', 'AC', 'Generator', 'Swimming Pool', 'Gym', 'Garden', 'Garage', 'Elevator', 'Balcony', 'Laundry', 'CCTV']
const ACCESSIBILITY_OPTIONS: { key: string; label: string }[] = [
  { key: 'wheelchairAccessible', label: 'Wheelchair Accessible' },
  { key: 'stepFreeEntry', label: 'Step-Free Entry' },
  { key: 'elevator', label: 'Elevator' },
  { key: 'accessibleBathroom', label: 'Accessible Bathroom' },
  { key: 'hearingLoop', label: 'Hearing Loop' },
  { key: 'brailleSignage', label: 'Braille Signage' },
  { key: 'groundFloorOnly', label: 'Ground Floor Only' },
]
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'popular', label: 'Most Viewed' },
]

interface Filters {
  search: string; type: string; region: string; city: string
  minRent: string; maxRent: string; minBedrooms: string; minBathrooms: string
  furnished: boolean; parking: boolean; amenities: string[]
  accessibility: string[]
  sort: string; status: string
}

type PropertyCard = Property & {
  matchScore?: number
  address?: Property['address'] & { neighborhood?: string }
}

const defaultFilters: Filters = {
  search: '', type: '', region: '', city: '',
  minRent: '', maxRent: '', minBedrooms: '', minBathrooms: '',
  furnished: false, parking: false, amenities: [],
  accessibility: [],
  sort: 'newest', status: 'available',
}

export function PropertiesPage() {
  const user = useAuthStore((s) => s.user)
  const isLandlord = user?.activeRole === 'landlord' || user?.activeRole === 'property_manager'
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [showFilters, setShowFilters] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const queryParams = new URLSearchParams()
  if (isLandlord) queryParams.set('mine', 'true')
  if (filters.search) queryParams.set('search', filters.search)
  if (filters.type) queryParams.set('type', filters.type)
  if (filters.region) queryParams.set('region', filters.region)
  if (filters.city) queryParams.set('city', filters.city)
  if (filters.minRent) queryParams.set('minRent', filters.minRent)
  if (filters.maxRent) queryParams.set('maxRent', filters.maxRent)
  if (filters.minBedrooms) queryParams.set('minBedrooms', filters.minBedrooms)
  if (filters.minBathrooms) queryParams.set('minBathrooms', filters.minBathrooms)
  if (filters.furnished) queryParams.set('furnished', 'true')
  if (filters.parking) queryParams.set('parking', 'true')
  if (filters.amenities.length) queryParams.set('amenities', filters.amenities.join(','))
  if (filters.accessibility.length) queryParams.set('accessibility', filters.accessibility.join(','))
  if (filters.sort) queryParams.set('sort', filters.sort)
  if (filters.status) queryParams.set('status', filters.status)
  const qs = queryParams.toString()

  const { data, isLoading } = useQuery({
    queryKey: ['properties', qs],
    queryFn: () => api.get<{ items: Property[] }>(`/properties${qs ? `?${qs}` : ''}`),
  })
  const properties = data?.items ?? []

  function uf<K extends keyof Filters>(field: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [field]: value }))
  }

  function toggleAmenity(a: string) {
    setFilters((f) => ({
      ...f,
      amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a],
    }))
  }

  function toggleAccessibility(key: string) {
    setFilters((f) => ({
      ...f,
      accessibility: f.accessibility.includes(key) ? f.accessibility.filter((x) => x !== key) : [...f.accessibility, key],
    }))
  }

  function clearFilters() { setFilters(defaultFilters) }

  const activeFilterCount = [
    filters.type, filters.region, filters.city, filters.minRent, filters.maxRent,
    filters.minBedrooms, filters.minBathrooms, filters.furnished, filters.parking,
    filters.amenities.length > 0,
    filters.accessibility.length > 0,
  ].filter(Boolean).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 relative">
          <DoodleStars className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
          <h1 className="text-xl sm:text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">Properties</h1>
          <p className="text-xs sm:text-sm text-muted dark:text-gray-400 mt-0.5 sm:mt-1">
            {isLandlord ? 'Manage your rental portfolio' : `${properties.length} properties found`}
          </p>
        </div>
        {isLandlord && (
          <Link to="/properties/new">
            <Button className="shrink-0"><Plus size={14} /> <span className="hidden sm:inline">Add Property</span><span className="sm:hidden">Add</span></Button>
          </Link>
        )}
      </div>

      {/* Search bar + filter controls */}
      <div className="flex flex-col gap-3">
        {/* Search input — full width */}
        <TextField
          type="text"
          placeholder="Search by location, type, keyword..."
          value={filters.search}
          onChange={(e) => uf('search', e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={18} /></InputAdornment> }, inputLabel: { shrink: true } }}
          fullWidth
        />
        {/* Sort dropdown — full width on mobile, inline on md+ */}
        <div className="w-full md:hidden">
          <TextField
            select
            value={filters.sort}
            onChange={(e) => uf('sort', e.target.value)}
            slotProps={{ select: { renderValue: (v) => SORT_OPTIONS.find((o) => o.value === v)?.label ?? 'Sort' }, input: { startAdornment: <InputAdornment position="start"><ArrowUpDown size={14} /></InputAdornment> } }}
            fullWidth
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { height: 40 }, '& .MuiSelect-select': { fontSize: '0.8125rem' } }}
          >
            {SORT_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
        </div>
        {/* Buttons row — filters + view toggle on mobile; filters + sort + view on md+ */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`h-10 px-3 rounded-xl border text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              showFilters || activeFilterCount > 0
                ? 'bg-primary text-white border-primary'
                : 'border-border dark:border-[#252a3a] text-muted dark:text-gray-400 hover:border-primary/50'
            }`}
          >
            <SlidersHorizontal size={14} />
            Filters
            {activeFilterCount > 0 && <span className="ml-1 bg-white/20 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">{activeFilterCount}</span>}
          </button>
          <div className="hidden md:block flex-1 min-w-[140px] max-w-[200px]">
            <TextField
              select
              value={filters.sort}
              onChange={(e) => uf('sort', e.target.value)}
              slotProps={{ select: { renderValue: (v) => SORT_OPTIONS.find((o) => o.value === v)?.label ?? 'Sort' }, input: { startAdornment: <InputAdornment position="start"><ArrowUpDown size={14} /></InputAdornment> } }}
              fullWidth
              size="small"
              sx={{ '& .MuiOutlinedInput-root': { height: 40 }, '& .MuiSelect-select': { fontSize: '0.8125rem' } }}
            >
              {SORT_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
          </div>
          <div className="flex border border-border dark:border-[#252a3a] rounded-xl overflow-hidden ml-auto">
            <button onClick={() => setView('grid')} className={`h-10 w-10 flex items-center justify-center ${view === 'grid' ? 'bg-primary text-white' : 'text-muted'}`}><Grid3X3 size={14} /></button>
            <button onClick={() => setView('list')} className={`h-10 w-10 flex items-center justify-center ${view === 'list' ? 'bg-primary text-white' : 'text-muted'}`}><List size={14} /></button>
          </div>
        </div>
      </div>

      {/* Expandable filter panel */}
      {showFilters && (
        <Card className="animate-fade-up p-4">
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-primary-dark dark:text-white">Advanced Filters</p>
              <button onClick={clearFilters} className="text-xs text-primary dark:text-blue-400 hover:underline">Clear all</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <TextField
                select
                label="Property Type"
                value={filters.type}
                onChange={(e) => uf('type', e.target.value)}
                slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true, renderValue: (v) => (v as string) ? (v as string).charAt(0).toUpperCase() + (v as string).slice(1) : 'All Types' } }}
              >
                <MenuItem value="">All Types</MenuItem>
                {TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
              <TextField
                select
                label="Region"
                value={filters.region}
                onChange={(e) => uf('region', e.target.value)}
                slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true, renderValue: (v) => (v as string) || 'All Regions' } }}
              >
                <MenuItem value="">All Regions</MenuItem>
                {REGIONS.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </TextField>
              <TextField
                label="City"
                placeholder="e.g. Accra"
                value={filters.city}
                onChange={(e) => uf('city', e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                select
                label="Status"
                value={filters.status}
                onChange={(e) => uf('status', e.target.value)}
                slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true, renderValue: (v) => (v as string) ? (v as string).charAt(0).toUpperCase() + (v as string).slice(1) : 'All Status' } }}
              >
                <MenuItem value="">All Status</MenuItem>
                <MenuItem value="available">Available</MenuItem>
                <MenuItem value="occupied">Occupied</MenuItem>
              </TextField>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <TextField type="number" label="Min Rent (GHS)" placeholder="0" value={filters.minRent} onChange={(e) => uf('minRent', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="number" label="Max Rent (GHS)" placeholder="Any" value={filters.maxRent} onChange={(e) => uf('maxRent', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="number" label="Min Bedrooms" placeholder="Any" value={filters.minBedrooms} onChange={(e) => uf('minBedrooms', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="number" label="Min Bathrooms" placeholder="Any" value={filters.minBathrooms} onChange={(e) => uf('minBathrooms', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </div>
            <div className="flex gap-5 mt-3">
              <label className="flex items-center gap-2 text-sm text-primary-dark dark:text-gray-300 cursor-pointer">
                <Switch checked={filters.furnished} onChange={() => uf('furnished', !filters.furnished)} size="sm" />
                <Sofa size={14} /> Furnished
              </label>
              <label className="flex items-center gap-2 text-sm text-primary-dark dark:text-gray-300 cursor-pointer">
                <Switch checked={filters.parking} onChange={() => uf('parking', !filters.parking)} size="sm" />
                <Car size={14} /> Parking
              </label>
            </div>
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted dark:text-gray-500 mb-2">Amenities</p>
              <div className="flex flex-wrap gap-1.5">
                {AMENITIES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAmenity(a)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      filters.amenities.includes(a)
                        ? 'bg-primary text-white border-primary'
                        : 'border-border dark:border-[#252a3a] text-muted dark:text-gray-400 hover:border-primary/50'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted dark:text-gray-500 mb-2 flex items-center gap-1.5">
                <Accessibility size={12} /> Accessibility
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ACCESSIBILITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleAccessibility(opt.key)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      filters.accessibility.includes(opt.key)
                        ? 'bg-primary text-white border-primary'
                        : 'border-border dark:border-[#252a3a] text-muted dark:text-gray-400 hover:border-primary/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {isLoading ? (
        <div className={view === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5' : 'space-y-3'}>
          {[...Array(6)].map((_, i) => <Skeleton key={i} className={view === 'grid' ? 'h-80 rounded-2xl' : 'h-32 rounded-2xl'} />)}
        </div>
      ) : properties.length === 0 ? (
        <EmptyState
          preset={filters.search ? 'search' : 'properties'}
          action={activeFilterCount > 0 ? { label: 'Clear filters', onClick: clearFilters } : { label: 'Browse all', onClick: clearFilters }}
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map((property) => <PropertyGridCard key={property.id} property={property} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map((property) => <PropertyListCard key={property.id} property={property} />)}
        </div>
      )}

    </div>
  )
}

function PropertyGridCard({ property }: { property: PropertyCard }) {
  const p = property
  const user = useAuthStore((s) => s.user)
  const isOwner = p.landlordId === user?.id
  const qc = useQueryClient()
  const publishMutation = useMutation({
    mutationFn: () => api.post(`/properties/${p.id}/publish`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['properties'] }) },
  })

  return (
    <div className="relative" data-testid="property-card">
      <Link to={`/properties/${p.id}`}>
        <Card className="group overflow-hidden p-0 hover:shadow-xl dark:hover:shadow-black/30 hover:-translate-y-1 transition-all cursor-pointer">
          {/* Image */}
          <div className="relative h-44 bg-gradient-to-br from-primary/10 to-accent/5 dark:from-primary/20 dark:to-accent/10 flex items-center justify-center overflow-hidden">
            {p.images?.length > 0 ? (
              <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            ) : (
              <Building2 size={40} className="text-primary/20" />
            )}
            <div className="absolute top-3 left-3 flex gap-1.5">
              <Badge variant={statusVariant[p.status as PropertyStatus]} className="backdrop-blur">{p.status?.replace('_', ' ')}</Badge>
              {p.listingStatus && p.listingStatus !== 'approved' && (
                <Badge variant={listingStatusVariant[p.listingStatus] ?? 'default'} className="backdrop-blur">{listingStatusLabel[p.listingStatus] ?? p.listingStatus}</Badge>
              )}
            </div>
            <div className="absolute top-3 right-3 flex gap-1.5">
              {p.furnished && <span className="bg-white/80 dark:bg-black/50 backdrop-blur text-[10px] font-semibold px-2 py-0.5 rounded-full text-primary-dark dark:text-white"><Sofa size={10} className="inline mr-0.5" />Furnished</span>}
            </div>
            <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
            <p className="absolute bottom-2 left-3 text-white text-lg font-extrabold font-display">{formatCurrency(p.rentAmount)}<span className="text-xs font-normal opacity-70">/mo</span></p>
          </div>

          {/* Body */}
          <div className="p-4">
            <h3 className="text-sm font-bold text-primary-dark dark:text-white truncate group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">{p.title}</h3>
            <div className="flex items-center gap-1 text-xs text-muted dark:text-gray-500 mt-1">
              <MapPin size={11} />
              <span className="truncate">{p.address?.neighborhood ? `${p.address.neighborhood}, ` : ''}{p.address?.city}, {p.address?.region}</span>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50 dark:border-[#252a3a]/50">
              <span className="flex items-center gap-1 text-xs text-muted dark:text-gray-500"><Bed size={13} />{p.bedrooms ?? 1}</span>
              <span className="flex items-center gap-1 text-xs text-muted dark:text-gray-500"><Bath size={13} />{p.bathrooms ?? 1}</span>
              {(p.parkingSpaces ?? 0) > 0 && <span className="flex items-center gap-1 text-xs text-muted dark:text-gray-500"><Car size={13} />{p.parkingSpaces}</span>}
              {p.floorArea && <span className="text-xs text-muted dark:text-gray-500">{p.floorArea}m²</span>}
              <span className="ml-auto flex items-center gap-1 text-[10px] text-muted dark:text-gray-600"><Eye size={11} />{p.views ?? 0}</span>
            </div>

            {/* Match score if present */}
            {p.matchScore && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-surface dark:bg-[#0c0e1a] overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${p.matchScore}%` }} />
                </div>
                <span className="text-[10px] font-bold text-accent">{p.matchScore}% match</span>
              </div>
            )}

            {/* Publish button for draft properties */}
            {isOwner && p.listingStatus === 'draft' && (
              <div className="mt-3 pt-3 border-t border-border/50 dark:border-[#252a3a]/50">
                <Button
                  size="sm"
                  className="w-full"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); publishMutation.mutate() }}
                  disabled={publishMutation.isPending}
                >
                  <Send size={12} /> {publishMutation.isPending ? 'Publishing...' : 'Publish'}
                </Button>
                {publishMutation.isError && (
                  <p className="text-[10px] text-danger mt-1">{publishMutation.error instanceof Error ? publishMutation.error.message : 'Publish failed'}</p>
                )}
              </div>
            )}
          </div>
        </Card>
      </Link>
    </div>
  )
}

function PropertyListCard({ property }: { property: PropertyCard }) {
  const p = property
  const user = useAuthStore((s) => s.user)
  const isOwner = p.landlordId === user?.id
  const qc = useQueryClient()
  const publishMutation = useMutation({
    mutationFn: () => api.post(`/properties/${p.id}/publish`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['properties'] }) },
  })

  return (
    <Link to={`/properties/${p.id}`} data-testid="property-card">
      <Card className="group flex flex-col sm:flex-row overflow-hidden p-0 hover:shadow-xl dark:hover:shadow-black/30 transition-all cursor-pointer">
        <div className="h-40 sm:h-auto sm:w-48 flex-shrink-0 bg-gradient-to-br from-primary/10 to-accent/5 dark:from-primary/20 dark:to-accent/10 flex items-center justify-center relative overflow-hidden">
          {p.images?.length > 0 ? (
            <img src={p.images[0]} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <Building2 size={28} className="text-primary/20" />
          )}
          <div className="absolute top-2 left-2 flex gap-1">
            <Badge variant={statusVariant[p.status as PropertyStatus]} className="text-[10px]">{p.status?.replace('_', ' ')}</Badge>
            {p.listingStatus && p.listingStatus !== 'approved' && (
              <Badge variant={listingStatusVariant[p.listingStatus] ?? 'default'} className="text-[10px]">{listingStatusLabel[p.listingStatus] ?? p.listingStatus}</Badge>
            )}
          </div>
        </div>
        <div className="flex-1 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-primary-dark dark:text-white group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">{p.title}</h3>
                <div className="flex items-center gap-1 text-xs text-muted dark:text-gray-500 mt-0.5">
                  <MapPin size={11} />
                  {p.address?.city}, {p.address?.region}
                </div>
              </div>
              <p className="text-lg font-extrabold font-display text-primary dark:text-blue-400 flex-shrink-0">{formatCurrency(p.rentAmount)}<span className="text-[10px] font-normal text-muted dark:text-gray-500">/mo</span></p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-xs text-muted dark:text-gray-500"><Bed size={13} /> {p.bedrooms ?? 1} bed</span>
            <span className="flex items-center gap-1 text-xs text-muted dark:text-gray-500"><Bath size={13} /> {p.bathrooms ?? 1} bath</span>
            {p.furnished && <Badge variant="muted" className="text-[10px]">Furnished</Badge>}
            {(p.parkingSpaces ?? 0) > 0 && <Badge variant="muted" className="text-[10px]">Parking</Badge>}
            {isOwner && p.listingStatus === 'draft' && (
              <Button
                size="sm"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); publishMutation.mutate() }}
                disabled={publishMutation.isPending}
              >
                <Send size={12} /> {publishMutation.isPending ? 'Publishing...' : 'Publish'}
              </Button>
            )}
            <span className="ml-auto flex items-center gap-1 text-[10px] text-muted dark:text-gray-600"><Eye size={11} />{p.views ?? 0} views</span>
          </div>
        </div>
      </Card>
    </Link>
  )
}

