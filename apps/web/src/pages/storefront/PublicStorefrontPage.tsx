import { useEffect, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PlatformLink } from '@/components/PlatformLink'
import { EmptyState } from '@/components/ui/EmptyState'
import { GridSkeleton } from '@/components/ui/Skeleton'
import { formatCurrency } from '@/lib/utils'
import { Building2, MapPin, Phone, Mail, BedDouble, Bath, Store } from 'lucide-react'
import { useStorefront, useStorefrontProperties } from '@/hooks/useApi'
import { applySeo } from '@/lib/seo'
import { useAuthStore } from '@/stores/authStore'
import { StorefrontUnavailable } from './StorefrontUnavailable'

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const VISITOR_KEY = 'rentos-storefront-visitor'

type TrackEvent =
  | { type: 'view'; propertyId?: string }
  | { type: 'listing_impression'; propertyId: string }
  | { type: 'contact_click'; channel: 'phone' | 'email' }

/** A random per-tab id, so "unique visitors" means something without naming anyone. */
function visitorSessionId(): string | undefined {
  try {
    let id = sessionStorage.getItem(VISITOR_KEY)
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(VISITOR_KEY, id) }
    return id
  } catch {
    return undefined // storage blocked or no crypto: the server falls back to the IP digest
  }
}

/**
 * Record one traffic event for the seller's storefront analytics report, which
 * showed zero for everyone because nothing ever called this endpoint.
 *
 * Fire-and-forget: a metrics write must never be why the page fails. The
 * session token goes along when there is one, so a seller browsing their own
 * storefront isn't counted. `keepalive` is for a click that leaves the page.
 */
function trackStorefront(slug: string, event: TrackEvent, keepalive = false) {
  const token = useAuthStore.getState().token
  void fetch(`${API_BASE}/storefronts/${encodeURIComponent(slug)}/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ ...event, sessionId: visitorSessionId() }),
    keepalive,
  }).catch(() => {})
}

/**
 * The listings not yet counted as seen in this tab. A reload, or Back from a
 * listing, re-renders the same cards; counting them again would inflate the
 * report and spend the visitor's share of the public rate limit, which the
 * listing pages they are about to open draw on too.
 */
function unseenThisSession(slug: string, ids: string[]): string[] {
  const key = `rentos-storefront-seen:${slug}`
  try {
    const seen = new Set<string>(JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[])
    const fresh = ids.filter((id) => !seen.has(id))
    if (fresh.length) sessionStorage.setItem(key, JSON.stringify([...seen, ...fresh]))
    return fresh
  } catch {
    return ids
  }
}

/**
 * A seller's public storefront (spec §4).
 *
 * Everything here comes from tenant-scoped endpoints — the server filters by
 * storefront owner, so this page cannot show another seller's listing even if
 * it wanted to. Reachable at /s/:slug and, once wildcard DNS is in place, at
 * {slug}.userentos.com.
 */
export function PublicStorefrontPage({ slugOverride }: { slugOverride?: string } = {}) {
  // On {slug}.userentos.com or a custom domain the slug comes from the host,
  // not the path — there is no /s/:slug segment to read.
  const { slug: slugFromPath } = useParams<{ slug: string }>()
  const slug = slugOverride ?? slugFromPath
  const { data: storefront, isLoading, isError, error, refetch, isFetching, errorUpdateCount } = useStorefront(slug)
  const {
    data: properties, isLoading: loadingProperties, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useStorefrontProperties(slug)
  // Offset pages can overlap when a listing is added between loads.
  const items = useMemo(() => {
    const byId = new Map((properties?.pages ?? []).flatMap((page) => page.items).map((p) => [p.id, p]))
    return [...byId.values()]
  }, [properties])
  const listingCount = properties?.pages[0]?.total ?? items.length
  // On {slug}.userentos.com or a custom domain a router link would stay on
  // the seller's host, where "/" is this storefront and the rest of the app
  // sits behind a separate sign-in.
  const onStorefrontHost = Boolean(slugOverride)

  // Per-host SEO (spec §4.1). index.html carries the platform's own tags, so
  // without this a storefront was served "RentOS Ghana — National Digital
  // Rental Housing Platform" as its title on the seller's own domain, and
  // every address the storefront answers on looked like a distinct page.
  const canonicalUrl = storefront?.canonicalUrl
  useEffect(() => {
    if (!storefront) return
    // The storefront answers on /s/{slug}, its subdomain and any custom
    // domain. Only the canonical one should be indexed; the others point at
    // it, and a *storefront host* that is not the canonical one is dropped
    // outright — the server 301s a fresh crawl, but an in-app navigation
    // never reaches the server.
    const onCanonicalHost = !canonicalUrl
      || (typeof window !== 'undefined' && canonicalUrl.startsWith(window.location.origin))

    applySeo({
      title: storefront.tagline ? `${storefront.name} — ${storefront.tagline}` : storefront.name,
      description: storefront.about ?? storefront.tagline ?? `Rental listings from ${storefront.name}.`,
      canonical: canonicalUrl,
      image: storefront.branding?.coverUrl ?? storefront.branding?.logoUrl,
      siteName: storefront.name,
      noIndex: Boolean(slugOverride) && !onCanonicalHost,
    })
  }, [storefront, canonicalUrl, slugOverride])

  // One storefront view per visit to this slug.
  const storefrontSlug = storefront?.slug
  const viewedSlug = useRef<string | null>(null)
  useEffect(() => {
    if (!storefrontSlug || viewedSlug.current === storefrontSlug) return
    viewedSlug.current = storefrontSlug
    trackStorefront(storefrontSlug, { type: 'view' })
  }, [storefrontSlug])

  // An impression for each listing card as it is rendered, "Load more" included.
  const impressed = useRef(new Set<string>())
  useEffect(() => {
    if (!storefrontSlug) return
    const fresh = items.map((p) => p.id).filter((id) => !impressed.current.has(`${storefrontSlug}:${id}`))
    fresh.forEach((id) => impressed.current.add(`${storefrontSlug}:${id}`))
    for (const propertyId of unseenThisSession(storefrontSlug, fresh)) {
      trackStorefront(storefrontSlug, { type: 'listing_impression', propertyId })
    }
  }, [storefrontSlug, items])

  // Refetching a query that never loaded puts it back to pending. After a
  // failed load, keep the error page up (its button shows the retry) rather
  // than flashing the skeleton and replaying the page's entrance.
  const retrying = isFetching && errorUpdateCount > 0

  if (isLoading && !retrying) {
    return <div className="mx-auto max-w-6xl px-4 py-10"><GridSkeleton cols={3} count={6} /></div>
  }

  if (isError || !storefront) {
    // Only a 404 means there is no storefront; anything else was a failed load.
    // A 404 is never refetched, so a retry in flight follows a failed load.
    const missing = !retrying && (!isError || (error as { status?: number } | null)?.status === 404)
    return (
      <StorefrontUnavailable
        slug={slug}
        reason={missing ? 'missing' : 'unreachable'}
        onStorefrontHost={onStorefrontHost}
        onRetry={() => { void refetch() }}
        retrying={retrying}
      />
    )
  }

  const brandColor = storefront.branding?.primaryColor

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
                <a
                  href={`tel:${storefront.contact.phone}`}
                  onClick={() => trackStorefront(storefront.slug, { type: 'contact_click', channel: 'phone' })}
                  className="flex items-center gap-1 hover:text-white"
                >
                  <Phone size={12} /> {storefront.contact.phone}
                </a>
              )}
              {storefront.contact?.email && (
                <a
                  href={`mailto:${storefront.contact.email}`}
                  onClick={() => trackStorefront(storefront.slug, { type: 'contact_click', channel: 'email' })}
                  className="flex items-center gap-1 hover:text-white"
                >
                  <Mail size={12} /> {storefront.contact.email}
                </a>
              )}
            </div>
          </div>

          <Badge variant="success" className="shrink-0">{listingCount} listing{listingCount === 1 ? '' : 's'}</Badge>
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
              // The public listing page: /properties/:id is behind sign-in,
              // so a visitor clicking a listing was sent to a login screen.
              <PlatformLink
                key={property.id}
                to={`/registry/${property.id}`}
                external={onStorefrontHost}
                onClick={() => trackStorefront(storefront.slug, { type: 'view', propertyId: property.id }, onStorefrontHost)}
              >
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
              </PlatformLink>
            ))}
          </div>
        )}

        {hasNextPage && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={() => { void fetchNextPage() }} disabled={isFetchingNextPage} aria-busy={isFetchingNextPage}>
              {isFetchingNextPage ? 'Loading…' : 'Load more listings'}
            </Button>
          </div>
        )}

        {!storefront.branding?.hideRentosBranding && (
          <p className="mt-10 text-center text-xs text-muted dark:text-gray-600">
            Powered by{' '}
            <PlatformLink to="/" external={onStorefrontHost} className="font-semibold text-primary hover:underline dark:text-blue-400">RentOS</PlatformLink>
          </p>
        )}
      </main>
    </div>
  )
}
