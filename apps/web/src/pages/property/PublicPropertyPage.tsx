import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowLeft, BadgeCheck, Bath, BedDouble, Building2, Calendar, Car, Check, Globe, Heart, Home, Lock,
  MapPin, MessageSquare, Ruler, ShieldCheck, Sofa, Warehouse,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DetailSkeleton } from '@/components/ui/Skeleton'
import { ShareListingPanel } from '@/components/listings/ShareListing'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { applySeo, setJsonLd } from '@/lib/seo'
import { useAuthStore } from '@/stores/authStore'
import { acceptsRentalApplications, formatListingPrice, listingPath, listingTypeMeta } from '../../../../../packages/shared/listingTypes'
import { SCHEMA_TYPES, TYPE_LABELS, apiBase, listingLocation, shareUrlFor, usePublicListing, type PublicListing } from '@/lib/publicListing'

function WhatsAppGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.84 9.84 0 0 0 12.04 2Zm5.8 14.1c-.24.68-1.42 1.3-1.95 1.35-.5.05-1.13.07-1.83-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.27-.29.58-.36.78-.36h.56c.18 0 .42-.07.66.5.24.58.82 2.01.89 2.16.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.3-.13.59.17.29.74 1.22 1.59 1.97 1.09.97 2.01 1.27 2.3 1.41.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.65-.14.26.1 1.68.79 1.97.94.29.14.48.21.55.33.07.12.07.7-.17 1.38Z" />
    </svg>
  )
}

/**
 * The WhatsApp enquiry (brief §05). The API finds the agent who handles the
 * listing and answers a wa.me link with the property already in the message;
 * a signed-in visitor also becomes a lead the agent is alerted to. Signed-out
 * visitors are asked once whether to sign in first, then can carry on.
 */
export function WhatsAppEnquiryButton({ listing, className = '' }: { listing: Pick<PublicListing, 'id' | 'ref' | 'agent'>; className?: string }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()
  const navigate = useNavigate()
  const [askToSignIn, setAskToSignIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const key = listing.ref ?? listing.id

  async function open() {
    setAskToSignIn(false)
    setBusy(true)
    // Opened now, while this is still a click: a window opened after the
    // request returns would be stopped by the browser's pop-up blocker.
    const popup = window.open('about:blank', '_blank')
    try {
      const result = isAuthenticated
        ? await api.post<{ url: string }>(`/public/properties/${encodeURIComponent(key)}/whatsapp`, {})
        : await (async () => {
          const response = await fetch(`${apiBase()}/public/properties/${encodeURIComponent(key)}/whatsapp`, { method: 'POST' })
          const json = await response.json().catch(() => ({}))
          if (!response.ok || !json.success) throw new Error(json.error || 'WhatsApp is not available for this listing')
          return json.data as { url: string }
        })()
      if (popup) {
        popup.opener = null
        popup.location.href = result.url
      } else {
        window.location.href = result.url
      }
    } catch (err) {
      popup?.close()
      toast.error(err instanceof Error ? err.message : 'WhatsApp is not available for this listing')
    } finally {
      setBusy(false)
    }
  }

  function signInFirst() {
    try { sessionStorage.setItem('postAuthRedirect', `${location.pathname}${location.search}`) } catch { /* storage blocked */ }
    navigate('/login')
  }

  if (!listing.agent?.whatsapp) return null
  return (
    <>
      <Button
        type="button"
        size="lg"
        disabled={busy}
        onClick={() => (isAuthenticated ? void open() : setAskToSignIn(true))}
        className={`w-full !bg-[#25D366] !text-white hover:!bg-[#1ebe5b] ${className}`}
      >
        <WhatsAppGlyph /> {busy ? 'Opening WhatsApp…' : 'Chat on WhatsApp'}
      </Button>
      <Modal open={askToSignIn} onClose={() => setAskToSignIn(false)} title="Before you open WhatsApp">
        <p className="text-sm leading-relaxed text-muted dark:text-gray-400">
          Sign in so {listing.agent.name} knows who is asking and can follow up on RentOS too. Or carry on — your message will name the property either way.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="button" onClick={signInFirst} className="sm:flex-1">Sign in first</Button>
          <Button type="button" variant="outline" onClick={() => void open()} className="sm:flex-1">Continue to WhatsApp</Button>
        </div>
      </Modal>
    </>
  )
}

function Gallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0)
  if (images.length === 0) {
    return (
      <div className="grid h-64 place-items-center rounded-3xl bg-gradient-to-br from-primary/15 to-emerald-500/10 dark:from-primary/25 dark:to-emerald-500/15 md:h-96">
        <Building2 size={64} className="text-primary/30 dark:text-white/30" />
      </div>
    )
  }
  const current = images[Math.min(active, images.length - 1)]
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-3xl bg-gray-100 dark:bg-[#161927]">
        <img src={current} alt={title} className="h-72 w-full object-cover md:h-[28rem]" />
        {images.length > 1 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white">{active + 1} / {images.length}</span>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              aria-label={`Photo ${index + 1}`}
              aria-current={index === active}
              onClick={() => setActive(index)}
              className={`h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition-opacity ${index === active ? 'border-primary dark:border-cyan-300' : 'border-transparent opacity-70 hover:opacity-100'}`}
            >
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 p-3 dark:border-[#252a3a]/60">
      <div className="mb-1.5 text-muted dark:text-white/50">{icon}</div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-white/50">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-primary-dark dark:text-white">{value}</p>
    </div>
  )
}

/**
 * Everything on a listing's page below the site's own header: used on the
 * platform at /property/<ref> and on an agent's website.
 */
export function PublicPropertyView({ listing, backTo }: { listing: PublicListing; backTo?: { href: string; label: string } }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const role = useAuthStore((s) => s.user?.activeRole)
  const navigate = useNavigate()
  const location = useLocation()
  const [interestSent, setInterestSent] = useState(false)
  const meta = listingTypeMeta(listing.listingType)
  const place = listingLocation(listing)
  const typeLabel = TYPE_LABELS[listing.propertyType] ?? listing.propertyType
  const images = listing.images?.length ? listing.images : listing.image ? [listing.image] : []
  const rental = acceptsRentalApplications(listing.listingType)
  const shareUrl = shareUrlFor(listing)
  const summary = [listing.bedrooms > 0 ? `${listing.bedrooms} bed` : null, place, formatListingPrice(listing.rentAmount, listing.listingType)].filter(Boolean).join(' · ')

  function requireSignIn(returnTo: string) {
    try { sessionStorage.setItem('postAuthRedirect', returnTo) } catch { /* storage blocked */ }
    navigate('/login')
  }

  async function expressInterest() {
    if (!isAuthenticated) { requireSignIn(`${location.pathname}${location.search}`); return }
    try {
      await api.post(`/agent/leads/property/${listing.id}`, {})
      setInterestSent(true)
      toast.success('Interest sent. The agent has been told by SMS and in RentOS.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send your interest')
    }
  }

  const messageAgent = () => (isAuthenticated ? navigate(`/properties/${listing.id}?contact=1`) : requireSignIn(`/properties/${listing.id}?contact=1`))

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:py-10">
      {backTo && (
        <Link to={backTo.href} className="mb-4 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-primary-dark dark:hover:text-white">
          <ArrowLeft size={16} /> {backTo.label}
        </Link>
      )}

      <Gallery images={images} title={listing.title} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white dark:bg-cyan-300 dark:text-[#071018]">{meta.label}</span>
              <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-bold text-primary-dark dark:bg-white/10 dark:text-white">{typeLabel}</span>
              {listing.status === 'occupied' && <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">Currently occupied</span>}
              {listing.ref && <span className="font-mono text-[11px] text-muted dark:text-gray-500">Ref {listing.ref}</span>}
            </div>
            <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-primary-dark dark:text-white md:text-4xl">{listing.title}</h1>
            <p className="mt-2 flex items-center gap-2 text-base text-muted dark:text-white/60"><MapPin size={16} className="shrink-0" />{place || 'Ghana'}</p>
          </div>

          <Card>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Fact icon={listing.propertyType === 'commercial' || listing.propertyType === 'warehouse' ? <Warehouse size={18} /> : <Home size={18} />} label="Type" value={typeLabel} />
              {listing.bedrooms > 0 && <Fact icon={<BedDouble size={18} />} label="Bedrooms" value={String(listing.bedrooms)} />}
              {listing.bathrooms > 0 && <Fact icon={<Bath size={18} />} label="Bathrooms" value={String(listing.bathrooms)} />}
              <Fact icon={<Sofa size={18} />} label="Furnished" value={listing.furnished ? 'Yes' : 'No'} />
              {listing.parkingSpaces > 0 && <Fact icon={<Car size={18} />} label="Parking" value={String(listing.parkingSpaces)} />}
              {listing.floorArea ? <Fact icon={<Ruler size={18} />} label="Floor area" value={`${listing.floorArea} m²`} /> : null}
              {listing.availableFrom && <Fact icon={<Calendar size={18} />} label="Available" value={formatDate(listing.availableFrom)} />}
              {rental && listing.rentDurationMonths ? <Fact icon={<Calendar size={18} />} label="Lease" value={`${listing.rentDurationMonths} months`} /> : null}
            </div>
          </Card>

          {listing.description && (
            <Card>
              <h2 className="mb-3 text-sm font-bold text-primary-dark dark:text-white">About this property</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-primary-dark/85 dark:text-gray-300">{listing.description}</p>
            </Card>
          )}

          {listing.amenities?.length > 0 && (
            <Card>
              <h2 className="mb-3 text-sm font-bold text-primary-dark dark:text-white">Amenities</h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {listing.amenities.map((amenity) => (
                  <li key={amenity} className="flex items-center gap-2 text-sm text-primary-dark dark:text-gray-300"><Check size={14} className="text-emerald-500" />{amenity}</li>
                ))}
              </ul>
            </Card>
          )}

          {listing.rules?.length > 0 && (
            <Card>
              <h2 className="mb-3 text-sm font-bold text-primary-dark dark:text-white">House rules</h2>
              <ul className="space-y-1.5 text-sm text-primary-dark/85 dark:text-gray-300">
                {listing.rules.map((rule) => <li key={rule}>• {rule}</li>)}
              </ul>
            </Card>
          )}

          <Card>
            <h2 className="mb-3 text-sm font-bold text-primary-dark dark:text-white">Location</h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {listing.neighborhood && <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">Neighbourhood</dt><dd className="mt-0.5 font-medium text-primary-dark dark:text-white">{listing.neighborhood}</dd></div>}
              <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">City</dt><dd className="mt-0.5 font-medium text-primary-dark dark:text-white">{listing.city || '—'}</dd></div>
              <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">Region</dt><dd className="mt-0.5 font-medium text-primary-dark dark:text-white">{listing.region || '—'}</dd></div>
              {listing.digitalAddress && <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">Digital address</dt><dd className="mt-0.5 font-mono text-primary-dark dark:text-white">{listing.digitalAddress}</dd></div>}
            </dl>
            <p className="mt-3 text-[11px] text-muted dark:text-gray-500">The agent shares the exact address when you arrange a viewing.</p>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted dark:text-white/50">{meta.priceLabel}</p>
            <p className="mt-1 font-display text-3xl font-extrabold text-primary-dark dark:text-white">{formatListingPrice(listing.rentAmount, listing.listingType)}</p>
            {rental && listing.advanceMonths ? <p className="mt-1 text-xs text-muted dark:text-white/50">{listing.advanceMonths} month{listing.advanceMonths === 1 ? '' : 's'} advance</p> : null}

            {listing.agent && (
              <div className="mt-5 flex items-center gap-3 border-t border-border/60 pt-4 dark:border-white/10">
                {listing.agent.logoUrl ? (
                  <img src={listing.agent.logoUrl} alt="" className="h-11 w-11 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 font-display text-lg font-extrabold text-primary dark:bg-cyan-300/15 dark:text-cyan-200">{listing.agent.name.charAt(0)}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-primary-dark dark:text-white">{listing.agent.name}</p>
                  <p className="flex items-center gap-1 text-[11px] text-muted dark:text-gray-400">
                    {listing.agent.type}
                    {listing.agent.identityVerified && <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"><BadgeCheck size={12} /> ID reviewed</span>}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <WhatsAppEnquiryButton listing={listing} />
              <Button type="button" variant="outline" size="md" className="w-full" onClick={messageAgent}>
                <MessageSquare size={16} /> Message on RentOS
              </Button>
              <Button type="button" variant="ghost" size="md" className="w-full" disabled={interestSent} onClick={() => void expressInterest()}>
                <Heart size={16} /> {interestSent ? 'Interest sent' : "I'm interested"}
              </Button>
              {rental && role !== 'landlord' && role !== 'property_manager' && (
                isAuthenticated ? (
                  <Link to={`/properties/${listing.id}`} className="block"><Button type="button" variant="secondary" size="md" className="w-full">Apply to rent</Button></Link>
                ) : (
                  <Button type="button" variant="secondary" size="md" className="w-full" onClick={() => requireSignIn(`/properties/${listing.id}`)}>
                    <Lock size={14} /> Sign in to apply
                  </Button>
                )
              )}
            </div>
            {listing.agent?.websiteUrl && (
              <a href={listing.agent.websiteUrl} className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-primary hover:underline dark:text-cyan-300">
                <Globe size={13} /> More from {listing.agent.name}
              </a>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-bold text-primary-dark dark:text-white">Share this listing</h2>
            <ShareListingPanel url={shareUrl} title={listing.title} summary={summary} />
          </Card>

          <Card>
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-500" />
              <div>
                <p className="text-xs font-bold text-primary-dark dark:text-white">What RentOS has checked</p>
                <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted dark:text-white/60">
                  <li>• Listing reviewed by RentOS before it was published{listing.publishedAt ? ` (${formatDate(listing.publishedAt)})` : ''}</li>
                  {listing.landlordIdentityVerified && <li>• The lister's identity document was reviewed by RentOS</li>}
                  <li>• RentOS does not inspect properties or confirm ownership. View it and check documents before you pay.</li>
                </ul>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}

/** /property/:ref (and the older /registry/:id) on the platform. */
export function PublicPropertyPage() {
  const { ref, id } = useParams<{ ref?: string; id?: string }>()
  const key = ref ?? id
  const navigate = useNavigate()
  const { data: listing, isLoading, isError } = usePublicListing(key)

  // One address per listing: an old /registry/<id> link moves to /property/<ref>.
  useEffect(() => {
    if (listing?.ref && id) navigate(listingPath(listing.ref), { replace: true })
  }, [listing?.ref, id, navigate])

  useEffect(() => {
    if (!listing) return
    const meta = listingTypeMeta(listing.listingType)
    const place = listingLocation(listing)
    const typeLabel = TYPE_LABELS[listing.propertyType] ?? listing.propertyType
    const purpose = meta.value === 'sale' ? 'for sale' : meta.value === 'short_let' ? 'short let' : 'for rent'
    const canonical = listing.url ?? `${window.location.origin}${listingPath(listing.ref ?? listing.id)}`
    applySeo({
      title: `${listing.title} — ${typeLabel} ${purpose} in ${listing.city || 'Ghana'} | RentOS`,
      description: `${typeLabel} ${purpose} in ${place || 'Ghana'}: ${formatListingPrice(listing.rentAmount, listing.listingType)}${listing.bedrooms ? `, ${listing.bedrooms} bedroom${listing.bedrooms === 1 ? '' : 's'}` : ''}. ${listing.description.slice(0, 120)}`,
      canonical,
      image: listing.images?.[0] ?? listing.image ?? undefined,
      siteName: 'RentOS Ghana',
    })
    setJsonLd('listing', {
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: listing.title,
      description: listing.description,
      url: canonical,
      image: listing.images?.length ? listing.images : listing.image ? [listing.image] : undefined,
      datePosted: listing.publishedAt ?? undefined,
      offers: {
        '@type': 'Offer',
        price: listing.rentAmount,
        priceCurrency: 'GHS',
        availability: listing.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        businessFunction: meta.value === 'sale' ? 'http://purl.org/goodrelations/v1#Sell' : 'http://purl.org/goodrelations/v1#LeaseOut',
      },
      about: {
        '@type': SCHEMA_TYPES[listing.propertyType] ?? 'Accommodation',
        numberOfRooms: listing.bedrooms || undefined,
        numberOfBathroomsTotal: listing.bathrooms || undefined,
        address: { '@type': 'PostalAddress', addressLocality: listing.city, addressRegion: listing.region, addressCountry: 'GH' },
      },
    })
    return () => setJsonLd('listing', null)
  }, [listing])

  // Page views for the registry's statistics; best-effort.
  useEffect(() => {
    if (!listing) return
    void fetch(`${apiBase()}/public/properties/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: listingPath(listing.ref ?? listing.id), propertyId: listing.id, referrer: document.referrer || undefined }),
    }).catch(() => {})
  }, [listing])

  if (isLoading) return <div className="mx-auto max-w-5xl px-6 py-12"><DetailSkeleton /></div>

  if (isError || !listing) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Building2 size={48} className="mx-auto mb-4 text-muted" />
        <h1 className="font-display text-2xl font-extrabold text-primary-dark dark:text-white">Property not found</h1>
        <p className="mt-2 text-sm text-muted dark:text-white/50">This listing may have been let, sold or removed.</p>
        <Link to="/registry" className="mt-6 inline-block"><Button><ArrowLeft size={14} /> Browse properties</Button></Link>
      </div>
    )
  }

  return <PublicPropertyView listing={listing} backTo={{ href: '/registry', label: 'All properties' }} />
}
