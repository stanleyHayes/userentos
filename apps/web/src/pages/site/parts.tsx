import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BedDouble, Bath, MapPin, Building2, ArrowUpRight, CalendarDays } from 'lucide-react'
import { listingTypeMeta, formatListingPrice } from '../../../../../packages/shared/listingTypes'
import { useSite, sitePath, type SitePost } from '@/lib/site'
import { formatDate } from '@/lib/utils'
import type { Property } from '@/types'

/** Section heading: a small eyebrow, a serif title, and an optional link on the right. */
export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--site-color)] opacity-80">{eyebrow}</p>}
        <h2 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  )
}

/** A listing card: the photo carries the price and purpose; the body stays short. */
export function SitePropertyCard({ property }: { property: Property & { listingRef?: string; listingType?: string } }) {
  const { base } = useSite()
  const meta = listingTypeMeta(property.listingType)
  const href = property.listingRef ? sitePath(base, `/property/${property.listingRef.toLowerCase()}`) : sitePath(base, '/properties')
  const image = property.images?.[0]
  const place = [property.address?.neighborhood, property.address?.city].filter(Boolean).join(', ')
  return (
    <Link to={href} className="group block overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(15,23,42,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-color)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {image ? (
          <img src={image} alt={property.title} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
        ) : (
          <span className="grid h-full place-items-center text-slate-300"><Building2 size={44} /></span>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-900 shadow-sm">{meta.label}</span>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-4 pb-3 pt-10">
          <p className="font-serif text-2xl font-semibold text-white">{formatListingPrice(property.rentAmount, property.listingType)}</p>
        </div>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-1 text-base font-semibold text-slate-900">{property.title}</h3>
        {place && <p className="flex items-center gap-1.5 text-sm text-slate-500"><MapPin size={14} className="shrink-0" />{place}</p>}
        <div className="flex items-center gap-4 pt-1 text-sm text-slate-600">
          {property.bedrooms ? <span className="flex items-center gap-1.5"><BedDouble size={15} />{property.bedrooms} bed</span> : null}
          {property.bathrooms ? <span className="flex items-center gap-1.5"><Bath size={15} />{property.bathrooms} bath</span> : null}
          <span className="ml-auto text-[var(--site-color)] opacity-0 transition group-hover:opacity-100"><ArrowUpRight size={18} /></span>
        </div>
      </div>
    </Link>
  )
}

/** A news post card with its picture. */
export function SitePostCard({ post }: { post: SitePost }) {
  const { base } = useSite()
  return (
    <Link to={sitePath(base, `/news/${post.slug}`)} className="group block overflow-hidden rounded-2xl bg-white ring-1 ring-slate-900/5 transition hover:shadow-[0_18px_40px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-color)]">
      <div className="aspect-[16/10] overflow-hidden bg-slate-100">
        {post.coverImage
          ? <img src={post.coverImage} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          : <div className="h-full w-full bg-[linear-gradient(135deg,var(--site-color),color-mix(in_oklab,var(--site-color)_55%,white))] opacity-80" />}
      </div>
      <div className="p-5">
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays size={13} />{formatDate(post.publishedAt ?? post.createdAt)}</p>
        <h3 className="mt-2 line-clamp-2 font-serif text-xl font-semibold leading-snug text-slate-900">{post.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">{post.excerpt}</p>
      </div>
    </Link>
  )
}

/** Cards while loading, shaped like the real ones. */
export function CardSkeletons({ count = 3, tall = true }: { count?: number; tall?: boolean }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-900/5">
          <div className={`${tall ? 'aspect-[4/3]' : 'aspect-[16/10]'} animate-pulse bg-slate-100`} />
          <div className="space-y-2 p-4"><div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" /><div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" /></div>
        </div>
      ))}
    </div>
  )
}
