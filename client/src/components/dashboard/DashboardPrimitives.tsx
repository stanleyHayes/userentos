import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

const heroTones = {
  tenant: { accent: '#10b981', label: 'text-emerald-200' },
  landlord: { accent: '#f59e0b', label: 'text-amber-200' },
  government: { accent: '#60a5fa', label: 'text-blue-200' },
  financier: { accent: '#22c55e', label: 'text-emerald-200' },
  employer: { accent: '#93c5fd', label: 'text-blue-200' },
} as const

type HeroTone = keyof typeof heroTones

interface DashboardHeroProps {
  eyebrow?: string
  title: ReactNode
  description: ReactNode
  actions?: ReactNode
  children?: ReactNode
  tone?: HeroTone
}

export function DashboardHero({ eyebrow, title, description, actions, children, tone = 'tenant' }: DashboardHeroProps) {
  const config = heroTones[tone]

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f1f33] p-4 text-white shadow-[0_18px_56px_rgba(15,31,51,0.18)] sm:p-6">
      <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="absolute inset-x-8 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${config.accent}, transparent)` }} />
      <div className="absolute inset-x-10 bottom-0 h-px opacity-70" style={{ background: `linear-gradient(90deg, transparent, ${config.accent}, transparent)` }} />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className={cn('mb-1 text-[10px] font-bold uppercase tracking-widest', config.label)}>
              {eyebrow}
            </p>
          )}
          <h1 className="break-words font-display text-xl font-extrabold leading-tight text-white sm:text-2xl">{title}</h1>
          <p className="mt-1 text-xs leading-relaxed text-white/58 sm:text-sm">{description}</p>
          {children}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">{actions}</div>}
      </div>
    </section>
  )
}

interface DashboardMetricCardProps {
  label: string
  value: string
  sub: string
  icon: ReactNode
  accent: string
  href?: string
  trend?: number
}

export function DashboardMetricCard({ label, value, sub, icon, accent, href, trend }: DashboardMetricCardProps) {
  const metric = (
    <div
      className="surface-card surface-card-interactive group h-full overflow-hidden rounded-2xl border p-3 sm:p-4"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: accent,
        background: `linear-gradient(135deg, ${accent}12, var(--rentos-card) 58%)`,
      }}
    >
      <div className="mb-2 flex items-start justify-between sm:mb-3">
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 sm:h-10 sm:w-10"
          style={{ backgroundColor: `${accent}18`, color: accent }}
        >
          {icon}
        </div>
        {trend !== undefined && trend !== 0 ? (
          <div className={cn('flex items-center gap-0.5 text-[10px] font-bold', trend > 0 ? 'text-accent' : 'text-danger')}>
            {trend > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {trend > 0 ? '+' : ''}{trend}%
          </div>
        ) : (
          <ArrowUpRight size={14} className="flex-shrink-0 text-muted/40 transition-colors group-hover:text-primary dark:text-gray-600 dark:group-hover:text-blue-400" />
        )}
      </div>
      <p className="truncate font-display text-sm font-extrabold text-primary-dark dark:text-white sm:text-xl">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted dark:text-gray-500 sm:text-[11px]">{label}</p>
      <p className="mt-1 truncate text-[10px] font-semibold" style={{ color: accent }}>{sub}</p>
    </div>
  )

  if (!href) return metric
  return <Link to={href} className="block h-full">{metric}</Link>
}

interface DashboardActionPanelProps {
  title: string
  description?: string
  children: ReactNode
  action?: {
    label: string
    href: string
  }
}

export function DashboardActionPanel({ title, description, children, action }: DashboardActionPanelProps) {
  return (
    <section className="surface-card rounded-2xl border p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold text-primary-dark dark:text-white">{title}</h2>
          {description && <p className="mt-1 text-xs leading-relaxed text-muted dark:text-gray-500">{description}</p>}
        </div>
        {action && (
          <Link to={action.href} className="hidden shrink-0 items-center gap-1 text-xs font-bold text-primary hover:underline dark:text-blue-400 sm:flex">
            {action.label}
            <ChevronRight size={12} />
          </Link>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  )
}

interface DashboardActionItemProps {
  title: string
  description: string
  icon: ReactNode
  href: string
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'accent'
  meta?: string
}

const actionToneClasses = {
  default: 'border-primary/15 bg-primary/5 text-primary dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400',
  success: 'border-emerald-500/20 bg-emerald-500/8 text-emerald-600 dark:bg-emerald-500/12 dark:text-emerald-400',
  warning: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:bg-amber-500/12 dark:text-amber-400',
  danger: 'border-red-500/20 bg-red-500/8 text-red-600 dark:bg-red-500/12 dark:text-red-400',
  accent: 'border-violet-500/20 bg-violet-500/8 text-violet-600 dark:bg-violet-500/12 dark:text-violet-400',
} as const

export function DashboardActionItem({ title, description, icon, href, tone = 'default', meta }: DashboardActionItemProps) {
  return (
    <Link
      to={href}
      className={cn(
        'group flex min-h-[96px] flex-col justify-between rounded-2xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-black/20',
        actionToneClasses[tone],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 shadow-sm dark:bg-white/10">
          {icon}
        </div>
        <ArrowUpRight size={14} className="opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-80" />
      </div>
      <div className="mt-3 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-extrabold text-primary-dark dark:text-white">{title}</p>
          {meta && <span className="shrink-0 rounded-full bg-white/60 px-1.5 py-0.5 text-[9px] font-bold dark:bg-white/10">{meta}</span>}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted dark:text-gray-400">{description}</p>
      </div>
    </Link>
  )
}
