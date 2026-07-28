import { useState } from 'react'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { GridSkeleton } from '@/components/ui/Skeleton'
import { cn, formatCurrency } from '@/lib/utils'
import {
  useBusinesses,
  businessCategoryLabel,
  BUSINESS_CATEGORY_OPTIONS,
  type BusinessCategory,
  type BusinessListing,
  type BusinessWithListings,
} from '@/hooks/useApi'
import { Store, MapPin, Phone, Mail, Search, ShieldCheck, Package, Truck, Percent } from 'lucide-react'

const LISTING_TYPE_ICONS: Record<BusinessListing['type'], React.ReactNode> = {
  product: <Package size={13} />,
  service: <Truck size={13} />,
  discount: <Percent size={13} />,
}

function ListingRow({ listing }: { listing: BusinessListing }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn('flex-shrink-0', listing.type === 'discount' ? 'text-amber-500' : 'text-muted dark:text-gray-500')}>
          {LISTING_TYPE_ICONS[listing.type]}
        </span>
        <span className="text-xs font-medium text-primary-dark dark:text-white truncate">{listing.title}</span>
      </div>
      <span className={cn('text-xs flex-shrink-0', listing.type === 'discount' ? 'font-bold text-amber-600 dark:text-amber-400' : 'font-semibold text-muted dark:text-gray-400')}>
        {listing.type === 'discount'
          ? (listing.promoText ?? 'Promo')
          : listing.price !== undefined ? formatCurrency(listing.price) : ''}
      </span>
    </div>
  )
}

function BusinessCard({ item, onOpen }: { item: BusinessWithListings; onOpen: () => void }) {
  const { business, listings } = item
  return (
    <Card className="cursor-pointer flex flex-col" onClick={onOpen}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-primary-dark dark:text-white flex items-center gap-1.5 truncate">
            {business.name}
            {business.isVerified && <ShieldCheck size={14} className="flex-shrink-0 text-green-500" />}
          </h3>
          <p className="text-xs text-muted dark:text-gray-500 mt-0.5 flex items-center gap-1">
            <MapPin size={10} /> {business.city}
          </p>
        </div>
        <Badge variant="muted" className="text-[10px] flex-shrink-0">{businessCategoryLabel(business.category)}</Badge>
      </div>

      {business.description && (
        <p className="text-xs text-muted dark:text-gray-400 mt-2 line-clamp-2">{business.description}</p>
      )}

      <div className="mt-3 pt-3 border-t border-border/50 dark:border-[#252a3a]/50 flex-1">
        {listings.length === 0 ? (
          <p className="text-[11px] text-muted dark:text-gray-500 italic">No active offers right now</p>
        ) : (
          <>
            {listings.slice(0, 3).map((l) => <ListingRow key={l.id} listing={l} />)}
            {listings.length > 3 && (
              <p className="text-[11px] text-primary dark:text-blue-400 font-semibold mt-1">+{listings.length - 3} more</p>
            )}
          </>
        )}
      </div>

      <p className="text-[11px] text-muted dark:text-gray-500 mt-3 flex items-center gap-1">
        <Phone size={10} /> {business.phone}
      </p>
    </Card>
  )
}

function BusinessDetailModal({ item, onClose }: { item: BusinessWithListings; onClose: () => void }) {
  const { business, listings } = item
  return (
    <Modal open onClose={onClose} title={business.name}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" className="text-[10px]">{businessCategoryLabel(business.category)}</Badge>
          {business.isVerified ? (
            <Badge variant="success" className="text-[10px]"><ShieldCheck size={10} /> Verified</Badge>
          ) : (
            <Badge variant="muted" className="text-[10px]">Not yet verified</Badge>
          )}
        </div>

        {business.description && (
          <p className="text-sm text-muted dark:text-gray-400 leading-relaxed">{business.description}</p>
        )}

        <div className="neumorphic-inset rounded-xl p-3 space-y-1.5">
          <p className="text-xs text-muted dark:text-gray-400 flex items-center gap-2"><MapPin size={12} className="flex-shrink-0" /> {business.address ? `${business.address}, ` : ''}{business.city}</p>
          <a href={`tel:${business.phone}`} className="text-xs text-primary dark:text-blue-400 font-semibold flex items-center gap-2 hover:underline"><Phone size={12} className="flex-shrink-0" /> {business.phone}</a>
          {business.email && (
            <a href={`mailto:${business.email}`} className="text-xs text-primary dark:text-blue-400 font-semibold flex items-center gap-2 hover:underline"><Mail size={12} className="flex-shrink-0" /> {business.email}</a>
          )}
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted dark:text-gray-500 mb-2">Offers</p>
          {listings.length === 0 ? (
            <p className="text-xs text-muted dark:text-gray-500 italic">No active offers right now.</p>
          ) : (
            <div className="divide-y divide-border/50 dark:divide-[#252a3a]/50">
              {listings.map((l) => <ListingRow key={l.id} listing={l} />)}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

export function LocalServicesPage() {
  const [category, setCategory] = useState<BusinessCategory | ''>('')
  const [city, setCity] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<BusinessWithListings | null>(null)

  const { data, isLoading } = useBusinesses({ category, city, search })
  const items = data?.items ?? []

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary-dark dark:text-white flex items-center gap-2">
          <Store className="text-primary" size={24} />
          Local Services
        </h1>
        <p className="text-muted text-sm mt-1">Furniture, appliances, internet, moving and cleaning offers near you.</p>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          type="button"
          onClick={() => setCategory('')}
          className={cn(
            'text-xs px-3 py-1.5 rounded-lg border transition-colors',
            !category
              ? 'bg-primary text-white border-primary'
              : 'neumorphic-icon border-border/70 text-muted dark:text-gray-400 hover:border-primary/40',
          )}
        >
          All
        </button>
        {BUSINESS_CATEGORY_OPTIONS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(category === c.value ? '' : c.value)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-lg border transition-colors',
              category === c.value
                ? 'bg-primary text-white border-primary'
                : 'neumorphic-icon border-border/70 text-muted dark:text-gray-400 hover:border-primary/40',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* City + search filters */}
      <Card className="p-4 mb-6">
        <div className="grid md:grid-cols-2 gap-3">
          <CityAutocomplete id="ls-city" label="City" value={city} onChange={setCity} />
          <TextField
            id="ls-search"
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Business name, product, service..."
            fullWidth
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={18} /></InputAdornment>, className: 'neumorphic-inset rounded-xl' }, inputLabel: { shrink: true } }}
          />
        </div>
      </Card>

      {/* Business grid */}
      {isLoading ? (
        <GridSkeleton cols={3} count={6} />
      ) : items.length === 0 ? (
        <EmptyState preset="search" title="No businesses found" description="No local businesses match your filters yet — try another category or city." />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <BusinessCard key={item.business.id} item={item} onOpen={() => setSelected(item)} />
          ))}
        </div>
      )}

      {selected && <BusinessDetailModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
