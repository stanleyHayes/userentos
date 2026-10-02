import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BadgeCheck, MapPin, Search, Home, Building2, MessagesSquare } from 'lucide-react'
import { buttonVariants } from '@/components/ui/buttonVariants'
import { IconWatermark } from '@/components/ui/Watermark'
import { GridSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSite, sitePath, useSiteProperties, useSitePosts, trackSite, unseenListings, PROFESSIONAL_LABEL, type SiteListingFilter } from '@/lib/site'
import { SectionHeading, SitePropertyCard, SitePostCard, Chip } from './parts'

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

  const allLink = (to: string, label: string) => <Link to={to} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>{label} <ArrowRight size={15} /></Link>

  return (
    <>
      {/* Hero: the owner's own photograph, a confident headline, and the search people actually make. */}
      <section className="relative isolate overflow-hidden">
        {site.branding.coverUrl
          ? <img src={site.branding.coverUrl} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          : <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(1200px 500px at 85% -10%, color-mix(in oklab, ${color} 55%, white) 0%, transparent 60%), linear-gradient(135deg, color-mix(in oklab, ${color} 85%, black), ${color})` }} />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#070b14]/85 via-[#070b14]/45 to-[#070b14]/15" />
        <IconWatermark icon={Home} tone="brand" className="-right-16 top-10 hidden size-[26rem] rotate-[-8deg] md:block" />
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 md:pb-24 md:pt-36">
          <div className="max-w-2xl">
            {site.professionalType && (
              <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/75">
                {PROFESSIONAL_LABEL[site.professionalType] ?? 'Real estate'}
                {site.identityVerified && <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 normal-case tracking-normal text-white backdrop-blur-md"><BadgeCheck size={13} /> ID reviewed by RentOS</span>}
              </p>
            )}
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">{headline}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/80">{subline}</p>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); navigate(`${sitePath(base, '/properties')}?type=${purpose}`) }}
            className="surface-card mt-10 flex w-full max-w-xl flex-col gap-2 rounded-3xl border p-2 sm:flex-row sm:items-center sm:rounded-full"
          >
            <div role="radiogroup" aria-label="What are you looking for?" className="flex flex-1 gap-1">
              {PURPOSES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={purpose === p.value}
                  onClick={() => setPurpose(p.value)}
                  className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${purpose === p.value ? 'shadow-sm' : 'text-muted hover:text-primary-dark dark:text-gray-400 dark:hover:text-white'}`}
                  style={purpose === p.value ? { background: color, color: 'var(--site-on-color)' } : undefined}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button type="submit" className={buttonVariants({})}>
              <Search size={16} /> {total ? `See ${total} ${total === 1 ? 'home' : 'homes'}` : 'Search'}
            </button>
          </form>
        </div>
      </section>

      {/* Latest properties */}
      <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 md:pt-20">
        <SectionHeading eyebrow="Our properties" title="Latest listings" action={total > 6 ? allLink(sitePath(base, '/properties'), `All ${total} properties`) : undefined} />
        {latest.isLoading ? <GridSkeleton cols={3} count={3} /> : listings.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((property) => <SitePropertyCard key={property.id} property={property} />)}
          </div>
        ) : (
          <EmptyState preset="properties" compact title="New listings are coming soon" description="Tell us what you are looking for and we will let you know." action={{ label: 'Send an enquiry', href: sitePath(base, '/contact') }} />
        )}
      </section>

      {/* About teaser */}
      {(site.about || site.aboutImageUrl) && (
        <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
          <div className="surface-card relative grid items-center gap-10 overflow-hidden rounded-3xl border p-6 md:grid-cols-2 md:p-10">
            <IconWatermark icon={Building2} className="-bottom-10 -right-8 size-56 rotate-[-10deg]" />
            {site.aboutImageUrl && <img src={site.aboutImageUrl} alt="" className="relative aspect-[4/3] w-full rounded-2xl object-cover" />}
            <div className={`relative ${site.aboutImageUrl ? '' : 'md:col-span-2'}`}>
              <SectionHeading eyebrow="About us" title={`Meet ${site.name}`} />
              {site.about && <p className="line-clamp-5 whitespace-pre-line text-base leading-relaxed text-muted dark:text-gray-400">{site.about}</p>}
              <Link to={sitePath(base, '/about')} className={buttonVariants({ variant: 'outline', className: 'mt-6' })}>Our story <ArrowRight size={16} /></Link>
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
                  {site.services.map((service) => <li key={service}><Chip>{service}</Chip></li>)}
                </ul>
              </div>
            )}
            {site.serviceAreas.length > 0 && (
              <div>
                <SectionHeading eyebrow="Where we work" title="Areas we cover" />
                <ul className="flex flex-wrap gap-2">
                  {site.serviceAreas.map((area) => <li key={area}><Chip icon={<MapPin size={13} className="site-accent" />}>{area}</Chip></li>)}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* News */}
      {(posts.data?.items.length ?? 0) > 0 && (
        <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="News" title="From our desk" action={allLink(sitePath(base, '/news'), 'All news')} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.data!.items.slice(0, 3).map((post) => <SitePostCard key={post.id} post={post} />)}
          </div>
        </section>
      )}

      {/* Closing call to action */}
      <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl px-6 py-12 text-center shadow-[0_18px_56px_rgba(15,31,51,0.16)] md:px-12 md:py-16" style={{ background: color, color: 'var(--site-on-color)' }}>
          <IconWatermark icon={MessagesSquare} tone="brand" className="-left-10 -top-8 size-56 rotate-[-12deg]" />
          <IconWatermark icon={Home} tone="brand" className="-bottom-12 -right-6 size-48 rotate-12" />
          <h2 className="relative font-display text-3xl font-extrabold tracking-tight md:text-4xl" style={{ color: 'var(--site-on-color)' }}>Looking for something specific?</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-base opacity-85">Tell {site.name} what you need (area, budget, move-in date) and get a reply in your RentOS messages.</p>
          <Link to={sitePath(base, '/contact')} className={buttonVariants({ size: 'lg', className: 'relative mt-7' })} style={{ background: '#ffffff', color: '#0f1f33' }}>Send an enquiry</Link>
        </div>
      </section>
    </>
  )
}
