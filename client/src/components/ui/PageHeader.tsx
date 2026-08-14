import { isValidElement, type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'
import { IconWatermark } from '@/components/ui/Watermark'

/** Default hairline accent — the end of the brand gradient. */
const DEFAULT_ACCENT = '#2d5a8e'

interface PageHeaderProps {
  title: string
  description?: string
  /** Small uppercase label above the title (e.g. "Platform admin"). */
  eyebrow?: string
  /** Secondary line under the eyebrow — counts, pagination, status. */
  meta?: string
  icon?: ReactNode
  /** Hairline and icon tint. Defaults to the brand blue. */
  accent?: string
  /** Actions, aligned to the end on wide screens. */
  children?: ReactNode
}

/**
 * The one page header for the whole dashboard: a dark card with the title, a
 * short description, and optional actions.
 *
 * Two things it deliberately does NOT do:
 *
 *  - No grid-line overlay. It read as texture on a mockup and as noise behind
 *    real copy.
 *  - No `.neumorphic-icon` on the badge. That utility is built for light
 *    surfaces — its light-mode shadow includes a near-white glow, which on this
 *    always-dark card rendered as a halo blob around the icon. The badge uses a
 *    translucent tile with an inset ring instead, which is correct on a dark
 *    surface in either theme.
 */
export function PageHeader({
  title, description, eyebrow, meta, icon, accent = DEFAULT_ACCENT, children,
}: PageHeaderProps) {
  const watermarkIcon = isValidElement(icon) ? (icon.type as LucideIcon) : null

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f1f33] p-4 text-white shadow-[0_18px_56px_rgba(15,31,51,0.16)] sm:p-6">
      {watermarkIcon && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 overflow-hidden lg:block">
          <IconWatermark icon={watermarkIcon} tone="brand" className="-right-8 top-1/2 size-52 -translate-y-1/2 rotate-[-8deg]" />
        </span>
      )}

      <div className="absolute inset-x-8 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {(icon || eyebrow || meta) && (
            <div className="mb-3 flex items-center gap-3">
              {icon && (
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] ring-1 ring-inset ring-white/15 shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
                  style={{ color: accent }}
                >
                  {icon}
                </span>
              )}
              {(eyebrow || meta) && (
                <div className="min-w-0">
                  {eyebrow && <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">{eyebrow}</p>}
                  {meta && <p className="mt-0.5 truncate text-xs font-semibold text-white/70">{meta}</p>}
                </div>
              )}
            </div>
          )}

          <h1 className="break-words font-display text-2xl font-extrabold leading-tight text-white sm:text-3xl">{title}</h1>
          {description && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/60">{description}</p>}
        </div>

        {children && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{children}</div>}
      </div>
    </section>
  )
}
