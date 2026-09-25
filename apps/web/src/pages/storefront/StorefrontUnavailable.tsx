import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, MapPin, RotateCw } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { buttonVariants } from '@/components/ui/buttonVariants'

type Reason = 'missing' | 'unreachable'

interface Props {
  slug?: string
  reason: Reason
  /** On {slug}.userentos.com or a custom domain, where relative links would stay on that host. */
  onStorefrontHost: boolean
  onRetry?: () => void
}

/**
 * Where the main site lives. On a storefront host every relative path would
 * stay on that host, so onward links name the platform explicitly.
 */
function platformOrigin(): string {
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.localhost')) {
    return `${window.location.protocol}//localhost${window.location.port ? `:${window.location.port}` : ''}`
  }
  return ((import.meta.env.VITE_SITE_URL as string | undefined) || 'https://userentos.com').replace(/\/$/, '')
}

function PlatformLink({ to, external, className, children, ...rest }: { to: string; external: boolean; className: string; children: ReactNode; 'aria-label'?: string }) {
  return external
    ? <a href={`${platformOrigin()}${to}`} className={className} {...rest}>{children}</a>
    : <Link to={to} className={className} {...rest}>{children}</Link>
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

/**
 * A storefront address with nothing behind it: an empty shopfront whose
 * address plate shows exactly what the visitor typed, so they can spot a typo
 * at a glance, with the way back to the rest of RentOS.
 */
export function StorefrontUnavailable({ slug, reason, onStorefrontHost, onRetry }: Props) {
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
          <Shopfront address={address} />

          <h1 className="font-display mt-10 text-3xl font-bold tracking-tight text-[#0f1f33] dark:text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-gray-600 dark:text-gray-300">
            {body}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {reason === 'unreachable' && onRetry ? (
              <button type="button" onClick={onRetry} className={buttonVariants({ variant: 'primary', size: 'lg' })}>
                <RotateCw size={16} aria-hidden /> Try again
              </button>
            ) : (
              <PlatformLink to="/registry" external={onStorefrontHost} className={buttonVariants({ variant: 'primary', size: 'lg' })}>
                Browse rentals <ArrowRight size={16} aria-hidden />
              </PlatformLink>
            )}
            <PlatformLink to="/" external={onStorefrontHost} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              Go to RentOS
            </PlatformLink>
          </div>

          {reason === 'missing' && (
            <p className="mt-10 text-sm text-gray-500 dark:text-gray-400">
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

/** Line-drawn shopfront, shutter down, with the address plate hanging from the awning. */
function Shopfront({ address }: { address: string }) {
  const stripes = Array.from({ length: 8 }, (_, i) => i)
  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <svg viewBox="0 0 320 210" className="w-full" aria-hidden>
        <line x1="12" y1="196" x2="308" y2="196" className="stroke-[#1e3a5f]/25 dark:stroke-white/15" strokeWidth="2" strokeLinecap="round" />
        {/* Facade */}
        <rect x="48" y="56" width="224" height="140" rx="6" className="fill-white stroke-[#1e3a5f]/20 dark:fill-[#141a2b] dark:stroke-white/10" strokeWidth="1.5" />
        {/* Awning: alternating navy and amber, scalloped edge */}
        <clipPath id="awning-shape"><path d="M36 44 H284 L272 76 H48 Z" /></clipPath>
        <g clipPath="url(#awning-shape)">
          {stripes.map((i) => (
            <rect key={i} x={36 + i * 31} y="44" width="31" height="32" className={i % 2 ? 'fill-[#f59e0b]' : 'fill-[#1e3a5f] dark:fill-[#2d5a8e]'} />
          ))}
        </g>
        {stripes.map((i) => (
          <circle key={i} cx={63.5 + i * 28} cy="76" r="7" className={i % 2 ? 'fill-[#f59e0b]' : 'fill-[#1e3a5f] dark:fill-[#2d5a8e]'} />
        ))}
        {/* Rolling shutter, down */}
        <rect x="84" y="104" width="152" height="92" rx="2" className="fill-gray-100 stroke-[#1e3a5f]/20 dark:fill-[#0f1422] dark:stroke-white/10" strokeWidth="1.5" />
        {Array.from({ length: 10 }, (_, i) => (
          <line key={i} x1="86" y1={112 + i * 8.4} x2="234" y2={112 + i * 8.4} className="stroke-[#1e3a5f]/15 dark:stroke-white/10" strokeWidth="1" />
        ))}
        <rect x="150" y="186" width="20" height="4" rx="2" className="fill-[#1e3a5f]/40 dark:fill-white/25" />
      </svg>

      {/* Enamel address plate: HTML so any length of address wraps cleanly. */}
      <div className="absolute left-1/2 top-[47%] w-max max-w-[82%] -translate-x-1/2">
        <div className="origin-top animate-[plateSettle_1.6s_cubic-bezier(0.25,0.9,0.3,1)_both] motion-reduce:animate-none">
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
  )
}
