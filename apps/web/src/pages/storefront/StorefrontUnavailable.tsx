import { useId, useState } from 'react'
import { ArrowRight, MapPin, RotateCw } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { PlatformLink } from '@/components/PlatformLink'
import { buttonVariants } from '@/components/ui/buttonVariants'
import { useSplashFinished } from '@/lib/splash'
import { cn } from '@/lib/utils'

type Reason = 'missing' | 'unreachable'

interface Props {
  slug?: string
  reason: Reason
  /** On {slug}.userentos.com or a custom domain, where relative links would stay on that host. */
  onStorefrontHost: boolean
  onRetry?: () => void
  /** A retry is in flight. */
  retrying?: boolean
}

const COPY: Record<Reason, { title: string; body: string }> = {
  missing: {
    title: 'There’s no storefront here',
    body: 'No agency or landlord runs a storefront at this address right now. Check the spelling, or find a home to rent on RentOS.',
  },
  unreachable: {
    title: 'This storefront didn’t load',
    body: 'We couldn’t reach RentOS to open this storefront. Check your connection and try again.',
  },
}

/** Entrance for the text: hidden until the scene starts, then rises in turn. */
function rise(play: boolean) {
  return play ? 'motion-safe:animate-[sceneRise_0.7s_cubic-bezier(0.22,1,0.36,1)_both]' : 'motion-safe:opacity-0'
}

/**
 * A storefront address with nothing behind it: an empty shopfront whose
 * address plate shows exactly what the visitor typed, so they can spot a typo
 * at a glance, with the way back to the rest of RentOS.
 */
export function StorefrontUnavailable({ slug, reason, onStorefrontHost, onRetry, retrying = false }: Props) {
  // On a first visit the launch splash covers the page; play once it lifts.
  const play = useSplashFinished()
  const address = onStorefrontHost ? window.location.host : `${window.location.host}/s/${slug ?? ''}`
  const { title, body } = COPY[reason]

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-gray-50 dark:bg-[#0c0e1a]">
      {/* A faint site-plan grid: the plot this storefront would stand on. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background-image:linear-gradient(to_right,rgba(30,58,95,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(30,58,95,0.07)_1px,transparent_1px)] [background-size:32px_32px] dark:opacity-100 dark:[background-image:linear-gradient(to_right,rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.05)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]"
      />

      <header className="px-5 pt-5 sm:px-8 sm:pt-7">
        <PlatformLink to="/" external={onStorefrontHost} className="focus-ring inline-flex rounded-lg" aria-label="RentOS home">
          <span className="dark:hidden"><Logo size={30} /></span>
          <span className="hidden dark:inline"><Logo size={30} theme="light" /></span>
        </PlatformLink>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16 pt-8 sm:px-8">
        <div className="w-full max-w-xl text-center">
          <Shopfront address={address} play={play} />

          <h1
            className={cn('font-display mt-10 text-3xl font-bold tracking-tight text-[#0f1f33] dark:text-white sm:text-4xl', rise(play))}
            style={{ animationDelay: '450ms' }}
          >
            {title}
          </h1>
          <p
            className={cn('mx-auto mt-3 max-w-md text-base leading-relaxed text-gray-600 dark:text-gray-300', rise(play))}
            style={{ animationDelay: '550ms' }}
          >
            {body}
          </p>

          <div
            className={cn('mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row', rise(play))}
            style={{ animationDelay: '650ms' }}
          >
            {reason === 'unreachable' && onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                aria-busy={retrying}
                className={buttonVariants({ variant: 'primary', size: 'lg' })}
              >
                <RotateCw size={16} aria-hidden className={cn(retrying && 'motion-safe:animate-spin')} />
                {retrying ? 'Trying again…' : 'Try again'}
              </button>
            ) : (
              <PlatformLink to="/registry" external={onStorefrontHost} className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'group')}>
                Browse rentals
                <ArrowRight size={16} aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </PlatformLink>
            )}
            <PlatformLink to="/" external={onStorefrontHost} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              Go to RentOS
            </PlatformLink>
          </div>

          {reason === 'missing' && (
            <p
              className={cn('mt-10 text-sm text-gray-500 dark:text-gray-400', rise(play))}
              style={{ animationDelay: '750ms' }}
            >
              Let property or run an agency?{' '}
              <PlatformLink to="/storefront" external={onStorefrontHost} className="focus-ring rounded font-semibold text-[#1e3a5f] underline decoration-[#f59e0b] decoration-2 underline-offset-4 hover:text-[#0f1f33] dark:text-blue-300 dark:hover:text-white">
                Set up your storefront
              </PlatformLink>
            </p>
          )}
        </div>
      </main>
    </div>
  )
}

const DUST = [
  { cx: 100, x: '-7px' },
  { cx: 160, x: '0px' },
  { cx: 220, x: '7px' },
]

/**
 * Line-drawn shopfront. On arrival the shutter rolls down over the empty shop
 * and lands with a puff of dust, then the address plate drops onto its chains
 * and swings to rest. After that it sways gently, and swings again when the
 * visitor points at or taps the shop.
 */
function Shopfront({ address, play }: { address: string; play: boolean }) {
  const id = useId()
  const awningClip = `${id}-awning`
  const openingClip = `${id}-opening`
  const [settled, setSettled] = useState(false)
  const [nudging, setNudging] = useState(false)
  const stripes = Array.from({ length: 8 }, (_, i) => i)

  const nudge = () => { if (settled) setNudging(true) }

  return (
    <div className="relative mx-auto w-full max-w-[440px]" onPointerEnter={nudge} onPointerDown={nudge}>
      <svg viewBox="0 0 320 210" className="w-full overflow-visible" aria-hidden>
        <defs>
          <clipPath id={awningClip}><path d="M36 44 H284 L272 76 H48 Z" /></clipPath>
          <clipPath id={openingClip}><rect x="84" y="104" width="152" height="92" /></clipPath>
        </defs>

        <line x1="12" y1="196" x2="308" y2="196" className="stroke-[#1e3a5f]/25 dark:stroke-white/15" strokeWidth="2" strokeLinecap="round" />
        {/* Facade */}
        <rect x="48" y="56" width="224" height="140" rx="6" className="fill-white stroke-[#1e3a5f]/20 dark:fill-[#141a2b] dark:stroke-white/10" strokeWidth="1.5" />

        {/* The empty shop behind the shutter: bare shelves, seen only as it closes. */}
        <rect x="84" y="104" width="152" height="92" className="fill-[#1e3a5f]/[0.07] dark:fill-black/40" />
        {[136, 166].map((y) => (
          <g key={y} className="stroke-[#1e3a5f]/25 dark:stroke-white/15" strokeWidth="1.5" strokeLinecap="round">
            <line x1="94" y1={y} x2="226" y2={y} />
            <line x1="104" y1={y} x2="104" y2={y + 5} />
            <line x1="216" y1={y} x2="216" y2={y + 5} />
          </g>
        ))}

        {/* Rolling shutter */}
        <g clipPath={`url(#${openingClip})`}>
          <g
            className={cn(
              '[transform-box:fill-box]',
              play ? 'motion-safe:animate-[shutterDown_1.1s_cubic-bezier(0.55,0,0.9,0.45)_both]' : 'motion-safe:opacity-0',
            )}
          >
            <rect x="84" y="104" width="152" height="92" className="fill-gray-100 dark:fill-[#0f1422]" />
            {Array.from({ length: 10 }, (_, i) => (
              <line key={i} x1="84" y1={112 + i * 8.4} x2="236" y2={112 + i * 8.4} className="stroke-[#1e3a5f]/15 dark:stroke-white/10" strokeWidth="1" />
            ))}
            <rect x="150" y="186" width="20" height="4" rx="2" className="fill-[#1e3a5f]/40 dark:fill-white/25" />
            {/* Bottom rail: the shutter's leading edge as it comes down */}
            <rect x="84" y="193" width="152" height="3" className="fill-[#1e3a5f]/30 dark:fill-white/20" />
          </g>
        </g>
        <rect x="84" y="104" width="152" height="92" rx="2" className="fill-none stroke-[#1e3a5f]/20 dark:stroke-white/10" strokeWidth="1.5" />
        {/* Shutter box the roll lives in */}
        <rect x="80" y="97" width="160" height="9" rx="2.5" className="fill-white stroke-[#1e3a5f]/25 dark:fill-[#1a2236] dark:stroke-white/15" strokeWidth="1.5" />

        {/* Awning: alternating navy and amber, scalloped edge */}
        <g clipPath={`url(#${awningClip})`}>
          {stripes.map((i) => (
            <rect key={i} x={36 + i * 31} y="44" width="31" height="32" className={i % 2 ? 'fill-[#f59e0b]' : 'fill-[#1e3a5f] dark:fill-[#2d5a8e]'} />
          ))}
        </g>
        {stripes.map((i) => (
          <circle key={i} cx={63.5 + i * 28} cy="76" r="7" className={i % 2 ? 'fill-[#f59e0b]' : 'fill-[#1e3a5f] dark:fill-[#2d5a8e]'} />
        ))}

        {/* Dust kicked up where the shutter lands */}
        {DUST.map((d, i) => (
          <circle
            key={d.cx}
            cx={d.cx}
            cy="193"
            r="4"
            className={cn(
              'origin-center opacity-0 [transform-box:fill-box] fill-[#1e3a5f]/25 dark:fill-white/20',
              play && 'motion-safe:animate-[dustPuff_0.9s_ease-out_both]',
            )}
            style={{ animationDelay: `${640 + i * 40}ms`, ['--dust-x' as string]: d.x }}
          />
        ))}
      </svg>

      {/* Enamel address plate: HTML so any length of address wraps cleanly. */}
      <div className="absolute left-1/2 top-[47%] w-max max-w-[82%] -translate-x-1/2">
        <div
          className={cn(
            'origin-top',
            play ? 'motion-safe:animate-[plateHang_1.7s_cubic-bezier(0.25,0.9,0.3,1)_both]' : 'motion-safe:opacity-0',
          )}
          style={{ animationDelay: '800ms' }}
          onAnimationEnd={(e) => { if (e.animationName === 'plateHang') setSettled(true) }}
        >
          <div
            className={cn(
              'origin-top',
              nudging
                ? 'motion-safe:animate-[plateNudge_1.2s_ease-out]'
                : settled && 'motion-safe:animate-[plateSway_7s_linear_infinite]',
            )}
            onAnimationEnd={(e) => { if (e.animationName === 'plateNudge') setNudging(false) }}
          >
            <span aria-hidden className="absolute -top-5 left-[18%] h-5 w-px bg-[#1e3a5f]/50 dark:bg-white/35" />
            <span aria-hidden className="absolute -top-5 right-[18%] h-5 w-px bg-[#1e3a5f]/50 dark:bg-white/35" />
            <div className="rounded-lg bg-[#0f1f33] p-1 shadow-[0_10px_24px_-8px_rgba(15,31,51,0.55)] ring-1 ring-black/10 dark:bg-[#1e3a5f] dark:ring-white/10">
              <div className="flex items-center gap-2 rounded-md border border-white/70 px-3 py-1.5">
                <MapPin size={14} className="shrink-0 text-[#f59e0b]" aria-hidden />
                <span className="sr-only">Address:</span>
                <span className="text-left font-['TT_Squares',ui-monospace,monospace] text-[13px] font-bold tracking-wide text-white [overflow-wrap:anywhere] sm:text-sm">
                  {address}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
