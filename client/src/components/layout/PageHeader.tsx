import type { ReactNode } from 'react'
import { LayoutDashboard, type LucideIcon } from 'lucide-react'
import { IconWatermark } from '@/components/ui/Watermark'

/**
 * Standard page header (Aura pattern): a large tinted icon chip, title,
 * one-line description, right-aligned actions — with a decorative rotated
 * watermark of the same icon behind the right half on desktop.
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  const HeaderIcon = Icon ?? LayoutDashboard

  return (
    <div className="relative mb-7 flex flex-col gap-5 border-b border-border/40 pb-6 dark:border-[#252a3a]/40 lg:flex-row lg:items-center lg:justify-between">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 overflow-hidden lg:block"
      >
        <IconWatermark
          icon={HeaderIcon}
          className="-right-8 top-1/2 size-52 -translate-y-1/2 rotate-[-8deg]"
        />
      </span>
      <div className="relative z-10 flex min-w-0 items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-400 sm:size-16"
        >
          <HeaderIcon className="size-7" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-primary-dark dark:text-white sm:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted dark:text-gray-400">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="relative z-10 flex w-full shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
