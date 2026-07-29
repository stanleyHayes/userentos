import { useState, type FormEvent } from 'react'
import TextField from '@mui/material/TextField'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { DashboardHero, DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency } from '@/lib/utils'
import {
  useMyBusiness,
  useUpsertMyBusiness,
  useCreateBusinessListing,
  useUpdateBusinessListing,
  useDeleteBusinessListing,
  useMyBusinessInquiries,
  useMyBusinessAnalytics,
  useUpdateBusinessInquiry,
  businessCategoryLabel,
  BUSINESS_CATEGORY_OPTIONS,
  type Business,
  type BusinessCategory,
  type BusinessListing,
  type BusinessInquiry,
  type BusinessInquiryStatus,
} from '@/hooks/useApi'
import toast from 'react-hot-toast'
import { Store, Package, Truck, Percent, Plus, Loader2, Trash2, MapPin, Phone, PackageCheck, Tag, Inbox, Eye, TrendingUp, Mail, CheckCircle2, XCircle } from 'lucide-react'

const LISTING_TYPE_OPTIONS: { value: BusinessListing['type']; label: string }[] = [
  { value: 'product', label: 'Product' },
  { value: 'service', label: 'Service' },
  { value: 'discount', label: 'Discount' },
]

const LISTING_TYPE_VARIANTS: Record<BusinessListing['type'], 'default' | 'success' | 'warning'> = {
  product: 'default',
  service: 'success',
  discount: 'warning',
}

const LISTING_TYPE_ICONS: Record<BusinessListing['type'], React.ReactNode> = {
  product: <Package size={14} />,
  service: <Truck size={14} />,
  discount: <Percent size={14} />,
}

export function BusinessDashboard() {
  const user = useAuthStore((s) => s.user)
  const { data, isLoading } = useMyBusiness()
  const business = data?.business ?? null
  const listings = data?.listings ?? []

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  if (!business) {
    return <BusinessSetupCard defaultPhone={user?.phone ?? ''} defaultEmail={user?.email ?? ''} />
  }

  return <BusinessOverview business={business} listings={listings} />
}

/** Shown when the owner has no business profile yet — POST /businesses/me upsert. */
function BusinessSetupCard({ defaultPhone, defaultEmail }: { defaultPhone: string; defaultEmail: string }) {
  const upsert = useUpsertMyBusiness()
  const [form, setForm] = useState({
    name: '',
    category: 'furniture' as BusinessCategory,
    city: '',
    phone: defaultPhone,
    email: defaultEmail,
    description: '',
  })

  const canSubmit = form.name.trim().length >= 2 && form.phone.trim().length >= 7 && !!form.city.trim()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    try {
      await upsert.mutateAsync({
        name: form.name.trim(),
        category: form.category,
        phone: form.phone.trim(),
        city: form.city.trim(),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      })
      toast.success('Business profile created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your business profile')
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <DashboardHero
        eyebrow="Local business portal"
        title="Set up your business"
        description="Create your public business profile so renters can discover your products, services, and discounts"
        tone="employer"
        watermarkIcon={Store}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Business profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <TextField id="biz-name" label="Business name *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} fullWidth placeholder="e.g. Adwoa Furniture Hub" slotProps={{ inputLabel: { shrink: true } }} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select id="biz-category" label="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as BusinessCategory }))} options={BUSINESS_CATEGORY_OPTIONS} />
              <CityAutocomplete id="biz-city" label="City *" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField id="biz-phone" label="Phone *" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
              <TextField id="biz-email" label="Email (optional)" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
            </div>
            <TextField id="biz-description" label="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} fullWidth multiline rows={3} placeholder="Tell renters what you offer — delivery areas, brands, installation, support..." slotProps={{ inputLabel: { shrink: true } }} />
            <div className="flex justify-end">
              <Button type="submit" disabled={!canSubmit || upsert.isPending}>
                {upsert.isPending ? <Loader2 size={16} className="animate-spin" /> : <><Store size={14} /> Create Business Profile</>}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function BusinessOverview({ business, listings }: { business: Business; listings: BusinessListing[] }) {
  const updateListing = useUpdateBusinessListing()
  const deleteListing = useDeleteBusinessListing()
  const [showCreate, setShowCreate] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<BusinessListing | null>(null)

  const activeDiscounts = listings.filter((l) => l.type === 'discount' && l.isActive).length
  const activeOffers = listings.filter((l) => l.type !== 'discount' && l.isActive).length

  async function toggleActive(listing: BusinessListing) {
    try {
      await updateListing.mutateAsync({ id: listing.id, isActive: !listing.isActive })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the listing')
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await deleteListing.mutateAsync(pendingDelete.id)
      toast.success('Listing deleted')
      setPendingDelete(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the listing')
    }
  }

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Local business portal"
        title={business.name}
        description={
          <>
            {businessCategoryLabel(business.category)} · <MapPin size={11} className="inline -mt-0.5" /> {business.city} · <Phone size={11} className="inline -mt-0.5" /> {business.phone}
          </>
        }
        tone="employer"
        watermarkIcon={Store}
        actions={
          <Badge variant={business.isVerified ? 'success' : 'warning'} className="text-[10px]">
            {business.isVerified ? 'Verified' : 'Pending verification'}
          </Badge>
        }
      />

      <BusinessAnalyticsCards fallbackListings={listings.length} />

      <InquiryPipeline />

      <div className="stagger-3d grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
        <DashboardMetricCard label="Total Listings" value={String(listings.length)} sub={`${listings.filter((l) => l.isActive).length} active`} accent="#3b82f6" icon={<Package size={18} />} />
        <DashboardMetricCard label="Active Discounts" value={String(activeDiscounts)} sub="Promos visible to renters" accent="#f59e0b" icon={<Tag size={18} />} />
        <DashboardMetricCard label="Active Products & Services" value={String(activeOffers)} sub="Visible on Local Services" accent="#10b981" icon={<PackageCheck size={18} />} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Listings</CardTitle>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> New Listing</Button>
          </div>
        </CardHeader>
        <CardContent>
          {listings.length === 0 ? (
            <EmptyState preset="general" title="No listings yet" description="Add products, services, or discount offers — they appear on the Local Services page for renters near you." action={{ label: 'Create Listing', onClick: () => setShowCreate(true) }} compact />
          ) : (
            <div className="space-y-1.5">
              {listings.map((listing) => (
                <div key={listing.id} className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-surface dark:hover:bg-[#0c0e1a]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-muted dark:text-gray-500">{LISTING_TYPE_ICONS[listing.type]}</span>
                      <p className="text-sm font-bold text-primary-dark dark:text-white truncate">{listing.title}</p>
                      <Badge variant={LISTING_TYPE_VARIANTS[listing.type]} className="text-[9px] capitalize">{listing.type}</Badge>
                    </div>
                    <p className="text-[11px] text-muted dark:text-gray-500 truncate mt-0.5">
                      {listing.type === 'discount' && listing.promoText
                        ? <span className="text-amber-600 dark:text-amber-400 font-semibold">{listing.promoText}</span>
                        : listing.description ?? ''}
                      {listing.price !== undefined && ` · ${formatCurrency(listing.price)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => void toggleActive(listing)}
                      disabled={updateListing.isPending}
                      className={`relative h-5 w-9 rounded-full transition-colors ${listing.isActive ? 'bg-accent' : 'bg-gray-300 dark:bg-[#252a3a]'}`}
                      aria-label={listing.isActive ? 'Deactivate listing' : 'Activate listing'}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${listing.isActive ? 'translate-x-4.5 left-0.5' : 'translate-x-0 left-0.5'}`} />
                    </button>
                    <span className={`text-[10px] font-semibold ${listing.isActive ? 'text-accent' : 'text-muted dark:text-gray-500'}`}>
                      {listing.isActive ? 'Active' : 'Hidden'}
                    </span>
                    <button type="button" onClick={() => setPendingDelete(listing)} className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors" aria-label="Delete listing">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && <CreateListingModal onClose={() => setShowCreate(false)} />}

      <Modal open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Delete listing">
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted dark:text-gray-400">
            Delete <span className="font-semibold text-primary-dark dark:text-white">{pendingDelete?.title}</span>? Renters will no longer see this offer.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button type="button" onClick={() => void confirmDelete()} disabled={deleteListing.isPending}>
              {deleteListing.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

const INQUIRY_STATUS: { value: BusinessInquiryStatus; label: string; icon: React.ReactNode }[] = [
  { value: 'new', label: 'New', icon: <Inbox size={13} /> },
  { value: 'contacted', label: 'Contacted', icon: <Phone size={13} /> },
  { value: 'won', label: 'Won', icon: <CheckCircle2 size={13} /> },
  { value: 'lost', label: 'Lost', icon: <XCircle size={13} /> },
]

function BusinessAnalyticsCards({ fallbackListings }: { fallbackListings: number }) {
  const { data } = useMyBusinessAnalytics()
  return (
    <div className="stagger-3d grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
      <DashboardMetricCard label="Profile Views" value={String(data?.profileViews ?? 0)} sub="Directory profile opens" accent="#3b82f6" icon={<Eye size={18} />} />
      <DashboardMetricCard label="Listing Views" value={String(data?.listingViews ?? 0)} sub={`${fallbackListings} published listings`} accent="#8b5cf6" icon={<Package size={18} />} />
      <DashboardMetricCard label="Inquiries" value={String(data?.totalInquiries ?? 0)} sub={`${data?.newInquiries ?? 0} need a response`} accent="#f59e0b" icon={<Inbox size={18} />} />
      <DashboardMetricCard label="Conversion" value={`${data?.conversionRate ?? 0}%`} sub={`${data?.wonInquiries ?? 0} inquiries won`} accent="#10b981" icon={<TrendingUp size={18} />} />
    </div>
  )
}

function InquiryPipeline() {
  const [filter, setFilter] = useState<BusinessInquiryStatus | ''>('')
  const { data, isLoading } = useMyBusinessInquiries(filter)
  const update = useUpdateBusinessInquiry()
  const inquiries = data?.items ?? []

  async function move(inquiry: BusinessInquiry, status: BusinessInquiryStatus) {
    try {
      await update.mutateAsync({ id: inquiry.id, status })
      toast.success(`Inquiry marked ${status}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update inquiry')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm">Inquiry pipeline</CardTitle>
            <p className="mt-1 text-xs text-muted dark:text-gray-400">Follow every renter request from first contact to a won opportunity.</p>
          </div>
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => setFilter('')} className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${filter === '' ? 'bg-primary text-white' : 'neumorphic-icon text-muted'}`}>All</button>
            {INQUIRY_STATUS.map((item) => (
              <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${filter === item.value ? 'bg-primary text-white' : 'neumorphic-icon text-muted'}`}>
                {item.icon}{item.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary" /></div>
        ) : inquiries.length === 0 ? (
          <EmptyState preset="general" icon={<Inbox size={36} />} title="No inquiries here" description={filter ? `No ${filter} inquiries right now.` : 'New quote and interest requests from renters will appear here.'} compact />
        ) : (
          <div className="space-y-2">
            {inquiries.map((inquiry) => (
              <div key={inquiry.id} className="rounded-xl border border-border/70 p-3 dark:border-[#252a3a]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-primary-dark dark:text-white">{inquiry.requesterName}</p>
                      <Badge variant={inquiry.status === 'won' ? 'success' : inquiry.status === 'lost' ? 'danger' : inquiry.status === 'new' ? 'warning' : 'default'} className="text-[9px] capitalize">{inquiry.status}</Badge>
                      {inquiry.listingTitle && <span className="text-[11px] text-muted">Re: {inquiry.listingTitle}</span>}
                    </div>
                    {inquiry.message && <p className="mt-1.5 text-xs leading-relaxed text-muted dark:text-gray-400">{inquiry.message}</p>}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                      <a href={`tel:${inquiry.requesterPhone}`} className="flex items-center gap-1 font-semibold text-primary hover:underline"><Phone size={11} />{inquiry.requesterPhone}</a>
                      {inquiry.requesterEmail && <a href={`mailto:${inquiry.requesterEmail}`} className="flex items-center gap-1 font-semibold text-primary hover:underline"><Mail size={11} />{inquiry.requesterEmail}</a>}
                      <span className="text-muted">{new Date(inquiry.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 lg:justify-end">
                    {INQUIRY_STATUS.filter((item) => item.value !== inquiry.status).map((item) => (
                      <button key={item.value} type="button" disabled={update.isPending} onClick={() => void move(inquiry, item.value)} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-semibold text-muted transition-colors hover:border-primary/50 hover:text-primary dark:border-[#252a3a]">
                        {item.icon}{item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CreateListingModal({ onClose }: { onClose: () => void }) {
  const createListing = useCreateBusinessListing()
  const [form, setForm] = useState({
    title: '',
    type: 'product' as BusinessListing['type'],
    price: '',
    promoText: '',
    description: '',
    imageUrls: '',
    stockQuantity: '',
    newMoverOnly: false,
  })

  const canSubmit = form.title.trim().length >= 2 && (form.price === '' || Number(form.price) >= 0)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    try {
      await createListing.mutateAsync({
        title: form.title.trim(),
        type: form.type,
        ...(form.price !== '' && Number(form.price) >= 0 ? { price: Number(form.price) } : {}),
        ...(form.promoText.trim() ? { promoText: form.promoText.trim() } : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.imageUrls.trim() ? { images: form.imageUrls.split(',').map((value) => value.trim()).filter(Boolean) } : {}),
        ...(form.stockQuantity !== '' ? { stockQuantity: Number(form.stockQuantity) } : {}),
        newMoverOnly: form.newMoverOnly,
      })
      toast.success('Listing created')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the listing')
    }
  }

  return (
    <Modal open onClose={onClose} title="New listing">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField id="listing-title" label="Title *" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} fullWidth placeholder="e.g. Double bed + mattress" autoFocus slotProps={{ inputLabel: { shrink: true } }} />
        <div className="grid grid-cols-2 gap-4">
          <Select id="listing-type" label="Type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as BusinessListing['type'] }))} options={LISTING_TYPE_OPTIONS} />
          <TextField id="listing-price" label="Price (GHS, optional)" type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} fullWidth placeholder="Optional" slotProps={{ inputLabel: { shrink: true } }} />
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-muted">
          <input type="checkbox" checked={form.newMoverOnly} onChange={(event) => setForm((f) => ({ ...f, newMoverOnly: event.target.checked }))} />
          Show only to tenants who signed a lease in this city within 30 days
        </label>
        {form.type === 'discount' && (
          <TextField id="listing-promo" label="Promo text" value={form.promoText} onChange={(e) => setForm((f) => ({ ...f, promoText: e.target.value }))} fullWidth placeholder="e.g. 15% off for new renters" slotProps={{ inputLabel: { shrink: true } }} />
        )}
        <TextField id="listing-description" label="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} fullWidth multiline rows={3} slotProps={{ inputLabel: { shrink: true } }} />
        <div className="grid grid-cols-2 gap-4">
          <TextField id="listing-images" label="Image URLs" value={form.imageUrls} onChange={(e) => setForm((f) => ({ ...f, imageUrls: e.target.value }))} fullWidth placeholder="Comma-separated" slotProps={{ inputLabel: { shrink: true } }} />
          <TextField id="listing-stock" label="Stock quantity" type="number" value={form.stockQuantity} onChange={(e) => setForm((f) => ({ ...f, stockQuantity: e.target.value }))} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!canSubmit || createListing.isPending}>
            {createListing.isPending ? 'Creating...' : 'Create Listing'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
