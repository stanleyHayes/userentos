import { Link } from 'react-router-dom'
import { Button } from './Button'
import {
  Building2, CreditCard, PiggyBank, FileText, AlertTriangle,
  Bell, Search, Inbox, ArrowRight, KeyRound, Sparkles, Coins,
  CheckCircle2, Handshake, Moon, ScanSearch, CircleDashed,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { LogoWatermark } from './Watermark'

type Preset = 'properties' | 'payments' | 'savings' | 'agreements' | 'disputes' | 'notifications' | 'search' | 'general'

interface EmptyStateProps {
  preset?: Preset
  title?: string
  description?: string
  action?: { label: string; href?: string; onClick?: () => void }
  secondaryAction?: { label: string; href?: string; onClick?: () => void }
  icon?: ReactNode
  /** Compact layout for embedding inside cards, dropdowns, and chart panels. */
  compact?: boolean
}

const PRESETS: Record<Preset, { icon: ReactNode; color: string; particles: ReactNode[]; defaultTitle: string; defaultDesc: string }> = {
  properties: { icon: <Building2 size={40} />, color: 'primary', particles: [<Building2 size={13} />, <KeyRound size={13} />, <Sparkles size={13} />], defaultTitle: 'No properties found', defaultDesc: 'Try adjusting your search filters or browse all available listings.' },
  payments: { icon: <CreditCard size={40} />, color: 'secondary', particles: [<CreditCard size={13} />, <CheckCircle2 size={13} />, <Coins size={13} />], defaultTitle: 'No payments yet', defaultDesc: 'Your payment history will appear here once you make your first rent payment.' },
  savings: { icon: <PiggyBank size={40} />, color: 'accent', particles: [<PiggyBank size={13} />, <Coins size={13} />, <Sparkles size={13} />], defaultTitle: 'Start saving today', defaultDesc: 'Create a savings plan to gradually save towards your next rent payment.' },
  agreements: { icon: <FileText size={40} />, color: 'primary', particles: [<FileText size={13} />, <CheckCircle2 size={13} />, <Sparkles size={13} />], defaultTitle: 'No agreements yet', defaultDesc: 'Your rental agreements will show up here once you enter into one.' },
  disputes: { icon: <AlertTriangle size={40} />, color: 'secondary', particles: [<AlertTriangle size={13} />, <Handshake size={13} />, <Sparkles size={13} />], defaultTitle: 'No disputes', defaultDesc: "That's a good thing! No active disputes means everything is going smoothly." },
  notifications: { icon: <Bell size={40} />, color: 'primary', particles: [<Bell size={13} />, <Moon size={13} />, <Sparkles size={13} />], defaultTitle: "You're all caught up", defaultDesc: 'No new notifications. We\'ll let you know when something needs your attention.' },
  search: { icon: <Search size={40} />, color: 'primary', particles: [<Search size={13} />, <ScanSearch size={13} />, <Sparkles size={13} />], defaultTitle: 'No results found', defaultDesc: 'We couldn\'t find anything matching your search. Try different keywords.' },
  general: { icon: <Inbox size={40} />, color: 'primary', particles: [<Inbox size={13} />, <CircleDashed size={13} />, <Sparkles size={13} />], defaultTitle: 'Nothing here yet', defaultDesc: 'Check back soon for updates.' },
}

const COLOR_MAP: Record<string, { bg: string; ring: string; icon: string; particle: string; bar: string }> = {
  primary: { bg: 'bg-primary/10 dark:bg-primary/20', ring: 'border-primary/30', icon: 'text-primary dark:text-blue-300', particle: 'bg-primary/10 text-primary dark:bg-blue-400/15 dark:text-blue-300', bar: 'from-primary to-primary-light' },
  secondary: { bg: 'bg-secondary/10 dark:bg-secondary/20', ring: 'border-secondary/30', icon: 'text-secondary', particle: 'bg-secondary/10 text-secondary dark:bg-secondary/15', bar: 'from-secondary to-amber-400' },
  accent: { bg: 'bg-accent/10 dark:bg-accent/20', ring: 'border-accent/30', icon: 'text-accent', particle: 'bg-accent/10 text-accent dark:bg-accent/15', bar: 'from-accent to-emerald-400' },
}

export function EmptyState({ preset = 'general', title, description, action, secondaryAction, icon: customIcon, compact = false }: EmptyStateProps) {
  const config = PRESETS[preset]
  const colors = COLOR_MAP[config.color] || COLOR_MAP.primary
  const displayTitle = title ?? config.defaultTitle
  const displayDesc = description ?? config.defaultDesc
  const displayIcon = customIcon ?? config.icon

  if (compact) {
    return (
      <div className="relative flex flex-col items-center text-center py-8 px-4">
        {/* Animated icon with pulse ring */}
        <div className="relative w-16 h-16 mb-4 animate-fade-up">
          <div className={`absolute -inset-1.5 rounded-full border-2 ${colors.ring} animate-pulse-soft`} />
          <div className={`w-16 h-16 rounded-full ${colors.bg} flex items-center justify-center animate-float relative [&>div>svg]:w-7 [&>div>svg]:h-7`}>
            <div className={colors.icon}>{displayIcon}</div>
          </div>
        </div>

        <div className="max-w-xs animate-fade-up" style={{ animationDelay: '0.15s' }}>
          <h3 className="text-sm font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
            {displayTitle}
          </h3>
          <p className="text-xs text-muted dark:text-gray-400 mt-1 leading-relaxed">
            {displayDesc}
          </p>
        </div>

        {(action || secondaryAction) && (
          <div className="flex items-center gap-2 mt-4 animate-fade-up" style={{ animationDelay: '0.3s' }}>
            {action && (
              action.href ? (
                <Link to={action.href}>
                  <Button size="sm" className="gap-1.5">{action.label} <ArrowRight size={13} /></Button>
                </Link>
              ) : (
                <Button size="sm" onClick={action.onClick} className="gap-1.5">{action.label} <ArrowRight size={13} /></Button>
              )
            )}
            {secondaryAction && (
              secondaryAction.href ? (
                <Link to={secondaryAction.href}><Button size="sm" variant="outline">{secondaryAction.label}</Button></Link>
              ) : (
                <Button size="sm" variant="outline" onClick={secondaryAction.onClick}>{secondaryAction.label}</Button>
              )
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="surface-card rounded-2xl border border-dashed overflow-hidden relative">
      {/* Accent gradient bar */}
      <div className={`h-1 bg-gradient-to-r ${colors.bar}`} />

      <div className="absolute inset-0 opacity-[0.35] pointer-events-none" style={{ backgroundImage: 'linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(180deg, rgba(148,163,184,0.12) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      <LogoWatermark tone="surface" className="left-1/2 top-6 size-[120px] -translate-x-1/2 opacity-50" />

      <div className="relative py-12 md:py-16 px-6">
        <div className="flex flex-col items-center text-center">
          {/* Animated icon with pulse ring and particles */}
          <div className="relative w-28 h-28 mb-6 animate-fade-up">
            {/* Pulse ring */}
            <div className={`absolute -inset-2 rounded-full border-2 ${colors.ring} animate-pulse-soft`} />

            {/* Main icon circle */}
            <div className={`w-28 h-28 rounded-full ${colors.bg} flex items-center justify-center animate-float relative`}>
              <div className={colors.icon}>
                {displayIcon}
              </div>
            </div>

            {/* Floating particles */}
            {config.particles.map((emoji, i) => (
              <span
                key={i}
                className={`absolute inline-flex h-8 w-8 items-center justify-center rounded-xl border border-current/10 ${colors.particle} animate-float shadow-sm`}
                style={{
                  animationDuration: `${2.5 + i * 0.5}s`,
                  animationDelay: `${i * 0.3}s`,
                  ...[
                    { top: -4, right: 4 },
                    { bottom: 4, left: -8 },
                    { top: '40%', right: -16 },
                  ][i],
                }}
              >
                {emoji}
              </span>
            ))}
          </div>

          {/* Text */}
          <div className="max-w-sm animate-fade-up" style={{ animationDelay: '0.15s' }}>
            <h3 className="text-xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
              {displayTitle}
            </h3>
            <p className="text-sm text-muted dark:text-gray-400 mt-2 leading-relaxed">
              {displayDesc}
            </p>
          </div>

          {/* Actions */}
          {(action || secondaryAction) && (
            <div className="flex items-center gap-3 mt-6 animate-fade-up" style={{ animationDelay: '0.3s' }}>
              {action && (
                action.href ? (
                  <Link to={action.href}>
                    <Button className="gap-1.5">{action.label} <ArrowRight size={14} /></Button>
                  </Link>
                ) : (
                  <Button onClick={action.onClick} className="gap-1.5">{action.label} <ArrowRight size={14} /></Button>
                )
              )}
              {secondaryAction && (
                secondaryAction.href ? (
                  <Link to={secondaryAction.href}><Button variant="outline">{secondaryAction.label}</Button></Link>
                ) : (
                  <Button variant="outline" onClick={secondaryAction.onClick}>{secondaryAction.label}</Button>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
