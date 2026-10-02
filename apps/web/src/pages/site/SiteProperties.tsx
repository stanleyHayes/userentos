import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/buttonVariants'
import { GridSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'
import { useSite, sitePath, useSiteProperties, trackSite, unseenListings, type SiteListingFilter } from '@/lib/site'
import { SitePropertyCard, PageIntro } from './parts'

const FILTERS: { value: SiteListingFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'rent', label: 'For rent' },
  { value: 'sale', label: 'For sale' },
  { value: 'short_let', label: 'Short stay' },
]

const isFilter = (value: string | null): value is SiteListingFilter => FILTERS.some((f) => f.value === value)

/** Every listing on the website, filtered by purpose, twelve at a time. */
export function SiteProperties() {
  const { site, base, color } = useSite()
  const [params, setParams] = useSearchParams()
  const typeParam = params.get('type')
  const filter: SiteListingFilter = isFilter(typeParam) ? typeParam : ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const { data, isLoading, isFetching } = useSiteProperties(site.slug, filter, page)
  const items = data?.items ?? []
  const { attach: pillAttach, style: pillStyle, visible: pillVisible } = useSlidingIndicator<HTMLDivElement>(filter || 'all')

  const ids = items.map((p) => p.id).join(',')
  useEffect(() => {
    const fresh = unseenListings(site.slug, ids ? ids.split(',') : [])
    if (fresh.length) trackSite(site.slug, { type: 'listing_impression', propertyIds: fresh })
  }, [site.slug, ids])

  const go = (next: { type?: SiteListingFilter; page?: number }) => {
    const query = new URLSearchParams()
    const type = next.type ?? filter
    if (type) query.set('type', type)
    if ((next.page ?? 1) > 1) query.set('page', String(next.page))
    setParams(query)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <PageIntro eyebrow={site.name} title="Properties">
        {data ? `${data.total} ${data.total === 1 ? 'property' : 'properties'}` : 'Loading properties…'}
      </PageIntro>

      <div ref={pillAttach} role="tablist" aria-label="Filter by purpose" className="relative isolate mt-8 flex flex-wrap gap-1.5">
        <span aria-hidden className="pointer-events-none absolute left-0 top-0 z-0 rounded-full transition-[transform,width,height] duration-300 ease-out" style={{ ...pillStyle, background: color, opacity: pillVisible ? 1 : 0 }} />
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            role="tab"
            data-tab-key={f.value || 'all'}
            aria-selected={filter === f.value}
            onClick={() => go({ type: f.value, page: 1 })}
            className={`relative z-10 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${filter === f.value ? 'border-transparent' : 'border-border text-muted hover:border-primary/50 dark:border-[#252a3a] dark:text-gray-400'}`}
            style={filter === f.value ? { color: 'var(--site-on-color)' } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={`mt-8 transition-opacity ${isFetching && !isLoading ? 'opacity-60' : ''}`}>
        {isLoading ? <GridSkeleton cols={3} count={6} /> : items.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((property) => <SitePropertyCard key={property.id} property={property} />)}
          </div>
        ) : (
          <EmptyState preset="properties" compact title="No properties here right now" description="Try another filter, or send an enquiry and we will let you know when something comes up." action={{ label: 'Send an enquiry', href: sitePath(base, '/contact') }} />
        )}
      </div>

      {data && data.totalPages > 1 && (
        <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-3">
          <button type="button" disabled={page <= 1} onClick={() => go({ page: page - 1 })} className={buttonVariants({ variant: 'outline', size: 'sm' })}><ChevronLeft size={16} /> Previous</button>
          <span className="text-sm text-muted dark:text-gray-400">Page {page} of {data.totalPages}</span>
          <button type="button" disabled={page >= data.totalPages} onClick={() => go({ page: page + 1 })} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Next <ChevronRight size={16} /></button>
        </nav>
      )}
    </section>
  )
}
