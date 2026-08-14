import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  BookOpen,
  Building2,
  FileText,
  Globe2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Scale,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Wand2,
} from 'lucide-react'
import { Logo } from '@/components/ui/Logo'

interface FooterLink {
  label: string
  to: string
  icon: LucideIcon
}

interface FooterGroup {
  title: string
  accent: string
  links: FooterLink[]
}

const footerGroups: FooterGroup[] = [
  {
    title: 'Platform',
    accent: 'text-sky-300',
    links: [
      { label: 'Features', to: '/#features', icon: Sparkles },
      { label: 'Role workspaces', to: '/#roles', icon: Building2 },
      { label: 'Operating model', to: '/#operations', icon: ShieldCheck },
      { label: 'Rights checker', to: '/#rights', icon: Scale },
      { label: 'Property registry', to: '/registry', icon: Search },
    ],
  },
  {
    title: 'Workspaces',
    accent: 'text-emerald-300',
    links: [
      { label: 'Create account', to: '/register', icon: UserPlus },
      { label: 'AI writing assistant', to: '/ai-writer', icon: Wand2 },
      { label: 'Rental laws', to: '/rental-laws', icon: Scale },
      { label: 'Blog', to: '/blog', icon: BookOpen },
    ],
  },
  {
    title: 'Trust',
    accent: 'text-amber-300',
    links: [
      { label: 'Privacy', to: '/privacy', icon: Shield },
      { label: 'Terms', to: '/terms', icon: FileText },
      { label: 'Data protection', to: '/data-protection', icon: Lock },
    ],
  },
]

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#070b14] text-white">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/80 to-transparent" />
      <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(rgba(125,211,252,0.75) 1px, transparent 1px), linear-gradient(90deg, rgba(134,239,172,0.5) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
      <div className="absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_50%_0%,rgba(56,189,248,0.20),transparent_62%)]" />

      <div className="relative mx-auto max-w-7xl px-6 py-12 md:py-16">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_26px_80px_rgba(0,0,0,0.35)] backdrop-blur md:p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-sky-200">
                <Globe2 size={14} />
                Ghana rental infrastructure
              </span>
              <h2 className="mt-4 max-w-2xl font-display text-2xl font-extrabold leading-tight md:text-4xl">
                One record for discovery, rent, service, claims, and compliance.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/54 md:text-base">
                RentOS gives tenants, landlords, employers, essential workers, financiers, and administrators a shared operating layer for the rental journey.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-300 to-orange-300 px-5 py-3 text-sm font-extrabold text-[#111827] shadow-[0_14px_34px_rgba(251,191,36,0.20)] transition-transform hover:-translate-y-0.5"
              >
                Create account <ArrowRight size={16} />
              </Link>
              <Link
                to="/registry"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-5 py-3 text-sm font-bold text-white/78 transition-colors hover:bg-white/[0.1] hover:text-white"
              >
                Search registry <Search size={16} />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-10 py-12 lg:grid-cols-[1.05fr_1.55fr_0.8fr]">
          <div>
            <Logo size={30} theme="light" />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/48">
              Rental housing software for Ghana, connecting public discovery, tenant passports, payments, savings, financing, insurance, maintenance, worker bookings, AI writing, and platform administration.
            </p>
            <div className="mt-6 grid max-w-sm grid-cols-2 gap-3">
              {[
                ['9', 'Role workspaces'],
                ['4', 'Local language flows'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                  <p className="font-display text-2xl font-extrabold text-white">{value}</p>
                  <p className="mt-1 text-xs font-semibold text-white/40">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {footerGroups.map((group) => (
              <div key={group.title}>
                <h3 className={`text-xs font-extrabold uppercase tracking-wide ${group.accent}`}>{group.title}</h3>
                <ul className="mt-5 space-y-3">
                  {group.links.map(({ label, to, icon: Icon }) => (
                    <li key={label}>
                      <Link
                        to={to}
                        className="group inline-flex items-center gap-2 text-sm font-semibold text-white/45 transition-colors hover:text-white"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/44 transition-colors group-hover:border-white/20 group-hover:text-white">
                          <Icon size={14} />
                        </span>
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
            <h3 className="font-display text-lg font-extrabold">Support desk</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/45">For account help, product questions, and platform operations.</p>
            <div className="mt-5 space-y-4 text-sm">
              <a href="mailto:support@rentos.gh" className="flex items-center gap-3 text-white/58 transition-colors hover:text-white">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-400/10 text-sky-200"><Mail size={15} /></span>
                support@rentos.gh
              </a>
              <a href="tel:+233300000000" className="flex items-center gap-3 text-white/58 transition-colors hover:text-white">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-200"><Phone size={15} /></span>
                +233 30 000 0000
              </a>
              <p className="flex items-center gap-3 text-white/58">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-300/10 text-amber-200"><MapPin size={15} /></span>
                Accra, Ghana
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-white/10 pt-6 text-xs font-semibold text-white/30 md:flex-row md:items-center md:justify-between">
          <span>&copy; {new Date().getFullYear()} RentOS Ghana. All rights reserved.</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/privacy" className="transition-colors hover:text-white/70">Privacy</Link>
            <Link to="/terms" className="transition-colors hover:text-white/70">Terms</Link>
            <Link to="/data-protection" className="transition-colors hover:text-white/70">Data protection</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
