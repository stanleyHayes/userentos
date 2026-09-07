import { useParams, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { GridSkeleton } from '@/components/ui/Skeleton'
import { formatCurrency } from '@/lib/utils'
import { Building2, MapPin, Phone, Mail, BedDouble, Bath, Store } from 'lucide-react'
import { useStorefront, useStorefrontProperties } from '@/hooks/useApi'

/**
 * A seller's public storefront (spec §4).
 *
 * Everything here comes from tenant-scoped endpoints — the server filters by
 * storefront owner, so this page cannot show another seller's listing even if
 * it wanted to. Reachable at /s/:slug and, once wildcard DNS is in place, at
 * {slug}.userentos.com.
 */
export function PublicStorefrontPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: storefront, isLoading, isError } = useStorefront(slug)
  const { data: properties, isLoading: loadingProperties } = useStorefrontProperties(slug)

  if (isLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-10"><GridSkeleton cols={3} count={6} /></div>
  }

  if (isError || !storefront) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          preset="search"
          title="Storefront not found"
          description="This address is not in use, or the storefront has been suspended."
        />
      </div>
    )
  }

  const brandColor = storefront.branding?.primaryColor
  const items = properties?.items ?? []

  return (
    <div className="min-h-screen bg-surface/40 dark:bg-[#0a0d16]">
      {/* Cover + identity */}
      <header
        className="relative overflow-hidden border-b border-border/60 dark:border-[#252a3a]/60"
        style={brandColor ? { background: `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)` } : undefined}
      >
        {!brandColor && <div className="absolute inset-0 bg-gradient-to-br from-[#0f1f33] to-[#2d5a8e]" />}
        {storefront.branding?.coverUrl && (
          <img src={storefront.branding.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        )}

        <div className="relative mx-auto flex max-w-6xl flex-col gap-4 px-4 py-12 sm:flex-row sm:items-end">
          {storefront.branding?.logoUrl ? (
            <img
              src={storefront.branding.logoUrl}
              alt={storefront.name}
              className="h-20 w-20 shrink-0 rounded-2xl border-2 border-white/30 object-cover"
            />
          ) : (
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border-2 border-white/30 bg-white/10 text-white">
              <Store size={30} />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-extrabold text-white">{storefront.name}</h1>
            {storefront.tagline && <p className="mt-1 max-w-2xl text-sm text-white/75">{storefront.tagline}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/70">
              {storefront.contact?.city && (
                <span className="flex items-center gap-1"><MapPin size={12} /> {storefront.contact.city}</span>
              )}
              {storefront.contact?.phone && (
                <a href={`tel:${storefront.contact.phone}`} className="flex items-center gap-1 hover:text-white">
                  <Phone size={12} /> {storefront.contact.phone}
                </a>
              )}
              {storefront.contact?.email && (
                <a href={`mailto:${storefront.contact.email}`} className="flex items-center gap-1 hover:text-white">
                  <Mail size={12} /> {storefront.contact.email}
                </a>
              )}
            </div>
          </div>

          <Badge variant="success" className="shrink-0">{items.length} listing{items.length === 1 ? '' : 's'}</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {storefront.about && (
          <Card className="mb-6">
            <CardContent>
              <p className="text-sm leading-relaxed text-muted dark:text-gray-400">{storefront.about}</p>
            </CardContent>
          </Card>
        )}

        {loadingProperties ? (
          <GridSkeleton cols={3} count={6} />
        ) : items.length === 0 ? (
          <EmptyState
            preset="properties"
            title="No listings yet"
            description={`${storefront.name} has not published any listings.`}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((property) => (
              <Link key={property.id} to={`/properties/${property.id}`}>
                <Card className="group h-full overflow-hidden p-0 transition-all hover:-translate-y-1 hover:shadow-xl">
                  <div className="relative h-44 overflow-hidden bg-surface">
                    {property.images?.[0] ? (
                      <img
                        src={property.images[0]}
                        alt={property.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <span className="grid h-full place-items-center text-primary/20"><Building2 size={40} /></span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
                    <p className="absolute bottom-2 left-3 font-display text-lg font-extrabold text-white">
                      {formatCurrency(property.rentAmount)}
                      <span className="text-xs font-normal opacity-70">/mo</span>
                    </p>
                  </div>
                  <CardContent className="space-y-2">
                    <h2 className="font-bold text-primary-dark dark:text-white">{property.title}</h2>
                    <p className="flex items-center gap-1 text-xs text-muted dark:text-gray-500">
                      <MapPin size={11} /> {property.address?.city}{property.address?.region ? `, ${property.address.region}` : ''}
                    </p>
                    <div className="flex gap-3 text-xs text-muted dark:text-gray-500">
                      {property.bedrooms != null && <span className="flex items-center gap-1"><BedDouble size={11} /> {property.bedrooms}</span>}
                      {property.bathrooms != null && <span className="flex items-center gap-1"><Bath size={11} /> {property.bathrooms}</span>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {!storefront.branding?.hideRentosBranding && (
          <p className="mt-10 text-center text-xs text-muted dark:text-gray-600">
            Powered by <Link to="/" className="font-semibold text-primary hover:underline dark:text-blue-400">RentOS</Link>
          </p>
        )}
      </main>
    </div>
  )
}
