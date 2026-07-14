import { isValidElement, type ReactNode } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconWatermark } from '@/components/ui/Watermark'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'

interface AdminPageHeaderProps {
  eyebrow: string
  title: string
  description: string
  icon: ReactNode
  accent: string
  meta?: string
  children?: ReactNode
}

export function AdminPageHeader({ eyebrow, title, description, icon, accent, meta, children }: AdminPageHeaderProps) {
  const watermarkIcon = isValidElement(icon) ? (icon.type as LucideIcon) : null

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f1f33] p-4 text-white shadow-[0_18px_56px_rgba(15,31,51,0.16)] sm:p-6">
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
      {watermarkIcon && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 overflow-hidden lg:block">
          <IconWatermark icon={watermarkIcon} tone="brand" className="-right-8 top-1/2 size-52 -translate-y-1/2 rotate-[-8deg]" />
        </span>
      )}
      <div className="absolute inset-x-8 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-lg"
              style={{ color: accent }}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">{eyebrow}</p>
              {meta && <p className="mt-0.5 truncate text-xs font-semibold text-white/70">{meta}</p>}
            </div>
          </div>
          <h1 className="break-words font-display text-2xl font-extrabold leading-tight text-white sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/62">{description}</p>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{children}</div>}
      </div>
    </section>
  )
}

interface AdminStatGridProps {
  children: ReactNode
}

export function AdminStatGrid({ children }: AdminStatGridProps) {
  return <div className="stagger-3d grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
}

interface AdminStatCardProps {
  label: string
  value: string
  description: string
  icon: ReactNode
  accent: string
}

export function AdminStatCard({ label, value, description, icon, accent }: AdminStatCardProps) {
  return <DashboardMetricCard label={label} value={value} sub={description} icon={icon} accent={accent} />
}

interface AdminToolbarProps {
  title: string
  description?: string
  resultLabel?: string
  children?: ReactNode
}

export function AdminToolbar({ title, description, resultLabel, children }: AdminToolbarProps) {
  return (
    <section className="surface-card rounded-2xl border p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-extrabold text-primary-dark dark:text-white">{title}</h2>
            {resultLabel && (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary dark:bg-blue-500/15 dark:text-blue-300">
                {resultLabel}
              </span>
            )}
          </div>
          {description && <p className="mt-1 text-xs leading-relaxed text-muted dark:text-gray-500">{description}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </section>
  )
}

interface AdminTableCardProps {
  title: string
  description: string
  children: ReactNode
}

export function AdminTableCard({ title, description, children }: AdminTableCardProps) {
  return (
    <section className="surface-card overflow-hidden rounded-2xl border">
      <div className="border-b border-border/50 px-4 py-4 dark:border-[#252a3a]/70 sm:px-5">
        <h2 className="text-sm font-extrabold text-primary-dark dark:text-white">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted dark:text-gray-500">{description}</p>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  )
}

interface AdminStateCardProps {
  title: string
  description: string
  icon?: ReactNode
}

export function AdminLoadingState({ title, description }: AdminStateCardProps) {
  return (
    <section className="surface-card rounded-2xl border p-10 text-center">
      <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary dark:text-blue-400" />
      <p className="text-sm font-bold text-primary-dark dark:text-white">{title}</p>
      <p className="mt-1 text-xs text-muted dark:text-gray-500">{description}</p>
    </section>
  )
}

export function AdminEmptyState({ title, description, icon }: AdminStateCardProps) {
  return (
    <section className="surface-card rounded-2xl border">
      <EmptyState preset="general" title={title} description={description} icon={icon} compact />
    </section>
  )
}

interface AdminPaginationProps {
  page: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}

export function AdminPagination({ page, totalPages, onPrevious, onNext }: AdminPaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-white/70 p-3 dark:border-[#252a3a]/80 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-end">
      <span className="text-center text-xs font-semibold text-muted dark:text-gray-500 sm:text-left">
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center justify-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={onPrevious}>Previous</Button>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={onNext}>Next</Button>
      </div>
    </div>
  )
}
