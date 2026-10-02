import { Link } from 'react-router-dom'
import { BadgeCheck, MapPin, Clock, ArrowRight, Building2, Home } from 'lucide-react'
import { IconWatermark } from '@/components/ui/Watermark'
import { useSite, sitePath, PROFESSIONAL_LABEL } from '@/lib/site'
import { SectionHeading, PageIntro, Chip } from './parts'

/** The owner's story, team photos, what they do and where. */
export function SiteAbout() {
  const { site, base, color } = useSite()
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
        <PageIntro eyebrow="About us" title={site.tagline || `About ${site.name}`} />
        <div className="mt-5 flex flex-wrap gap-2">
          {site.professionalType && <Chip>{PROFESSIONAL_LABEL[site.professionalType] ?? 'Real estate'}</Chip>}
          {site.identityVerified && <Chip icon={<BadgeCheck size={15} className="text-emerald-600 dark:text-emerald-400" />}>Identity reviewed by RentOS</Chip>}
          {site.contact.city && <Chip icon={<MapPin size={14} className="site-accent" />}>{site.contact.city}</Chip>}
          {site.contact.hours && <Chip icon={<Clock size={14} className="site-accent" />}>{site.contact.hours}</Chip>}
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
        <div className={`grid gap-10 ${site.aboutImageUrl ? 'md:grid-cols-[1.1fr_1fr]' : ''}`}>
          <div className="whitespace-pre-line text-lg leading-relaxed text-primary-dark/80 dark:text-gray-300">{site.about || `${site.name} helps people find homes to rent and buy. Every enquiry is handled on RentOS.`}</div>
          {site.aboutImageUrl && <img src={site.aboutImageUrl} alt="" className="aspect-[4/5] w-full rounded-3xl object-cover md:sticky md:top-24" />}
        </div>
      </section>

      {(site.services.length > 0 || site.serviceAreas.length > 0) && (
        <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
          <div className="surface-card relative grid gap-10 overflow-hidden rounded-3xl border p-6 md:grid-cols-2 md:p-10">
            <IconWatermark icon={Building2} className="-bottom-10 -right-8 size-56 rotate-[-10deg]" />
            {site.services.length > 0 && (
              <div className="relative">
                <SectionHeading eyebrow="What we do" title="Services" />
                <ul className="space-y-3">
                  {site.services.map((service) => <li key={service} className="flex items-center gap-3 text-base text-primary-dark dark:text-gray-200"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />{service}</li>)}
                </ul>
              </div>
            )}
            {site.serviceAreas.length > 0 && (
              <div className="relative">
                <SectionHeading eyebrow="Where we work" title="Areas we cover" />
                <ul className="flex flex-wrap gap-2">
                  {site.serviceAreas.map((area) => <li key={area}><Chip icon={<MapPin size={13} className="site-accent" />}>{area}</Chip></li>)}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {site.gallery.length > 0 && (
        <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
          <SectionHeading eyebrow="Gallery" title="Our work" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {site.gallery.map((url) => <img key={url} src={url} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-2xl object-cover" />)}
          </div>
        </section>
      )}

      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <Link to={sitePath(base, '/properties')} className="group relative flex items-center justify-between overflow-hidden rounded-3xl px-6 py-8 shadow-[0_18px_56px_rgba(15,31,51,0.16)] md:px-10" style={{ background: color, color: 'var(--site-on-color)' }}>
          <IconWatermark icon={Home} tone="brand" className="-right-4 -top-10 size-44 rotate-[-10deg]" />
          <span className="relative font-display text-2xl font-extrabold md:text-3xl">See our properties</span>
          <ArrowRight size={28} className="relative transition group-hover:translate-x-1" />
        </Link>
      </section>
    </>
  )
}
