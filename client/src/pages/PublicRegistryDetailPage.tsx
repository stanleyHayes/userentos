import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldCheck, BadgeCheck, MapPin, BedDouble, Bath, Building2,
  ArrowLeft, ArrowRight, Calendar, Home, Warehouse, Lock,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DetailSkeleton } from '@/components/ui/Skeleton'
import { formatCurrency, formatDate } from '@/lib/utils'

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

const TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartment',
  house: 'House',
  studio: 'Studio',
  townhouse: 'Townhouse',
  room: 'Room',
  shared_room: 'Shared Room',
  hostel: 'Hostel',
  commercial: 'Commercial',
  warehouse: 'Warehouse',
}

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

function PropertyTypeIcon({ type, size = 14 }: { type: string; size?: number }) {
  if (type === 'commercial' || type === 'warehouse') return <Warehouse size={size} />
  if (type === 'apartment' || type === 'studio') return <Building2 size={size} />
  return <Home size={size} />
}

export function PublicRegistryDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: item, isLoading, isError } = useQuery({
    queryKey: ['public-registry', id],
    queryFn: async () => {
      const base = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${base}/public/properties/${id}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Property not found')
      }
      return json.data as RegistryListing
    },
    enabled: !!id,
  })

  // SEO meta
  useEffect(() => {
    if (!item) return
    const location = [item.neighborhood, item.city, item.region].filter(Boolean).join(', ')
    const title = `${item.title} — Verified Rental in ${item.city || 'Ghana'} | RentOS`
    const description = `${TYPE_LABELS[item.propertyType] ?? item.propertyType} for ${formatCurrency(item.rentAmount)}/month in ${location}. Verified on Ghana's official rental property registry.`
    document.title = title
    setMeta('description', description)
    setOgMeta('og:title', title)
    setOgMeta('og:description', description)
    setOgMeta('og:type', 'article')
    setOgMeta('og:site_name', 'RentOS Ghana')
    if (item.image) setOgMeta('og:image', item.image)
    setMeta('twitter:card', item.image ? 'summary_large_image' : 'summary')
    setMeta('twitter:title', title)
    setMeta('twitter:description', description)
  }, [item])

  // Pageview tracking — fire once per detail page load, never block render
  useEffect(() => {
    if (!id) return
    const base = import.meta.env.VITE_API_URL || '/api'
    void fetch(`${base}/public/properties/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: `/registry/${id}`,
        propertyId: id,
        referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      }),
    }).catch(() => {
      // best-effort
    })
    // Only track once when the id changes
  }, [id])

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <DetailSkeleton />
      </div>
    )
  }

  if (isError || !item) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <Building2 size={48} className="mx-auto text-muted mb-4" />
        <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">
          Property not found
        </h1>
        <p className="text-sm text-muted dark:text-white/50 mt-2">
          This listing may have been removed or is no longer publicly visible.
        </p>
        <Link to="/registry" className="inline-block mt-6">
          <Button>
            <ArrowLeft size={14} /> Back to Registry
          </Button>
        </Link>
      </div>
    )
  }

  const location = [item.neighborhood, item.city, item.region].filter(Boolean).join(', ')
  const typeLabel = TYPE_LABELS[item.propertyType] ?? item.propertyType
  const isVerified = !!item.publishedAt

  return (
    <div className="animate-fade-up">
      {/* Hero image / banner */}
      <div className="relative">
        {item.image ? (
          <div className="h-72 md:h-96 overflow-hidden bg-gray-100 dark:bg-[#161927]">
            <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          </div>
        ) : (
          <div className="h-48 md:h-64 bg-gradient-to-br from-primary/15 to-emerald-500/10 dark:from-primary/25 dark:to-emerald-500/15 flex items-center justify-center">
            <Building2 size={64} className="text-white/40" />
          </div>
        )}

        <div className="max-w-5xl mx-auto px-6">
          <div className={item.image ? '-mt-32 relative z-10' : 'pt-8'}>
            <Link to="/registry" className={`inline-flex items-center gap-2 text-sm mb-4 transition-colors ${
              item.image ? 'text-white/80 hover:text-white' : 'text-muted hover:text-primary-dark dark:hover:text-white'
            }`}>
              <ArrowLeft size={16} /> Back to Registry
            </Link>

            {/* Verified Trust Mark — prominent */}
            {isVerified && (
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider shadow-lg shadow-emerald-500/30 mb-4">
                <ShieldCheck size={14} />
                Listed on RentOS — Verified by Government
              </div>
            )}

            <h1 className={`text-3xl md:text-5xl font-extrabold font-display tracking-tight ${
              item.image ? 'text-white' : 'text-primary-dark dark:text-white'
            }`}>
              {item.title}
            </h1>
            <p className={`text-base mt-3 flex items-center gap-2 ${
              item.image ? 'text-white/80' : 'text-muted dark:text-white/60'
            }`}>
              <MapPin size={16} className="shrink-0" />
              {location || 'Ghana'}
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Trust marks card */}
            <Card className="border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <BadgeCheck size={24} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-300">
                    Verified Listing
                  </h3>
                  <p className="text-xs text-emerald-800/80 dark:text-emerald-300/70 mt-1 leading-relaxed">
                    This property has been reviewed and approved on Ghana's national rental
                    property registry. The landlord's identity, ownership, and listing details
                    have been verified.
                  </p>
                  {isVerified && item.publishedAt && (
                    <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/60 mt-2 inline-flex items-center gap-1.5">
                      <Calendar size={11} /> Verified {formatDate(item.publishedAt)}
                    </p>
                  )}
                </div>
              </div>
            </Card>

            {/* Specs grid */}
            <Card>
              <h2 className="text-sm font-bold text-primary-dark dark:text-white mb-4">Property Details</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SpecTile icon={<PropertyTypeIcon type={item.propertyType} size={18} />} label="Type" value={typeLabel} />
                {item.bedrooms > 0 && (
                  <SpecTile icon={<BedDouble size={18} />} label="Bedrooms" value={String(item.bedrooms)} />
                )}
                {item.bathrooms > 0 && (
                  <SpecTile icon={<Bath size={18} />} label="Bathrooms" value={String(item.bathrooms)} />
                )}
                <SpecTile icon={<MapPin size={18} />} label="City" value={item.city || '—'} />
              </div>
            </Card>

            {/* Address details */}
            <Card>
              <h2 className="text-sm font-bold text-primary-dark dark:text-white mb-4">Location</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {item.neighborhood && (
                  <DetailRow label="Neighborhood" value={item.neighborhood} />
                )}
                <DetailRow label="City" value={item.city || '—'} />
                <DetailRow label="Region" value={item.region || '—'} />
                {item.digitalAddress && (
                  <DetailRow label="Digital Address" value={item.digitalAddress} mono />
                )}
              </dl>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Pricing card */}
            <Card>
              <p className="text-xs uppercase tracking-wider text-muted dark:text-white/50 font-semibold">Monthly Rent</p>
              <p className="text-3xl font-extrabold font-display text-primary-dark dark:text-white mt-1">
                {formatCurrency(item.rentAmount)}
              </p>
              <p className="text-xs text-muted dark:text-white/50 mt-1">per month</p>

              <div className="mt-5 space-y-2">
                <Badge variant="success" className="inline-flex items-center gap-1 w-full justify-center py-1">
                  <ShieldCheck size={12} /> Verified Listing
                </Badge>
              </div>
            </Card>

            {/* CTA card */}
            <Card className="bg-gradient-to-br from-primary to-[#2d5a8e] dark:from-blue-600 dark:to-blue-500 text-white border-0">
              <div className="flex items-start gap-3 mb-3">
                <Lock size={18} className="shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold">Want to apply?</h3>
                  <p className="text-xs text-white/80 mt-1 leading-relaxed">
                    Create a free RentOS account to contact the landlord, apply with verified
                    profile, and sign your tenancy agreement digitally.
                  </p>
                </div>
              </div>
              <Link to="/register" className="block">
                <Button size="md" className="w-full bg-white text-primary hover:bg-white/90">
                  Create Free Account <ArrowRight size={14} />
                </Button>
              </Link>
              <Link to="/login" className="block mt-2">
                <Button variant="ghost" size="sm" className="w-full text-white/90 hover:bg-white/10 hover:text-white">
                  Already have an account? Sign in
                </Button>
              </Link>
            </Card>

            {/* Trust mini-card */}
            <Card>
              <div className="flex items-start gap-3">
                <BadgeCheck size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-primary-dark dark:text-white">
                    Why this listing is trusted
                  </p>
                  <ul className="text-[11px] text-muted dark:text-white/60 mt-2 space-y-1 leading-relaxed">
                    <li>• Landlord identity verified</li>
                    <li>• Property ownership confirmed</li>
                    <li>• Listing reviewed by RentOS team</li>
                    <li>• Compliant with Ghana Rent Control Act</li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function SpecTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 dark:border-[#252a3a]/60 p-3">
      <div className="text-muted dark:text-white/50 mb-1.5">{icon}</div>
      <p className="text-[10px] uppercase tracking-wider text-muted dark:text-white/50 font-semibold">{label}</p>
      <p className="text-sm font-bold text-primary-dark dark:text-white mt-0.5">{value}</p>
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wider text-muted dark:text-white/50 font-semibold">{label}</dt>
      <dd className={`text-sm text-primary-dark dark:text-white ${mono ? 'font-mono' : 'font-medium'} mt-0.5`}>{value}</dd>
    </div>
  )
}
