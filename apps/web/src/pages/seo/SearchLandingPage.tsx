import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, ChevronDown, ChevronRight, MapPin, Search } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { buttonVariants } from '@/components/ui/buttonVariants'
import { IconWatermark } from '@/components/ui/Watermark'
import { GridSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { applySeo, setJsonLd } from '@/lib/seo'
import { apiBase } from '@/lib/publicListing'
import { platformOrigin } from '@/lib/platformOrigin'
import { RegistryCard, type RegistryListing } from '@/pages/PublicRegistryPage'

/** Mirrors LandingModel in apps/api/src/services/seoLanding.ts. */
interface LinkItem { label: string; path: string; count?: number }
interface LandingModel {
  purpose: string
  path: string
  canonical: string
  h1: string
  title: string
  description: string
  intro: string[]
  count: number
  stats: { min: number; max: number; median: number; priceSuffix: string; byBedrooms: { bedrooms: number; count: number; median: number }[] }
  listings: (RegistryListing & { path: string })[]
  areas: LinkItem[]
  types: LinkItem[]
  related: LinkItem[]
  breadcrumbs: { name: string; path: string }[]
  faq: { q: string; a: string }[]
  noindex: boolean
  status: 200 | 404
  place: string
}

const REGISTRY_TYPE: Record<string, string> = { rent: 'rent', buy: 'sale', 'short-stay': 'short_let' }
// "GHS 2,500", as the listing cards below print it.
const ghs = (amount: number) => `GHS ${amount.toLocaleString('en-GH', { maximumFractionDigits: 0 })}`

async function fetchLanding(purpose: string, path: string): Promise<LandingModel> {
  const response = await fetch(`${apiBase()}/seo/landing?purpose=${encodeURIComponent(purpose)}&path=${encodeURIComponent(path)}`)
  const json = await response.json().catch(() => ({}))
  // An unknown place still answers with its (empty) page, as a 404.
  if (!json.success || !json.data) throw new Error(json.error || 'Could not load this page')
  return json.data as LandingModel
}

function LinkChips({ links }: { links: LinkItem[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {links.map((link) => (
        <li key={link.path}>
          {/* The registry's filter pill, so browsing links read as the same control. */}
          <Link
            to={link.path}
            className="registry-filter-pill inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-[#f2f5f8] px-3.5 py-1.5 text-sm font-medium text-primary-dark transition-all hover:border-primary/30 hover:text-primary dark:border-white/[0.07] dark:bg-[#151b28] dark:text-white/80 dark:hover:text-white"
          >
            {link.label}
            {link.count !== undefined && <span className="text-xs font-bold text-muted dark:text-white/45">{link.count}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 font-display text-xl font-extrabold text-primary-dark dark:text-white">{children}</h2>
}

/**
 * /rent, /buy and /short-stay by city, neighbourhood and property type: the page
 * someone lands on from "apartments for rent in East Legon". Everything on it
 * comes from the live listings (GET /api/seo/landing); the server renders the
 * same page for search engines (apps/api/src/services/seo.ts).
 */
export function SearchLandingPage({ purpose }: { purpose: 'rent' | 'buy' | 'short-stay' }) {
  const rest = useParams()['*'] ?? ''
  const { data, isLoading, isError } = useQuery({
    queryKey: ['seo-landing', purpose, rest],
    queryFn: () => fetchLanding(purpose, rest),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!data) return
    applySeo({
      title: data.title,
      description: data.description,
      canonical: data.canonical,
      image: data.listings.find((l) => l.image)?.image ?? `${platformOrigin()}/og-image.png`,
      siteName: 'RentOS Ghana',
      noIndex: data.noindex || data.status === 404,
    })
    const origin = platformOrigin()
    setJsonLd('page', {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: data.h1,
      description: data.description,
      url: data.canonical,
      mainEntity: { '@type': 'ItemList', numberOfItems: data.count, itemListElement: data.listings.map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: `${origin}${l.path}`, name: l.title })) },
    })
    setJsonLd('breadcrumbs', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: data.breadcrumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${origin}${c.path}` })),
    })
    setJsonLd('faq', {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: data.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    })
    return () => { setJsonLd('page', null); setJsonLd('breadcrumbs', null); setJsonLd('faq', null) }
  }, [data])

  const registryHref = `/registry?type=${REGISTRY_TYPE[purpose]}${data && data.place !== 'Ghana' ? `&q=${encodeURIComponent(data.place.split(',')[0])}` : ''}`

  return (
    <div className="min-h-screen bg-white dark:bg-[#0c0e1a]">
      <section className="relative overflow-hidden bg-gradient-to-b from-[#091421] via-[#173a55] to-[#0b1a2a] pt-10 pb-10 md:pt-14 md:pb-12">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/4 top-1/3 h-96 w-96 rounded-full bg-sky-300/[0.07] blur-[130px]" />
          <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-emerald-300/[0.06] blur-[110px]" />
          <div className="absolute inset-0 opacity-[0.045]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
          <IconWatermark icon={MapPin} tone="brand" className="-bottom-10 -right-6 hidden size-56 md:block" />
        </div>
        <div className="relative mx-auto max-w-6xl px-6">
          {data && data.breadcrumbs.length > 1 && (
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1.5 text-sm text-white/65">
                {data.breadcrumbs.map((crumb, i) => (
                  <li key={crumb.path} className="inline-flex items-center gap-1.5">
                    {i > 0 && <ChevronRight size={14} className="opacity-60" />}
                    {i === data.breadcrumbs.length - 1 ? <span className="text-white/85">{crumb.name}</span> : <Link to={crumb.path} className="transition-colors hover:text-white">{crumb.name}</Link>}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight text-white md:text-5xl">
            {data?.h1 ?? (isLoading ? 'Finding homes…' : 'Homes in Ghana')}
          </h1>
          {data?.intro.map((p) => <p key={p} className="mt-3 max-w-3xl text-base text-white/78">{p}</p>)}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {data && data.count > 0 && (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200"><BadgeCheck size={13} /> {data.count} reviewed {data.count === 1 ? 'listing' : 'listings'}</span>
                {data.stats.median > 0 && <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">Median {ghs(data.stats.median)}{data.stats.priceSuffix}</span>}
              </>
            )}
            <Link to={registryHref} className={buttonVariants({ size: 'sm', className: 'dark-surface-control bg-gradient-to-r from-secondary to-amber-400 font-bold text-[#0f1f33]' })}>
              <Search size={14} /> Search all listings
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-12 px-6 py-10">
        {isLoading ? (
          <GridSkeleton cols={3} count={6} />
        ) : isError || !data ? (
          <EmptyState preset="search" title="This page could not be loaded" description="Check your connection and try again, or search all listings." action={{ label: 'Search all listings', href: '/registry' }} />
        ) : (
          <>
            {data.listings.length ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {data.listings.map((item) => <RegistryCard key={item.id} item={item} />)}
              </div>
            ) : (
              <EmptyState preset="search" title={data.status === 404 ? 'We could not find this place' : 'No listings here yet'} description={data.status === 404 ? 'Try a nearby city or neighbourhood, or search all listings.' : 'New listings appear here as soon as RentOS has reviewed them.'} action={{ label: 'Search all listings', href: '/registry' }} />
            )}

            {data.areas.length > 0 && <div><SectionTitle>Browse by area</SectionTitle><LinkChips links={data.areas} /></div>}
            {data.types.length > 0 && <div><SectionTitle>Browse by property type</SectionTitle><LinkChips links={data.types} /></div>}

            {data.stats.byBedrooms.length > 0 && (
              <div>
                <SectionTitle>Prices in {data.place}</SectionTitle>
                <Card className="max-w-xl overflow-hidden p-0">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border/70 text-xs uppercase tracking-wide text-muted dark:border-white/10 dark:text-white/45">
                      <tr><th className="px-4 py-3">Bedrooms</th><th className="px-4 py-3">Listings</th><th className="px-4 py-3">Median price</th></tr>
                    </thead>
                    <tbody>
                      {data.stats.byBedrooms.map((b) => (
                        <tr key={b.bedrooms} className="border-b border-border/50 last:border-0 dark:border-white/5">
                          <td className="px-4 py-3 font-semibold text-primary-dark dark:text-white">{b.bedrooms === 5 ? '5+' : b.bedrooms}</td>
                          <td className="px-4 py-3 text-muted dark:text-white/60">{b.count}</td>
                          <td className="px-4 py-3 font-semibold text-primary-dark dark:text-white">{ghs(b.median)}{data.stats.priceSuffix}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            )}

            {data.related.length > 0 && <div><SectionTitle>Also on RentOS</SectionTitle><LinkChips links={data.related} /></div>}

            <div>
              <SectionTitle>Frequently asked questions</SectionTitle>
              <div className="max-w-3xl space-y-3">
                {data.faq.map((f) => (
                  <details key={f.q} className="surface-card group rounded-2xl border p-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-primary-dark dark:text-white">
                      {f.q}
                      <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-muted dark:text-white/60">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
