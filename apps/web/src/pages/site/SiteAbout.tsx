import { Link } from 'react-router-dom'
import { BadgeCheck, MapPin, Clock, ArrowRight } from 'lucide-react'
import { useSite, sitePath, PROFESSIONAL_LABEL } from '@/lib/site'
import { SectionHeading } from './parts'

/** The owner's story, team photos, what they do and where. */
export function SiteAbout() {
  const { site, base, color } = useSite()
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--site-color)] opacity-80">About us</p>
        <h1 className="mt-1 max-w-3xl font-serif text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">{site.tagline || `About ${site.name}`}</h1>
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          {site.professionalType && <span className="rounded-full bg-white px-3.5 py-1.5 font-medium text-slate-700 ring-1 ring-slate-900/10">{PROFESSIONAL_LABEL[site.professionalType] ?? 'Real estate'}</span>}
          {site.identityVerified && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1.5 font-medium text-emerald-800 ring-1 ring-emerald-600/20"><BadgeCheck size={15} /> Identity reviewed by RentOS</span>}
          {site.contact.city && <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 font-medium text-slate-700 ring-1 ring-slate-900/10"><MapPin size={14} />{site.contact.city}</span>}
          {site.contact.hours && <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 font-medium text-slate-700 ring-1 ring-slate-900/10"><Clock size={14} />{site.contact.hours}</span>}
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
        <div className={`grid gap-10 ${site.aboutImageUrl ? 'md:grid-cols-[1.1fr_1fr]' : ''}`}>
          <div className="whitespace-pre-line text-lg leading-relaxed text-slate-700">{site.about || `${site.name} helps people find homes to rent and buy. Every enquiry is handled on RentOS.`}</div>
          {site.aboutImageUrl && <img src={site.aboutImageUrl} alt="" className="aspect-[4/5] w-full rounded-3xl object-cover md:sticky md:top-24" />}
        </div>
      </section>

      {(site.services.length > 0 || site.serviceAreas.length > 0) && (
        <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 rounded-3xl bg-white p-6 ring-1 ring-slate-900/5 md:grid-cols-2 md:p-10">
            {site.services.length > 0 && (
              <div>
                <SectionHeading eyebrow="What we do" title="Services" />
                <ul className="space-y-3">
                  {site.services.map((service) => <li key={service} className="flex items-center gap-3 text-base text-slate-700"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />{service}</li>)}
                </ul>
              </div>
            )}
            {site.serviceAreas.length > 0 && (
              <div>
                <SectionHeading eyebrow="Where we work" title="Areas we cover" />
                <ul className="flex flex-wrap gap-2">
                  {site.serviceAreas.map((area) => <li key={area} className="inline-flex items-center gap-1.5 rounded-full bg-[#f7f5f2] px-4 py-2 text-sm font-medium text-slate-700"><MapPin size={13} className="text-[var(--site-color)]" />{area}</li>)}
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
        <Link to={sitePath(base, '/properties')} className="group flex items-center justify-between rounded-3xl px-6 py-8 text-[var(--site-on-color)] md:px-10" style={{ background: color }}>
          <span className="font-serif text-2xl font-semibold md:text-3xl">See our properties</span>
          <ArrowRight size={28} className="transition group-hover:translate-x-1" />
        </Link>
      </section>
    </>
  )
}
