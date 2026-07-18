import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { BlogPost } from '@/types'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Logo'
import { LogoWatermark } from '@/components/ui/Watermark'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Footer } from '@/components/layout/Footer'
import { useAuthRehydrate, useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'
import {
  CountUp,
  Magnetic,
  Parallax,
  SplitText,
  TiltCard,
} from '@/components/landing/LandingEffects'
import { Animate } from '@/components/ui/Animate'
import {
  ArrowRight,
  Banknote,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileSignature,
  FileText,
  Hammer,
  Landmark,
  Loader2,
    MapPin,
  Menu,
  Phone,
  PiggyBank,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
  Users,
  Wand2,
  X,
  XCircle,
} from 'lucide-react'

interface AbuseViolation {
  law: string
  violation: string
  explanation: string
  maxPenalty: string
}

interface AbuseCheckResult {
  isViolation: boolean
  severity: 'high' | 'medium' | 'low' | null
  violations: AbuseViolation[]
  nextSteps: string[]
  contacts: {
    rentControl: { name: string; phone: string; location: string }
    chraj: { name: string; phone: string }
  }
  signUpCta: string
}

const platformModules = [
  {
    title: 'Public registry and discovery',
    description: 'Search public property records, browse listings, save homes, and review property details before applying.',
    icon: <Search size={22} />,
    href: '/registry',
  },
  {
    title: 'Tenant passport and credit',
    description: 'Build a verified tenant profile with documents, references, rent history, achievements, and credit scoring.',
    icon: <ShieldCheck size={22} />,
    href: '/register',
  },
  {
    title: 'Agreements, payments, and documents',
    description: 'Run digital leases, payment records, receipts, document vaults, applications, and disputes in one flow.',
    icon: <FileSignature size={22} />,
    href: '/register',
  },
  {
    title: 'RentGuard savings',
    description: 'Help tenants plan ahead with rent goals, savings progress, streaks, and payment readiness signals.',
    icon: <PiggyBank size={22} />,
    href: '/register',
  },
  {
    title: 'Financing and collections',
    description: 'Support rent advances, deposit loans, offers, applications, contracts, mandates, and collections reviews.',
    icon: <Banknote size={22} />,
    href: '/register',
  },
  {
    title: 'Employer payroll mandates',
    description: 'Connect employers to employee records, payroll runs, salary deductions, and mandate approvals.',
    icon: <BriefcaseBusiness size={22} />,
    href: '/register',
  },
  {
    title: 'Insurance marketplace',
    description: 'Compare renter, landlord, rent guarantee, property damage, and tenant default cover with claims tracking.',
    icon: <ShieldPlus size={22} />,
    href: '/register',
  },
  {
    title: 'Maintenance and service work',
    description: 'Track maintenance requests, vendors, repair schedules, worker marketplace bookings, and job history.',
    icon: <Hammer size={22} />,
    href: '/register',
  },
  {
    title: 'AI writing assistant',
    description: 'Generate, polish, translate, and score property copy so listings launch with stronger information quality.',
    icon: <Wand2 size={22} />,
    href: '/login',
  },
]

const roleRoutes = [
  {
    title: 'Tenants',
    description: 'Find a place, manage agreements, save for rent, pay digitally, share a verified passport, and resolve issues.',
    icon: <Users size={22} />,
    checks: ['Discover homes', 'Tenant passport', 'RentGuard', 'Disputes'],
  },
  {
    title: 'Landlords and managers',
    description: 'List properties, screen applications, manage tenants, collect rent, create content, and coordinate maintenance.',
    icon: <Building2 size={22} />,
    checks: ['Listings', 'Applications', 'Tenants', 'AI Writer'],
  },
  {
    title: 'Financiers',
    description: 'Publish financing offers, review applications, manage contracts, collect repayments, and watch portfolio risk.',
    icon: <Landmark size={22} />,
    checks: ['Offers', 'Contracts', 'Collections', 'Risk view'],
  },
  {
    title: 'Employers',
    description: 'Maintain employer profiles, employee data, deduction mandates, and payroll run workflows.',
    icon: <BriefcaseBusiness size={22} />,
    checks: ['Employees', 'Mandates', 'Payroll', 'Approvals'],
  },
  {
    title: 'Essential workers',
    description: 'Receive maintenance work, manage bookings, track job history, and show verified service readiness.',
    icon: <Hammer size={22} />,
    checks: ['Job requests', 'Bookings', 'Work history', 'Service profile'],
  },
  {
    title: 'Government and admins',
    description: 'Review property compliance, policies, feature flags, packages, claims, platform finance, and market analytics.',
    icon: <ClipboardCheck size={22} />,
    checks: ['Reviews', 'Policies', 'Analytics', 'Admin console'],
  },
]

const workflow = [
  { title: 'Verify', description: 'Registry, profile, document, property, employer, and insurance checks keep records dependable.', icon: <Shield size={20} /> },
  { title: 'Transact', description: 'Payments, agreements, financing contracts, payroll deductions, and savings plans move through auditable rails.', icon: <CreditCard size={20} /> },
  { title: 'Operate', description: 'Maintenance, worker bookings, messages, disputes, applications, and claims stay visible to the right role.', icon: <CalendarCheck size={20} /> },
  { title: 'Govern', description: 'Analytics, simulations, public records, admin queues, and compliance reviews keep the platform accountable.', icon: <BarChart3 size={20} /> },
]

const LANDING_SECTION_IDS = ['features', 'roles', 'operations', 'rights'] as const

function Metric({ value, label, numeric, suffix = '' }: { value: string; label: string; numeric?: number; suffix?: string }) {
  return (
    <div>
      <p className="font-display text-3xl font-extrabold text-white md:text-4xl">
        {numeric !== undefined ? <CountUp value={numeric} suffix={suffix} /> : value}
      </p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/45">{label}</p>
    </div>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto mb-12 max-w-3xl text-center">
      <h2 className="font-display text-3xl font-extrabold leading-tight text-[#0f1f33] dark:text-white md:text-5xl">{title}</h2>
      <p className="mt-4 text-base leading-relaxed text-muted dark:text-gray-400 md:text-lg">{description}</p>
    </div>
  )
}

export function LandingPage() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [abuseQuery, setAbuseQuery] = useState('')
  const [abuseLoading, setAbuseLoading] = useState(false)
  const [abuseResult, setAbuseResult] = useState<AbuseCheckResult | null>(null)
  const [abuseError, setAbuseError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<(typeof LANDING_SECTION_IDS)[number]>('features')
  const abuseResultRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const { isAuthenticated } = useAuthStore()
  const hasHydrated = useAuthRehydrate()
  const showDashboard = hasHydrated && isAuthenticated

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || '/api'
    fetch(`${base}/blog`).then(r => r.json()).then(d => setPosts(d.data?.items ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (location.pathname !== '/') return

    const syncActiveSection = () => {
      const activationLine = window.innerHeight * 0.38
      let current: (typeof LANDING_SECTION_IDS)[number] = 'features'

      for (const id of LANDING_SECTION_IDS) {
        const section = document.getElementById(id)
        if (section && section.getBoundingClientRect().top <= activationLine) {
          current = id
        }
      }

      setActiveSection(current)
    }

    syncActiveSection()
    window.addEventListener('scroll', syncActiveSection, { passive: true })
    window.addEventListener('resize', syncActiveSection)

    return () => {
      window.removeEventListener('scroll', syncActiveSection)
      window.removeEventListener('resize', syncActiveSection)
    }
  }, [location.pathname])

  async function handleAbuseCheck() {
    if (!abuseQuery.trim() || abuseQuery.trim().length < 5) {
      setAbuseError('Please describe your situation in more detail.')
      return
    }
    setAbuseLoading(true)
    setAbuseResult(null)
    setAbuseError('')
    try {
      const base = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${base}/ai/abuse-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: abuseQuery }),
      })
      const data = await res.json()
      if (data.success) {
        setAbuseResult(data.data)
        setTimeout(() => abuseResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      } else {
        setAbuseError(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setAbuseError('Could not connect to the server. Please try again later.')
    } finally {
      setAbuseLoading(false)
    }
  }

  const navLinks = [
    { href: '#features', label: 'Features' },
    { href: '#roles', label: 'Roles' },
    { href: '#operations', label: 'Operations' },
    { href: '#rights', label: 'Rights' },
    { href: '/registry', label: 'Registry' },
  ]

  const drawerLinks = [
    { href: '#features', label: 'Features', desc: 'Everything in one platform', icon: Sparkles },
    { href: '#roles', label: 'Roles', desc: 'A workspace for everyone', icon: Users },
    { href: '#operations', label: 'Operations', desc: 'Payments, savings & disputes', icon: BarChart3 },
    { href: '#rights', label: 'Rights', desc: 'Know where you stand', icon: ShieldCheck },
    { href: '/registry', label: 'Registry', desc: 'Verified rentals near you', icon: Search },
    { href: '/rental-laws', label: 'Rental Laws', desc: 'Tenancy law in plain language', icon: Scale },
  ]

  function isNavActive(href: string) {
    if (href.startsWith('#')) {
      return location.pathname === '/' && activeSection === href.slice(1)
    }
    return location.pathname === href || location.pathname.startsWith(`${href}/`)
  }

  function navLinkClass(active: boolean) {
    return cn(
      'relative z-10 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors',
      active
        ? 'text-[#0a0d12]'
        : 'text-white/62 hover:bg-white/10 hover:text-white',
    )
  }

  const activeNavHref = navLinks.find((item) => isNavActive(item.href))?.href ?? null
  const { attach: navPillAttach, style: navPillStyle, visible: navPillVisible } = useSlidingIndicator<HTMLDivElement>(activeNavHref)

  return (
    <div className="public-shell-bg min-h-screen overflow-hidden">
      <nav className="fixed inset-x-0 top-3 z-50 px-3 sm:top-4 sm:px-6">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 rounded-full border border-white/12 bg-[#0a0d12]/78 px-3 shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-2xl sm:h-16 sm:px-4">
          <Link to="/" aria-label="RentOS home"><Logo size={28} theme="light" /></Link>
          <div ref={navPillAttach} className="relative isolate hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] p-1 md:flex">
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-white shadow-sm transition-[transform,width,height] duration-300 ease-out"
              style={{ ...navPillStyle, opacity: navPillVisible ? 1 : 0 }}
            />
            {navLinks.map((item) => {
              const active = isNavActive(item.href)
              const content = (
                <>
                  {item.label}
                  {active && <span className="absolute -bottom-1 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-secondary shadow-[0_0_16px_rgba(245,158,11,0.65)]" />}
                </>
              )
              return item.href.startsWith('#') ? (
                <a
                  key={item.href}
                  href={item.href}
                  data-tab-key={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setActiveSection(item.href.slice(1) as (typeof LANDING_SECTION_IDS)[number])}
                  className={navLinkClass(active)}
                >
                  {content}
                </a>
              ) : (
                <Link key={item.href} to={item.href} data-tab-key={item.href} aria-current={active ? 'page' : undefined} className={navLinkClass(active)}>{content}</Link>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden rounded-full text-white hover:bg-white/10 sm:block" />
            {showDashboard ? (
              <Link to="/dashboard"><Button size="sm" className="bg-secondary hover:bg-amber-400 text-[#0f1f33]">Dashboard <ArrowRight size={14} /></Button></Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:block"><Button variant="ghost" size="sm" className="text-white/80 hover:bg-white/10 hover:text-white">Sign In</Button></Link>
                <Link to="/register"><Button size="sm" className="bg-secondary hover:bg-amber-400 text-[#0f1f33]">Get Started</Button></Link>
              </>
            )}
            <button
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white md:hidden"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </nav>

      <div className={`fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm transition-opacity md:hidden ${menuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} onClick={() => setMenuOpen(false)} />
      <aside
        className={`fixed right-0 top-0 z-[70] flex h-full w-80 flex-col overflow-hidden transition-transform duration-300 md:hidden ${menuOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ background: '#0a0d12' }}
      >
        <div className="relative flex items-center justify-between border-b border-white/10 px-6 py-5">
          <Logo size={28} theme="light" />
          <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="rounded-xl bg-white/10 p-2 text-white transition-colors hover:bg-white/20"><X size={18} /></button>
        </div>

        <div key={menuOpen ? 'open' : 'closed'} className="relative flex-1 space-y-1.5 overflow-y-auto px-4 py-6">
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-widest text-white/30">Explore</p>
          {drawerLinks.map((item, i) => {
            const Icon = item.icon
            const active = isNavActive(item.href)
            const className = cn(
              'group relative flex animate-fade-up items-center gap-3 rounded-xl px-3 py-3 transition-colors',
              active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/[0.07] hover:text-white',
            )
            const content = (
              <>
                {active && <span className="absolute left-0 top-1/2 h-9 w-1 -translate-y-1/2 rounded-r-full bg-secondary shadow-[0_0_16px_rgba(245,158,11,0.6)]" />}
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors', active ? 'bg-secondary/25 text-secondary' : 'bg-white/[0.06] text-white/45 group-hover:bg-white/10 group-hover:text-white/80')}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className={cn('block truncate text-xs', active ? 'text-white/55' : 'text-white/35')}>{item.desc}</span>
                </span>
                <ChevronRight size={15} className={cn('ml-auto shrink-0 transition-all', active ? 'text-secondary opacity-100' : '-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60')} />
              </>
            )
            const style = { animationDelay: `${i * 45}ms`, animationFillMode: 'both' as const }
            return item.href.startsWith('#') ? (
              <a
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                style={style}
                onClick={() => {
                  setActiveSection(item.href.slice(1) as (typeof LANDING_SECTION_IDS)[number])
                  setMenuOpen(false)
                }}
                className={className}
              >
                {content}
              </a>
            ) : (
              <Link key={item.href} to={item.href} aria-current={active ? 'page' : undefined} style={style} onClick={() => setMenuOpen(false)} className={className}>
                {content}
              </Link>
            )
          })}
        </div>

        <div className="relative border-t border-white/10 px-4 pb-8 pt-4">
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Theme</span>
            <ThemeToggle className="rounded-full text-white hover:bg-white/10" />
          </div>
          {showDashboard ? (
            <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-secondary hover:bg-amber-400 py-3 text-sm font-bold text-[#0f1f33] transition-opacity hover:opacity-90">
              Go to Dashboard <ArrowRight size={15} />
            </Link>
          ) : (
            <div className="space-y-2">
              <Link to="/register" onClick={() => setMenuOpen(false)} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-secondary hover:bg-amber-400 py-3 text-sm font-bold text-[#0f1f33] transition-opacity hover:opacity-90">
                Get Started Free <ArrowRight size={15} />
              </Link>
              <Link to="/login" onClick={() => setMenuOpen(false)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] py-3 text-sm font-bold text-white transition-colors hover:bg-white/10">
                Sign In
              </Link>
            </div>
          )}
        </div>
      </aside>

      <header className="relative min-h-[92vh] overflow-hidden bg-[#0a0d12] pt-16 text-white">
        <Parallax speed={0.12} className="absolute right-[-4rem] top-1/2 hidden -translate-y-1/2 opacity-60 lg:block">
          <LogoWatermark tone="brand" className="size-[30rem] rotate-[-8deg]" />
        </Parallax>
        <div className="relative mx-auto flex min-h-[calc(92vh-4rem)] max-w-7xl flex-col justify-center px-6 py-20">
          <div className="max-w-4xl">
            <h1 className="font-display text-5xl font-extrabold leading-[0.98] tracking-normal md:text-7xl lg:text-8xl">
              <SplitText text="RentOS" immediate charDelay={70} />{' '}
              <span className="text-secondary"><SplitText text="Ghana" immediate charDelay={70} startDelay={420} /></span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-white/64 md:text-xl">
              One platform for renting in Ghana: verified listings, digital leases, mobile-money rent, tenant passports, savings, financing, payroll, insurance, and maintenance.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Magnetic><Link to="/register"><Button size="lg" className="w-full bg-secondary text-[#0f1f33] hover:bg-amber-400 sm:w-auto">Create account <ArrowRight size={18} /></Button></Link></Magnetic>
              <Link to="/registry"><Button variant="outline" size="lg" className="w-full border-white/20 text-white hover:bg-white/10 sm:w-auto">Search registry <Search size={18} /></Button></Link>
              <a href="#features"><Button variant="ghost" size="lg" className="w-full text-white/80 hover:bg-white/10 hover:text-white sm:w-auto">Explore features</Button></a>
            </div>
          </div>

          <div className="mt-14 grid max-w-5xl gap-4 border-t border-white/10 pt-8 sm:grid-cols-2 lg:grid-cols-4">
            <Metric value="9+" numeric={9} suffix="+" label="Product modules live" />
            <Metric value="9" numeric={9} label="Role workspaces" />
            <Metric value="4" numeric={4} label="Local language flows" />
            <Metric value="1" label="Shared rental record" />
          </div>
        </div>
      </header>

      <section id="features" className="relative mx-auto max-w-7xl px-6 py-24 md:py-28">
        <SectionHeader
          title="More than a listing site"
          description="RentOS is operating as a connected rental system. The public page now points to the same surfaces available inside the app."
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {platformModules.map((item, i) => (
            <Animate key={item.title} animation="fade-up" delay={(i % 3) * 100}>
              <TiltCard maxTilt={5} className="h-full">
                <Link
                  to={item.href}
                  className="group surface-card surface-card-interactive flex h-full min-h-[210px] flex-col justify-between rounded-2xl border p-5"
                >
                  <div>
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0f1f33]/[0.06] text-[#0f1f33] dark:bg-white/[0.08] dark:text-white/85">
                      {item.icon}
                    </span>
                    <h3 className="mt-5 font-display text-lg font-extrabold text-[#0f1f33] dark:text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted dark:text-gray-400">{item.description}</p>
                  </div>
                  <span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-primary dark:text-blue-300">
                    View surface <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </TiltCard>
            </Animate>
          ))}
        </div>
      </section>

      <section id="roles" className="relative overflow-hidden bg-surface py-24 dark:bg-[#0c0e1a] md:py-28">
        <div className="relative mx-auto max-w-7xl px-6">
          <SectionHeader
            title="Every participant gets the right workspace"
            description="The product is organized around tenant, landlord, financier, employer, essential worker, government, and platform-admin workflows."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {roleRoutes.map((role, i) => (
              <Animate key={role.title} animation="fade-up" delay={(i % 3) * 100}>
                <article className="surface-card flex h-full flex-col rounded-2xl border p-5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0f1f33]/[0.06] text-[#0f1f33] dark:bg-white/[0.08] dark:text-white/85">{role.icon}</span>
                  <h3 className="mt-5 font-display text-base font-extrabold text-[#0f1f33] dark:text-white">{role.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted dark:text-gray-400">{role.description}</p>
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {role.checks.map((check) => (
                      <span key={check} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-primary shadow-sm dark:bg-white/[0.06] dark:text-blue-300">{check}</span>
                    ))}
                  </div>
                </article>
              </Animate>
            ))}
          </div>
        </div>
      </section>

      <section id="operations" className="mx-auto max-w-7xl px-6 py-24 md:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <h2 className="font-display text-3xl font-extrabold leading-tight text-[#0f1f33] dark:text-white md:text-5xl">A shared rental record from search to service.</h2>
            <p className="mt-5 text-base leading-relaxed text-muted dark:text-gray-400 md:text-lg">
              The strongest redesign opportunity was presenting RentOS as one workflow, not many isolated features. The app already supports the record, transaction, service, and compliance layers needed for a modern rental platform.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                ['Public trust', 'Registry, laws, passports, and verified records.'],
                ['Money movement', 'Payments, savings, financing, deductions, and insurance.'],
                ['Daily operations', 'Maintenance, bookings, messages, documents, and claims.'],
                ['Governance', 'Analytics, policy simulation, reviews, and admin ledgers.'],
              ].map(([title, description]) => (
                <div key={title} className="rounded-2xl border border-border/70 bg-white p-4 dark:border-[#252a3a] dark:bg-[#161927]">
                  <p className="font-display text-sm font-extrabold text-[#0f1f33] dark:text-white">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted dark:text-gray-500">{description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl bg-[#0f1f33] p-5 text-white shadow-2xl shadow-primary/20">
            <div className="grid gap-3 sm:grid-cols-2">
              {workflow.map((step, index) => (
                <Animate key={step.title} animation="scale-in" delay={index * 100}>
                  <div className="h-full rounded-2xl border border-white/10 bg-white/[0.07] p-5">
                    <div className="mb-5 flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-secondary">{step.icon}</span>
                      <span className="font-mono text-xs font-bold text-white/34">0{index + 1}</span>
                    </div>
                    <h3 className="font-display text-lg font-extrabold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/54">{step.description}</p>
                  </div>
                </Animate>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="rights" className="bg-surface py-24 dark:bg-[#0c0e1a] md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeader
            title="Ask if a rental situation looks abusive"
            description="The home page still exposes the AI rights checker so renters can test a situation against Ghanaian rental-law guidance."
          />
          <div className="surface-card rounded-2xl border p-5 sm:p-6">
            <textarea
              value={abuseQuery}
              onChange={(e) => { setAbuseQuery(e.target.value); setAbuseError('') }}
              placeholder="Example: My landlord is asking for two years of advance rent and says I must leave immediately if I refuse."
              rows={5}
              className="focus-ring min-h-[150px] w-full resize-none rounded-2xl border border-border bg-white px-4 py-4 text-base text-[#0f1f33] placeholder:text-gray-400 dark:border-[#252a3a] dark:bg-[#0c0e1a] dark:text-white dark:placeholder:text-gray-500"
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAbuseCheck() }}
            />
            {abuseError && <p className="mt-2 text-sm font-semibold text-danger">{abuseError}</p>}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted dark:text-gray-500">Press Ctrl+Enter to submit. Your description is only used for this check.</p>
              <Button onClick={handleAbuseCheck} disabled={abuseLoading || !abuseQuery.trim()} variant="secondary">
                {abuseLoading ? <><Loader2 size={16} className="animate-spin" /> Checking</> : <><ShieldAlert size={16} /> Check now</>}
              </Button>
            </div>
          </div>

          <div ref={abuseResultRef}>
            {abuseResult && (
              <div className="mt-8 space-y-5">
                <div className={`rounded-2xl border p-5 ${abuseResult.isViolation ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'}`}>
                  <div className="flex items-start gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${abuseResult.isViolation ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300'}`}>
                      {abuseResult.isViolation ? <XCircle size={20} /> : <CheckCircle2 size={20} />}
                    </span>
                    <div>
                      <h3 className={`font-display text-lg font-extrabold ${abuseResult.isViolation ? 'text-red-800 dark:text-red-200' : 'text-emerald-800 dark:text-emerald-200'}`}>
                        {abuseResult.isViolation ? 'Potential violation detected' : 'No clear violation found'}
                      </h3>
                      <p className={`mt-1 text-sm leading-relaxed ${abuseResult.isViolation ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                        {abuseResult.isViolation
                          ? `The description may involve ${abuseResult.violations.length} rental-law issue${abuseResult.violations.length === 1 ? '' : 's'}.`
                          : 'This does not replace official legal advice, but no clear violation was found from the description provided.'}
                      </p>
                    </div>
                  </div>
                </div>

                {abuseResult.violations.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {abuseResult.violations.map((violation, index) => (
                      <div key={`${violation.law}-${index}`} className="surface-card rounded-2xl border p-5">
                        <p className="text-sm font-extrabold text-danger">{violation.violation}</p>
                        <p className="mt-1 text-xs font-semibold text-muted dark:text-gray-500">{violation.law}</p>
                        <p className="mt-3 text-sm leading-relaxed text-[#0f1f33] dark:text-gray-200">{violation.explanation}</p>
                        <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted dark:border-[#252a3a] dark:text-gray-500">
                          Maximum penalty: {violation.maxPenalty}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="surface-card rounded-2xl border p-5">
                    <h4 className="flex items-center gap-2 font-display text-base font-extrabold text-[#0f1f33] dark:text-white"><FileText size={18} /> What to do next</h4>
                    <ol className="mt-4 space-y-3">
                      {abuseResult.nextSteps.map((step, index) => (
                        <li key={step} className="flex gap-3 text-sm leading-relaxed text-muted dark:text-gray-400">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary dark:bg-blue-500/15 dark:text-blue-300">{index + 1}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="surface-card rounded-2xl border p-5">
                    <h4 className="flex items-center gap-2 font-display text-base font-extrabold text-[#0f1f33] dark:text-white"><Phone size={18} /> Get help</h4>
                    <div className="mt-4 space-y-4 text-sm">
                      <a href={`tel:${abuseResult.contacts.rentControl.phone}`} className="flex items-center gap-2 font-semibold text-primary dark:text-blue-300"><Phone size={14} /> {abuseResult.contacts.rentControl.name}: {abuseResult.contacts.rentControl.phone}</a>
                      <p className="flex items-start gap-2 text-muted dark:text-gray-400"><MapPin size={14} className="mt-0.5 shrink-0" /> {abuseResult.contacts.rentControl.location}</p>
                      <a href={`tel:${abuseResult.contacts.chraj.phone}`} className="flex items-center gap-2 font-semibold text-primary dark:text-blue-300"><Phone size={14} /> CHRAJ: {abuseResult.contacts.chraj.phone}</a>
                    </div>
                    <Link to="/register" className="mt-5 inline-flex">
                      <Button size="sm">Use RentOS to report <ArrowRight size={14} /></Button>
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24 md:py-28">
        <div className="rounded-3xl bg-[#0f1f33] p-6 text-white md:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <h2 className="font-display text-3xl font-extrabold leading-tight md:text-5xl">Compliance, finance, and service records in one admin view.</h2>
              <p className="mt-5 text-base leading-relaxed text-white/60">
                Platform admins now have dedicated pages for financing operations, employer networks, maintenance command, and policy portfolios, plus packages, claims, feature flags, users, government reviews, and analytics.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { title: 'Financing Operations', value: 'Contracts, arrears, signatures', icon: <Banknote size={18} /> },
                { title: 'Employer Network', value: 'Verification and mandates', icon: <BriefcaseBusiness size={18} /> },
                { title: 'Maintenance Command', value: 'Urgency and vendor schedule', icon: <Hammer size={18} /> },
                { title: 'Policy Portfolio', value: 'Premiums, claims, coverage', icon: <ShieldPlus size={18} /> },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-secondary">{item.icon}</span>
                  <p className="mt-4 font-display text-base font-extrabold">{item.title}</p>
                  <p className="mt-1 text-sm text-white/50">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {posts.length > 0 && (
        <section className="bg-surface py-24 dark:bg-[#0c0e1a] md:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="mt-5 font-display text-3xl font-extrabold text-[#0f1f33] dark:text-white md:text-5xl">Rental insights and product updates</h2>
              </div>
              <Link to="/blog"><Button variant="outline">View all articles <ArrowRight size={14} /></Button></Link>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {posts.slice(0, 3).map((post) => (
                <Link key={post.id ?? post.slug ?? post.title} to={`/article${post.slug ? `/${post.slug}` : ''}`} className="surface-card surface-card-interactive min-h-[240px] rounded-2xl border p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-300"><BookOpen size={20} /></div>
                  <h3 className="mt-5 line-clamp-2 font-display text-lg font-extrabold text-[#0f1f33] dark:text-white">{post.title}</h3>
                  {post.excerpt && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted dark:text-gray-400">{post.excerpt}</p>}
                  <span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-primary dark:text-blue-300">Read article <ArrowRight size={13} /></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="relative overflow-hidden px-6 py-24 md:py-28">
        <LogoWatermark className="animate-parallax-drift -bottom-10 -right-8 hidden size-64 md:block" />
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-display text-3xl font-extrabold leading-tight text-[#0f1f33] dark:text-white md:text-5xl">Bring the whole rental workflow into RentOS.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted dark:text-gray-400">
            Start with a listing, a tenant passport, a payment record, or a policy review. The platform is built to connect the rest.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/register"><Button size="lg">Create account <ArrowRight size={18} /></Button></Link>
            <Link to="/rental-laws"><Button variant="outline" size="lg">Read rental laws <Scale size={18} /></Button></Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
