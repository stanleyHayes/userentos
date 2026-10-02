import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, MapPin, Clock, ShieldCheck, Eye } from 'lucide-react'
import { useSite, sitePath, contrastText } from '@/lib/site'
import { platformOrigin } from '@/lib/platformOrigin'

const NAV = [
  { label: 'Home', path: '' },
  { label: 'Properties', path: '/properties' },
  { label: 'About', path: '/about' },
  { label: 'News', path: '/news' },
  { label: 'Contact', path: '/contact' },
] as const

/** The site's frame: RentOS owns it; the owner's logo, name and colour fill it. */
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
    <div className="min-h-screen bg-[#f7f5f2] font-sans text-slate-800 antialiased" style={{ ['--site-color' as string]: color, ['--site-on-color' as string]: onColor }}>
      {site.preview && (
        <div className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-center text-xs font-semibold text-amber-950">
          <Eye size={14} /> Preview — only you can see this draft. Launch it from My website when you are ready.
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-slate-900/5 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to={sitePath(base)} className="flex min-w-0 items-center gap-3">
            {site.branding.logoUrl
              ? <img src={site.branding.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
              : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-serif text-lg font-semibold" style={{ background: color, color: onColor }}>{site.name.charAt(0)}</span>}
            <span className="truncate font-serif text-lg font-semibold tracking-tight text-slate-900">{site.name}</span>
          </Link>

          <nav aria-label="Website" className="ml-auto hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.label}
                to={sitePath(base, item.path)}
                end={item.path === ''}
                className={({ isActive }) => `rounded-full px-3.5 py-2 text-sm font-medium transition ${isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
              >
                {({ isActive }) => <span className={isActive ? 'border-b-2 border-[var(--site-color)] pb-0.5' : ''}>{item.label}</span>}
              </NavLink>
            ))}
          </nav>
          <Link to={enquireHref} className="hidden rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm transition hover:opacity-90 md:inline-flex" style={{ background: color, color: onColor }}>
            Enquire
          </Link>

          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} className="ml-auto rounded-xl p-2 text-slate-700 hover:bg-slate-100 md:hidden">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {open && (
          <nav aria-label="Website" className="border-t border-slate-900/5 bg-white px-4 pb-4 pt-2 md:hidden">
            {NAV.map((item) => (
              <NavLink key={item.label} to={sitePath(base, item.path)} end={item.path === ''} className={({ isActive }) => `block rounded-xl px-3 py-3 text-base font-medium ${isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600'}`}>
                {item.label}
              </NavLink>
            ))}
            <Link to={enquireHref} className="mt-2 block rounded-xl px-3 py-3 text-center text-base font-semibold" style={{ background: color, color: onColor }}>Enquire</Link>
          </nav>
        )}
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="mt-20 bg-slate-950 text-slate-300">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-serif text-2xl font-semibold text-white">{site.name}</p>
            {site.tagline && <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">{site.tagline}</p>}
            <div className="mt-5 space-y-2 text-sm">
              {site.contact.city && <p className="flex items-center gap-2"><MapPin size={15} className="text-slate-500" />{site.contact.city}</p>}
              {site.contact.hours && <p className="flex items-center gap-2"><Clock size={15} className="text-slate-500" />{site.contact.hours}</p>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Explore</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {NAV.map((item) => <li key={item.label}><Link to={sitePath(base, item.path)} className="hover:text-white">{item.label}</Link></li>)}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Enquiries</p>
            <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-slate-400">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" />
              Every enquiry is handled securely on RentOS, so your conversation, viewing and payment are protected.
            </p>
            <Link to={enquireHref} className="mt-4 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100">Send an enquiry</Link>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-slate-500 sm:px-6">
            <p>© {new Date().getFullYear()} {site.name}</p>
            {!site.branding.hideRentosBranding && (
              <a href={onHost ? platformOrigin() : '/'} className="hover:text-slate-300">
                Website by <span className="font-semibold text-slate-300">Rent<span className="text-amber-400">OS</span></span>
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
