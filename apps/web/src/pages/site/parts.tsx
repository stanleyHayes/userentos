import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BedDouble, Bath, MapPin, Building2, ArrowUpRight, CalendarDays } from 'lucide-react'
import { listingTypeMeta, formatListingPrice } from '../../../../../packages/shared/listingTypes'
import { buttonVariants } from '@/components/ui/buttonVariants'
import { useSite, sitePath, type SitePost } from '@/lib/site'
import { formatDate, cn } from '@/lib/utils'
import type { Property } from '@/types'

/** The framework button, filled with the website's brand colour. */
const brandFill: CSSProperties = { background: 'var(--site-color)', color: 'var(--site-on-color)' }

export function BrandLink({ to, href, size = 'md', className, children }: { to?: string; href?: string; size?: 'sm' | 'md' | 'lg'; className?: string; children: ReactNode }) {
  const classes = buttonVariants({ size, className })
  return href
    ? <a href={href} className={classes} style={brandFill}>{children}</a>
    : <Link to={to ?? '/'} className={classes} style={brandFill}>{children}</Link>
}

export function BrandButton({ size = 'md', className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'sm' | 'md' | 'lg' }) {
  return <button {...props} className={buttonVariants({ size, className })} style={brandFill}>{children}</button>
}

/** Section heading: a small eyebrow in the brand colour, a display title, and an optional link on the right. */
export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="site-accent text-[11px] font-bold uppercase tracking-widest">{eyebrow}</p>}
        <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-primary-dark dark:text-white md:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  )
}

/** A page's opening: eyebrow, title and one line. */
export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <>
      <p className="site-accent text-[11px] font-bold uppercase tracking-widest">{eyebrow}</p>
      <h1 className="mt-1 max-w-3xl font-display text-4xl font-extrabold tracking-tight text-primary-dark dark:text-white md:text-5xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-base leading-relaxed text-muted dark:text-gray-400">{children}</div>}
    </>
  )
}

/** A small rounded label (a service, an area, a fact). */
export function Chip({ icon, className, children }: { icon?: ReactNode; className?: string; children: ReactNode }) {
  return <span className={cn('neumorphic-inset inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-primary-dark dark:text-gray-200', className)}>{icon}{children}</span>
}

/** A listing card: the photo carries the price and purpose; the body stays short. */
export function SitePropertyCard({ property }: { property: Property & { listingRef?: string; listingType?: string } }) {
  const { base } = useSite()
  const meta = listingTypeMeta(property.listingType)
  const href = property.listingRef ? sitePath(base, `/property/${property.listingRef.toLowerCase()}`) : sitePath(base, '/properties')
  const image = property.images?.[0]
  const place = [property.address?.neighborhood, property.address?.city].filter(Boolean).join(', ')
  return (
    <Link to={href} className="surface-card surface-card-interactive group block overflow-hidden rounded-2xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-color)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-primary/5 dark:bg-white/[0.03]">
        {image ? (
          <img src={image} alt={property.title} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
        ) : (
          <span className="grid h-full place-items-center text-primary/20 dark:text-white/15"><Building2 size={44} /></span>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md">{meta.label}</span>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-4 pb-3 pt-10">
          <p className="font-display text-xl font-extrabold text-white">{formatListingPrice(property.rentAmount, property.listingType)}</p>
        </div>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-1 text-[15px] font-bold text-primary-dark transition-colors group-hover:text-primary dark:text-white dark:group-hover:text-blue-400">{property.title}</h3>
        {place && <p className="flex items-center gap-1.5 text-xs text-muted dark:text-gray-400"><MapPin size={13} className="shrink-0" />{place}</p>}
        <div className="flex items-center gap-4 pt-1 text-xs text-muted dark:text-gray-400">
          {property.bedrooms ? <span className="flex items-center gap-1.5"><BedDouble size={14} />{property.bedrooms} bed</span> : null}
          {property.bathrooms ? <span className="flex items-center gap-1.5"><Bath size={14} />{property.bathrooms} bath</span> : null}
          <span className="site-accent ml-auto opacity-0 transition group-hover:opacity-100"><ArrowUpRight size={17} /></span>
        </div>
      </div>
    </Link>
  )
}

/** A news post card with its picture. */
export function SitePostCard({ post }: { post: SitePost }) {
  const { base } = useSite()
  return (
    <Link to={sitePath(base, `/news/${post.slug}`)} className="surface-card surface-card-interactive group flex h-full flex-col overflow-hidden rounded-2xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-color)]">
      <div className="aspect-[16/10] overflow-hidden bg-primary/5 dark:bg-white/[0.03]">
        {post.coverImage
          ? <img src={post.coverImage} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          : <div className="h-full w-full bg-[linear-gradient(135deg,var(--site-color),color-mix(in_oklab,var(--site-color)_55%,white))] opacity-80" />}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="flex items-center gap-1.5 text-[11px] text-muted dark:text-gray-500"><CalendarDays size={12} />{formatDate(post.publishedAt ?? post.createdAt)}</p>
        <h3 className="mt-2 line-clamp-2 text-[15px] font-bold leading-snug text-primary-dark transition-colors group-hover:text-primary dark:text-white dark:group-hover:text-blue-400">{post.title}</h3>
        <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-muted dark:text-gray-400">{post.excerpt}</p>
      </div>
    </Link>
  )
}
