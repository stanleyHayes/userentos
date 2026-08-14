import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Decorative SVG watermarks (adapted from the Aura pattern): oversized,
 * very faint marks positioned behind content. They are purely decorative —
 * `aria-hidden`, `pointer-events-none`, and drawn in `currentColor` so a
 * single tone class controls the faint tint in light/dark contexts.
 */

const toneClass = {
  /** For light/surface sections — faint navy, slightly brighter in dark mode. */
  surface:
    'text-[color-mix(in_oklab,#1e3a5f_7%,transparent)] dark:text-[color-mix(in_oklab,#7dd3fc_8%,transparent)]',
  /** For dark/brand sections — faint white. */
  brand: 'text-[color-mix(in_oklab,#ffffff_10%,transparent)]',
} as const

type WatermarkTone = keyof typeof toneClass

export function IconWatermark({
  icon: Icon,
  tone = 'surface',
  className,
}: {
  icon: LucideIcon
  tone?: WatermarkTone
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('pointer-events-none absolute select-none', toneClass[tone], className)}
    >
      <Icon className="size-full stroke-[1.15]" />
    </span>
  )
}

/**
 * Monochrome line version of the RentOS mark (roof + building + Ghana star),
 * drawn in currentColor so it can fade into any background.
 */
export function LogoMark({ className, draw = false }: { className?: string; draw?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      role="presentation"
      aria-hidden="true"
      className={cn(className, draw && 'logo-draw')}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Roof chevron */}
      <path
        d="M6 31 32 7l26 24"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Building body */}
      <rect x="13" y="31" width="38" height="24" rx="2" stroke="currentColor" strokeWidth="2.4" />
      {/* Door */}
      <rect x="27" y="39" width="10" height="16" rx="1.5" stroke="currentColor" strokeWidth="2" />
      {/* Windows */}
      <rect x="18" y="35" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="41" y="35" width="5" height="5" rx="1" fill="currentColor" />
      {/* Chimney */}
      <path d="M42 31V14h6v17" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      {/* Ghana star */}
      <path
        d="M32 17l1.4 3.6 3.8.1-3 2.3 1 3.6L32 24.5l-3.2 2.1 1-3.6-3-2.3 3.8-.1z"
        fill="currentColor"
      />
      {/* Foundation */}
      <rect x="11" y="57" width="42" height="2.4" rx="1.2" fill="currentColor" />
    </svg>
  )
}

export function LogoWatermark({
  tone = 'surface',
  className,
  draw = false,
}: {
  tone?: WatermarkTone
  className?: string
  /** Animate the mark drawing itself on mount (ilivvon-style path drawing). */
  draw?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('pointer-events-none absolute select-none', toneClass[tone], className)}
    >
      <LogoMark className="size-full" draw={draw} />
    </span>
  )
}

const constellationSlots = [
  'left-4 top-5 size-20 rotate-[-10deg]',
  'right-10 top-8 size-24 rotate-6',
  'bottom-7 left-[18%] size-16 rotate-12',
  'bottom-4 right-[24%] size-20 rotate-[-8deg]',
  'left-[46%] top-1/2 size-14 rotate-[14deg]',
]

export function WatermarkConstellation({
  icons,
  tone = 'surface',
  includeLogo = true,
  className,
}: {
  icons: LucideIcon[]
  tone?: WatermarkTone
  includeLogo?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 select-none overflow-hidden', className)}
    >
      {includeLogo ? (
        <LogoWatermark tone={tone} className="bottom-[-4rem] right-[-2rem] size-48 rotate-[-8deg]" />
      ) : null}
      {icons.slice(0, constellationSlots.length).map((Icon, index) => (
        <IconWatermark
          key={`${Icon.displayName ?? Icon.name}-${index}`}
          icon={Icon}
          tone={tone}
          className={constellationSlots[index]}
        />
      ))}
    </span>
  )
}
