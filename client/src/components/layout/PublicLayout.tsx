import { useState, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Footer } from '@/components/layout/Footer'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'
import {
  Menu, X, Scale, Shield, FileText, Lock, ArrowRight,
  Home, ChevronRight,
} from 'lucide-react'

const NAV_LINKS = [
  { to: '/#features', label: 'Features', icon: Home },
  { to: '/rental-laws', label: 'Rental Laws', icon: Scale },
  { to: '/privacy', label: 'Privacy', icon: Shield },
  { to: '/terms', label: 'Terms', icon: FileText },
  { to: '/data-protection', label: 'Data Protection', icon: Lock },
]

export function PublicLayout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // Close drawer on route change — React's "reset state on prop change" pattern
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  const [prevPath, setPrevPath] = useState(location.pathname)
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname)
    setOpen(false)
  }

  function isNavActive(to: string) {
    if (to.startsWith('/#')) {
      const hash = to.slice(1)
      return location.pathname === '/' && (location.hash === hash || (!location.hash && hash === '#features'))
    }
    return location.pathname === to || location.pathname.startsWith(`${to}/`)
  }

  // Lock body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const activeTo = NAV_LINKS.find((l) => isNavActive(l.to))?.to ?? null
  const { attach: navPillAttach, style: navPillStyle, visible: navPillVisible } = useSlidingIndicator<HTMLDivElement>(activeTo)

  return (
    <div className="public-shell-bg min-h-screen flex flex-col">
      {/* ── Navbar ── */}
      <nav className="sticky top-3 z-50 px-3 py-3 sm:px-6">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 rounded-full border border-border/70 bg-white/82 px-3 shadow-[0_18px_50px_rgba(15,31,51,0.1)] backdrop-blur-2xl dark:border-white/12 dark:bg-[#0a0d12]/78 dark:shadow-black/35 sm:h-16 sm:px-4">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <Logo size={30} theme="dark" />
          </Link>

          {/* Desktop links */}
          <div ref={navPillAttach} className="relative isolate hidden items-center gap-1 rounded-full border border-border/70 bg-surface/70 p-1 dark:border-white/10 dark:bg-white/[0.06] md:flex">
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-primary shadow-sm transition-[transform,width,height] duration-300 ease-out dark:bg-cyan-300"
              style={{ ...navPillStyle, opacity: navPillVisible ? 1 : 0 }}
            />
            {NAV_LINKS.map(({ to, label }) => {
              const active = isNavActive(to)
              return (
                <Link
                  key={to}
                  to={to}
                  data-tab-key={to}
                  aria-current={active ? 'page' : undefined}
                  className={`focus-ring relative z-10 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
                    active
                      ? 'text-white dark:text-[#071018]'
                      : 'text-muted hover:bg-white hover:text-primary-dark dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white'
                  }`}
                >
                  {label}
                  {active && (
                    <span className="absolute -bottom-1 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-secondary shadow-[0_0_16px_rgba(245,158,11,0.55)] dark:bg-violet-300" />
                  )}
                </Link>
              )
            })}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1">
            <ThemeToggle className="rounded-full hover:bg-surface dark:hover:bg-white/10" />

            {/* Desktop CTA */}
            <Link
              to="/login"
              className="focus-ring ml-2 hidden items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-[#2d5a8e] px-4 py-1.5 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-opacity hover:opacity-90 dark:from-cyan-300 dark:to-violet-300 dark:text-[#0a0d12] md:inline-flex"
            >
              Sign In <ArrowRight size={14} />
            </Link>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
              className="focus-ring relative rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-foreground dark:hover:bg-white/10 dark:hover:text-white md:hidden"
            >
              <span
                className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ${
                  open ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-75'
                }`}
              >
                <X size={20} />
              </span>
              <span
                className={`flex items-center justify-center transition-all duration-200 ${
                  open ? 'opacity-0 rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100'
                }`}
              >
                <Menu size={20} />
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile Drawer ── */}
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-72 md:hidden flex flex-col overflow-hidden transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          background: 'linear-gradient(160deg, #0a0d12 0%, #171122 52%, #10231f 100%)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

        {/* Drawer header */}
        <div className="relative flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
          <Logo size={28} theme="light" />
          <button
            onClick={() => setOpen(false)}
            className="focus-ring p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav links */}
        <div className="relative flex-1 overflow-y-auto px-4 py-6 space-y-1">
          {NAV_LINKS.map(({ to, label, icon: Icon }, i) => {
            const active = isNavActive(to)
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? 'page' : undefined}
                style={{ animationDelay: `${i * 40}ms` }}
                className={`group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  active
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {active && <span className="absolute left-1 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-secondary" />}
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  active ? 'bg-secondary/30 text-secondary' : 'bg-white/5 text-white/40 group-hover:bg-white/10 group-hover:text-white/80'
                }`}>
                  <Icon size={16} />
                </span>
                <span className="font-medium text-sm">{label}</span>
                <ChevronRight size={14} className={`ml-auto transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
              </Link>
            )
          })}
        </div>

        {/* Auth CTAs */}
        <div className="relative px-4 pb-8 pt-4 border-t border-white/10 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-1 mb-2">Account</p>
          <Link
            to="/register"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-secondary to-amber-400 text-[#0f1f33] hover:opacity-90 transition-opacity"
          >
            Get Started Free <ArrowRight size={14} />
          </Link>
          <Link
            to="/login"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm bg-white/10 text-white hover:bg-white/15 transition-colors border border-white/10"
          >
            Sign In
          </Link>
        </div>
      </div>

      {/* Page content */}
      <main className="flex-1">
        <div key={location.pathname} className="page-enter">
          <Outlet />
        </div>
      </main>

      <Footer />
    </div>
  )
}
