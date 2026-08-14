import { useState } from 'react'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
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
  useBusiness,
  useBusinessReviews,
  useCreateBusinessInquiry,
  useUpsertBusinessReview,
} from '@/hooks/useApi'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { Store, MapPin, Phone, Mail, Search, ShieldCheck, Package, Truck, Percent, MessageSquare, Star, Loader2 } from 'lucide-react'

const LISTING_TYPE_ICONS: Record<BusinessListing['type'], React.ReactNode> = {
  product: <Package size={13} />,
  service: <Truck size={13} />,
  discount: <Percent size={13} />,
}

function ListingRow({ listing }: { listing: BusinessListing }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      {listing.images?.[0] && <img src={listing.images[0]} alt="" className="h-9 w-9 rounded-lg object-cover" />}
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
      {listing.stockQuantity !== undefined && <span className="text-[10px] text-muted">{listing.stockQuantity} in stock</span>}
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
            {business.featuredUntil && new Date(business.featuredUntil) > new Date() && <Badge variant="warning" className="text-[9px]">Featured</Badge>}
          </h3>
          <p className="text-xs text-muted dark:text-gray-500 mt-0.5 flex items-center gap-1">
            <MapPin size={10} /> {business.city}
          </p>
          {business.reviewCount > 0 && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              <Star size={11} fill="currentColor" /> {business.ratingAvg.toFixed(1)} <span className="font-normal text-muted">({business.reviewCount})</span>
            </p>
          )}
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
  const detail = useBusiness(item.business.id)
  const business = detail.data?.business ?? item.business
  const listings = detail.data?.listings ?? item.listings
  const user = useAuthStore((s) => s.user)
  const { data: reviewsData } = useBusinessReviews(business.id)
  const inquiry = useCreateBusinessInquiry()
  const submitReview = useUpsertBusinessReview()
  const [inquiryForm, setInquiryForm] = useState<{ listingId?: string; message: string } | null>(null)
  const [reviewForm, setReviewForm] = useState<{ rating: number; review: string } | null>(null)
  const reviews = reviewsData?.items ?? []
  const canContact = user?.activeRole !== 'business'

  async function sendInquiry() {
    if (!inquiryForm) return
    try {
      await inquiry.mutateAsync({
        businessId: business.id,
        ...(inquiryForm.listingId ? { listingId: inquiryForm.listingId } : {}),
        ...(inquiryForm.message.trim() ? { message: inquiryForm.message.trim() } : {}),
      })
      toast.success('Your request was sent to the business')
      setInquiryForm(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send your request')
    }
  }

  async function saveReview() {
    if (!reviewForm) return
    try {
      await submitReview.mutateAsync({ businessId: business.id, rating: reviewForm.rating, ...(reviewForm.review.trim() ? { review: reviewForm.review.trim() } : {}) })
      toast.success('Review saved')
      setReviewForm(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save review')
    }
  }

  async function placeOrder(listing: BusinessListing) {
    try {
      await api.post('/capabilities/workflows', {
        kind: 'business_order',
        participantId: business.ownerId,
        status: 'requested',
        data: { listingId: listing.id, title: listing.title, amount: listing.price ?? 0, fulfillment: listing.type === 'service' ? 'schedule_required' : 'delivery_required' },
      })
      toast.success('Order request sent to the business')
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

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
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted dark:text-gray-500">Offers</p>
            {canContact && <Button size="sm" onClick={() => setInquiryForm({ message: '' })}><MessageSquare size={13} /> Request a quote</Button>}
          </div>
          {listings.length === 0 ? (
            <p className="text-xs text-muted dark:text-gray-500 italic">No active offers right now.</p>
          ) : (
            <div className="divide-y divide-border/50 dark:divide-[#252a3a]/50">
              {listings.map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><ListingRow listing={l} /></div>
                  {canContact && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setInquiryForm({ listingId: l.id, message: '' })} className="rounded-lg border border-border px-2 py-1 text-[10px] font-semibold text-primary hover:border-primary/50 dark:border-[#252a3a]">Interested</button>
                      {l.type !== 'discount' && <button type="button" onClick={() => void placeOrder(l)} className="rounded-lg bg-primary px-2 py-1 text-[10px] font-semibold text-white">Order</button>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/60 pt-4 dark:border-[#252a3a]">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted dark:text-gray-500">
              <Star size={13} /> Reviews ({reviews.length})
            </p>
            {reviewsData?.canReview && <button type="button" onClick={() => setReviewForm({ rating: 5, review: '' })} className="text-xs font-semibold text-primary hover:underline">Write a review</button>}
          </div>
          {reviews.length === 0 ? (
            <p className="text-xs italic text-muted">No verified-customer reviews yet.</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className="rounded-xl bg-surface/70 p-3 dark:bg-[#0c0e1a]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-primary-dark dark:text-white">{review.authorName}</p>
                    <span className="flex text-amber-500">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={11} fill={i < review.rating ? 'currentColor' : 'none'} />)}</span>
                  </div>
                  {review.review && <p className="mt-1 text-xs leading-relaxed text-muted dark:text-gray-400">{review.review}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {inquiryForm && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-sm font-bold text-primary-dark dark:text-white">Send an inquiry</p>
            <p className="mt-0.5 text-xs text-muted">{inquiryForm.listingId ? `About ${listings.find((l) => l.id === inquiryForm.listingId)?.title ?? 'this offer'}` : 'Ask for a quote or more information.'}</p>
            <TextField value={inquiryForm.message} onChange={(e) => setInquiryForm((current) => current ? { ...current, message: e.target.value } : null)} label="Message (optional)" multiline rows={3} fullWidth margin="normal" slotProps={{ inputLabel: { shrink: true } }} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setInquiryForm(null)}>Cancel</Button>
              <Button size="sm" disabled={inquiry.isPending} onClick={() => void sendInquiry()}>{inquiry.isPending ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />} Send request</Button>
            </div>
          </div>
        )}

        {reviewForm && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-sm font-bold text-primary-dark dark:text-white">Your verified-customer review</p>
            <div className="my-3 flex gap-1">
              {Array.from({ length: 5 }, (_, i) => (
                <button key={i} type="button" aria-label={`${i + 1} stars`} onClick={() => setReviewForm((current) => current ? { ...current, rating: i + 1 } : null)} className="text-amber-500">
                  <Star size={22} fill={i < reviewForm.rating ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
            <TextField value={reviewForm.review} onChange={(e) => setReviewForm((current) => current ? { ...current, review: e.target.value } : null)} label="Review (optional)" multiline rows={3} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setReviewForm(null)}>Cancel</Button>
              <Button size="sm" disabled={submitReview.isPending} onClick={() => void saveReview()}>Save review</Button>
            </div>
          </div>
        )}
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
    <div className="space-y-5">
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
