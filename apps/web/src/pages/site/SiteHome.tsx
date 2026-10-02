import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BadgeCheck, MapPin, Search } from 'lucide-react'
import { useSite, sitePath, useSiteProperties, useSitePosts, trackSite, unseenListings, PROFESSIONAL_LABEL, type SiteListingFilter } from '@/lib/site'
import { SectionHeading, SitePropertyCard, SitePostCard, CardSkeletons } from './parts'

const PURPOSES: { value: SiteListingFilter; label: string }[] = [
  { value: 'rent', label: 'Rent' },
  { value: 'sale', label: 'Buy' },
  { value: 'short_let', label: 'Short stay' },
]

export function SiteHome() {
  const { site, base, color } = useSite()
  const navigate = useNavigate()
  const [purpose, setPurpose] = useState<SiteListingFilter>('rent')
  const latest = useSiteProperties(site.slug, '', 1, 6)
  const posts = useSitePosts(site.slug)
  const listings = latest.data?.items ?? []
  const total = latest.data?.total ?? 0

  // One view per visit, and impressions for the cards shown.
  const viewed = useRef(false)
  useEffect(() => {
    if (viewed.current) return
    viewed.current = true
    trackSite(site.slug, { type: 'view' })
  }, [site.slug])
  const listingIds = listings.map((p) => p.id).join(',')
  useEffect(() => {
    const fresh = unseenListings(site.slug, listingIds ? listingIds.split(',') : [])
    if (fresh.length) trackSite(site.slug, { type: 'listing_impression', propertyIds: fresh })
  }, [site.slug, listingIds])

  const headline = site.heroTitle || site.name
  const subline = site.heroSubtitle || site.tagline || (site.contact.city ? `Homes to rent and buy in ${site.contact.city}` : 'Homes to rent and buy across Ghana')

  return (
    <>
      {/* Hero: the owner's own photograph, a confident headline, and the search people actually make. */}
      <section className="relative isolate overflow-hidden">
        {site.branding.coverUrl
          ? <img src={site.branding.coverUrl} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          : <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(1200px 500px at 85% -10%, color-mix(in oklab, ${color} 55%, white) 0%, transparent 60%), linear-gradient(135deg, color-mix(in oklab, ${color} 85%, black), ${color})` }} />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950/80 via-slate-950/45 to-slate-950/20" />
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 md:pb-24 md:pt-36">
          <div className="max-w-2xl">
            {site.professionalType && (
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
                {PROFESSIONAL_LABEL[site.professionalType] ?? 'Real estate'}
                {site.identityVerified && <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 normal-case tracking-normal text-white"><BadgeCheck size={13} /> ID reviewed by RentOS</span>}
              </p>
            )}
            <h1 className="mt-4 font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">{headline}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/85">{subline}</p>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); navigate(`${sitePath(base, '/properties')}?type=${purpose}`) }}
            className="mt-10 flex w-full max-w-xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-2xl sm:flex-row sm:items-center sm:rounded-full"
          >
            <div role="radiogroup" aria-label="What are you looking for?" className="flex flex-1 gap-1">
              {PURPOSES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={purpose === p.value}
                  onClick={() => setPurpose(p.value)}
                  className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${purpose === p.value ? 'text-[var(--site-on-color)] shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                  style={purpose === p.value ? { background: color } : undefined}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button type="submit" className="flex items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              <Search size={16} /> {total ? `See ${total} ${total === 1 ? 'home' : 'homes'}` : 'Search'}
            </button>
          </form>
        </div>
      </section>

      {/* Latest properties */}
      <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 md:pt-20">
        <SectionHeading
          eyebrow="Our properties"
          title="Latest listings"
          action={total > 6 ? <Link to={sitePath(base, '/properties')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-[var(--site-color)]">All {total} properties <ArrowRight size={16} /></Link> : undefined}
        />
        {latest.isLoading ? <CardSkeletons count={3} /> : listings.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((property) => <SitePropertyCard key={property.id} property={property} />)}
          </div>
        ) : (
          <p className="rounded-2xl bg-white p-8 text-center text-slate-500 ring-1 ring-slate-900/5">New listings are coming soon. <Link to={sitePath(base, '/contact')} className="font-semibold text-slate-900 underline">Tell us what you are looking for</Link>.</p>
        )}
      </section>

      {/* About teaser */}
      {(site.about || site.aboutImageUrl) && (
        <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-10 overflow-hidden rounded-3xl bg-white p-6 ring-1 ring-slate-900/5 md:grid-cols-2 md:p-10">
            {site.aboutImageUrl && <img src={site.aboutImageUrl} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover" />}
            <div className={site.aboutImageUrl ? '' : 'md:col-span-2'}>
              <SectionHeading eyebrow="About us" title={`Meet ${site.name}`} />
              {site.about && <p className="line-clamp-5 whitespace-pre-line text-base leading-relaxed text-slate-600">{site.about}</p>}
              <Link to={sitePath(base, '/about')} className="mt-6 inline-flex items-center gap-1.5 font-semibold text-slate-900 hover:text-[var(--site-color)]">Our story <ArrowRight size={16} /></Link>
            </div>
          </div>
        </section>
      )}

      {/* Services and areas */}
      {(site.services.length > 0 || site.serviceAreas.length > 0) && (
        <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
          <div className="grid gap-8 md:grid-cols-2">
            {site.services.length > 0 && (
              <div>
                <SectionHeading eyebrow="What we do" title="Services" />
                <ul className="flex flex-wrap gap-2">
                  {site.services.map((service) => <li key={service} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-900/10">{service}</li>)}
                </ul>
              </div>
            )}
            {site.serviceAreas.length > 0 && (
              <div>
                <SectionHeading eyebrow="Where we work" title="Areas we cover" />
                <ul className="flex flex-wrap gap-2">
                  {site.serviceAreas.map((area) => <li key={area} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-900/10"><MapPin size={13} className="text-[var(--site-color)]" />{area}</li>)}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* News */}
      {(posts.data?.items.length ?? 0) > 0 && (
        <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="News" title="From our desk" action={<Link to={sitePath(base, '/news')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-[var(--site-color)]">All news <ArrowRight size={16} /></Link>} />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.data!.items.slice(0, 3).map((post) => <SitePostCard key={post.id} post={post} />)}
          </div>
        </section>
      )}

      {/* Closing call to action */}
      <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl px-6 py-12 text-center md:px-12 md:py-16" style={{ background: color, color: 'var(--site-on-color)' }}>
          <h2 className="font-serif text-3xl font-semibold tracking-tight md:text-4xl">Looking for something specific?</h2>
          <p className="mx-auto mt-3 max-w-xl text-base opacity-85">Tell {site.name} what you need — area, budget, move-in date — and get a reply in your RentOS messages.</p>
          <Link to={sitePath(base, '/contact')} className="mt-7 inline-flex rounded-full bg-white px-7 py-3 text-sm font-semibold text-slate-900 shadow-lg hover:bg-slate-100">Send an enquiry</Link>
        </div>
      </section>
    </>
  )
}
