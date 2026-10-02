import { Link } from 'react-router-dom'
import { Globe, ArrowRight, Rocket } from 'lucide-react'
import { useMyStorefront } from '@/hooks/useApi'
import { IconWatermark } from '@/components/ui/Watermark'
import { buttonVariants } from '@/components/ui/buttonVariants'

/**
 * On a professional's dashboard until their website is live: set it up, or
 * launch the draft (brief §06: improve onboarding). Drawn like PageHeader:
 * the same dark card, hairline accent, icon badge and watermark.
 */
export function WebsiteSetupBanner() {
  const { data: storefront, isLoading } = useMyStorefront()
  if (isLoading) return null
  if (storefront && (storefront.published !== false || storefront.status !== 'active')) return null
  const draft = Boolean(storefront)
  const Icon = draft ? Rocket : Globe
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f1f33] p-4 text-white shadow-[0_18px_56px_rgba(15,31,51,0.16)] sm:p-6">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 overflow-hidden lg:block">
        <IconWatermark icon={Icon} tone="brand" className="-right-8 top-1/2 size-52 -translate-y-1/2 rotate-[-8deg]" />
      </span>
      <div className="absolute inset-x-8 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #2d5a8e, transparent)' }} />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] text-[#7dd3fc] shadow-[0_2px_10px_rgba(0,0,0,0.35)] ring-1 ring-inset ring-white/15">
          <Icon size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold leading-tight">{draft ? 'Your website is ready to launch' : 'Get your own property website'}</p>
          <p className="mt-1 text-sm leading-relaxed text-white/60">{draft ? 'Have a last look and launch it, then share the link on WhatsApp and social media.' : 'yourname.userentos.com with your listings, about page, news and enquiries. Set up in about five minutes.'}</p>
        </div>
        <Link to={draft ? '/website' : '/onboarding'} className={buttonVariants({ variant: 'secondary', className: 'dark-surface-control shrink-0' })}>
          {draft ? 'Review and launch' : 'Set up my website'} <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  )
}
