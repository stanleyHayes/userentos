import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, MapPin, Clock, ShieldCheck, Eye, Building2 } from 'lucide-react'
import { useSite, sitePath, contrastText } from '@/lib/site'
import { platformOrigin } from '@/lib/platformOrigin'
import { buttonVariants } from '@/components/ui/buttonVariants'
import { IconWatermark } from '@/components/ui/Watermark'
import { BrandLink } from './parts'

const NAV = [
  { label: 'Home', path: '' },
  { label: 'Properties', path: '/properties' },
  { label: 'About', path: '/about' },
  { label: 'News', path: '/news' },
  { label: 'Contact', path: '/contact' },
] as const

/**
 * The site's frame: RentOS owns it; the owner's logo, name and colour fill it.
 * Built from the RentOS framework (public-shell background, surface-card,
 * buttons, watermarks), so it follows the skin and light/dark theme like
 * every other RentOS page, with the owner's colour as its accent.
 */
export function SiteLayout() {
  const { site, base, onHost, color } = useSite()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const onColor = contrastText(color)
  const [menuPath, setMenuPath] = useState(location.pathname)
  // Close the mobile menu on navigation (render-time adjustment, no effect).
  if (menuPath !== location.pathname) { setMenuPath(location.pathname); if (open) setOpen(false) }

  const enquireHref = sitePath(base, '/contact')

  return (
    <div className="public-shell-bg min-h-screen font-sans antialiased" style={{ ['--site-color' as string]: color, ['--site-on-color' as string]: onColor }}>
      {site.preview && (
        <div className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-center text-xs font-semibold text-amber-950">
          <Eye size={14} /> Preview: only you can see this draft. Launch it from My website when you are ready.
        </div>
      )}

      <header className="surface-card sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to={sitePath(base)} className="flex min-w-0 items-center gap-3">
            {site.branding.logoUrl
              ? <img src={site.branding.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
              : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-lg font-extrabold" style={{ background: color, color: onColor }}>{site.name.charAt(0)}</span>}
            <span className="truncate font-display text-lg font-extrabold tracking-tight text-primary-dark dark:text-white">{site.name}</span>
          </Link>

          <nav aria-label="Website" className="ml-auto hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.label}
                to={sitePath(base, item.path)}
                end={item.path === ''}
                className={({ isActive }) => `rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${isActive ? 'text-primary-dark dark:text-white' : 'text-muted hover:text-primary-dark dark:text-gray-400 dark:hover:text-white'}`}
              >
                {({ isActive }) => <span className={isActive ? 'border-b-2 border-[var(--site-color)] pb-0.5' : ''}>{item.label}</span>}
              </NavLink>
            ))}
          </nav>
          <BrandLink to={enquireHref} size="sm" className="hidden md:inline-flex">Enquire</BrandLink>

          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} className="neumorphic-icon ml-auto rounded-xl p-2 text-muted hover:text-primary-dark dark:text-gray-300 md:hidden">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {open && (
          <nav aria-label="Website" className="border-t border-border/60 px-4 pb-4 pt-2 dark:border-white/10 md:hidden">
            {NAV.map((item) => (
              <NavLink key={item.label} to={sitePath(base, item.path)} end={item.path === ''} className={({ isActive }) => `block rounded-xl px-3 py-3 text-base font-semibold ${isActive ? 'bg-primary/10 text-primary-dark dark:bg-white/[0.06] dark:text-white' : 'text-muted dark:text-gray-400'}`}>
                {item.label}
              </NavLink>
            ))}
            <BrandLink to={enquireHref} className="mt-2 w-full">Enquire</BrandLink>
          </nav>
        )}
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="relative mt-20 overflow-hidden bg-[#070b14] text-white">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--site-color)] to-transparent" />
        <IconWatermark icon={Building2} tone="brand" className="-right-10 -top-6 size-72 rotate-[-10deg]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-2xl font-extrabold">{site.name}</p>
            {site.tagline && <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/55">{site.tagline}</p>}
            <div className="mt-5 space-y-2 text-sm text-white/70">
              {site.contact.city && <p className="flex items-center gap-2"><MapPin size={15} className="text-white/40" />{site.contact.city}</p>}
              {site.contact.hours && <p className="flex items-center gap-2"><Clock size={15} className="text-white/40" />{site.contact.hours}</p>}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">Explore</p>
            <ul className="mt-4 space-y-2.5 text-sm text-white/70">
              {NAV.map((item) => <li key={item.label}><Link to={sitePath(base, item.path)} className="hover:text-white">{item.label}</Link></li>)}
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">Enquiries</p>
            <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-white/55">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" />
              Every enquiry is handled securely on RentOS, so your conversation, viewing and payment are protected.
            </p>
            <Link to={enquireHref} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'dark-surface-control dark-surface-outline mt-4' })}>Send an enquiry</Link>
          </div>
        </div>
        <div className="relative border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-white/40 sm:px-6">
            <p>© {new Date().getFullYear()} {site.name}</p>
            {!site.branding.hideRentosBranding && (
              <a href={onHost ? platformOrigin() : '/'} className="hover:text-white/70">
                Website by <span className="font-semibold text-white/70">Rent<span className="text-secondary">OS</span></span>
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
