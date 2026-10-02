import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSite, useSiteProperties, trackSite, unseenListings, type SiteListingFilter } from '@/lib/site'
import { SitePropertyCard, CardSkeletons } from './parts'

const FILTERS: { value: SiteListingFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'rent', label: 'For rent' },
  { value: 'sale', label: 'For sale' },
  { value: 'short_let', label: 'Short stay' },
]

const isFilter = (value: string | null): value is SiteListingFilter => FILTERS.some((f) => f.value === value)

/** Every listing on the website, filtered by purpose, twelve at a time. */
export function SiteProperties() {
  const { site, color } = useSite()
  const [params, setParams] = useSearchParams()
  const typeParam = params.get('type')
  const filter: SiteListingFilter = isFilter(typeParam) ? typeParam : ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const { data, isLoading, isFetching } = useSiteProperties(site.slug, filter, page)
  const items = data?.items ?? []

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
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--site-color)] opacity-80">{site.name}</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">Properties</h1>
      <p className="mt-3 text-base text-slate-600">{data ? `${data.total} ${data.total === 1 ? 'property' : 'properties'}` : 'Loading properties…'}</p>

      <div role="tablist" aria-label="Filter by purpose" className="mt-8 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => go({ type: f.value, page: 1 })}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${filter === f.value ? 'text-[var(--site-on-color)] shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-900/10 hover:text-slate-900'}`}
            style={filter === f.value ? { background: color } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={`mt-8 transition-opacity ${isFetching && !isLoading ? 'opacity-60' : ''}`}>
        {isLoading ? <CardSkeletons count={6} /> : items.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((property) => <SitePropertyCard key={property.id} property={property} />)}
          </div>
        ) : (
          <p className="rounded-2xl bg-white p-10 text-center text-slate-500 ring-1 ring-slate-900/5">No properties here right now. Try another filter, or send an enquiry and we will let you know.</p>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-3">
          <button type="button" disabled={page <= 1} onClick={() => go({ page: page - 1 })} className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-900/10 disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <span className="text-sm text-slate-500">Page {page} of {data.totalPages}</span>
          <button type="button" disabled={page >= data.totalPages} onClick={() => go({ page: page + 1 })} className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-900/10 disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </nav>
      )}
    </section>
  )
}
