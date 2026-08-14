import { type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'

/**
 * Kept as a named re-export so the many existing admin call sites do not have to
 * change: the header itself now lives in ui/PageHeader and is shared with the
 * rest of the dashboard.
 */
export { PageHeader as AdminPageHeader } from '@/components/ui/PageHeader'

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
