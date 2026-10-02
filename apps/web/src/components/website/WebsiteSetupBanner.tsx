import { Link } from 'react-router-dom'
import { Globe, ArrowRight, Rocket } from 'lucide-react'
import { useMyStorefront } from '@/hooks/useApi'

/**
 * On a professional's dashboard until their website is live: set it up, or
 * launch the draft (brief §06: improve onboarding).
 */
export function WebsiteSetupBanner() {
  const { data: storefront, isLoading } = useMyStorefront()
  if (isLoading) return null
  if (storefront && (storefront.published !== false || storefront.status !== 'active')) return null
  const draft = Boolean(storefront)
  return (
    <div className="flex flex-col gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-[#0f1f33] via-[#1e3a5f] to-[#2d5a8e] p-5 text-white sm:flex-row sm:items-center">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10">{draft ? <Rocket size={22} /> : <Globe size={22} />}</span>
      <div className="flex-1">
        <p className="font-bold">{draft ? 'Your website is ready to launch' : 'Get your own property website'}</p>
        <p className="mt-0.5 text-sm text-white/75">{draft ? 'Have a last look and launch it, then share the link on WhatsApp and social media.' : 'yourname.userentos.com with your listings, about page, news and enquiries — set up in about five minutes.'}</p>
      </div>
      <Link to={draft ? '/website' : '/onboarding'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0f1f33] hover:bg-white/90">
        {draft ? 'Review and launch' : 'Set up my website'} <ArrowRight size={16} />
      </Link>
    </div>
  )
}
