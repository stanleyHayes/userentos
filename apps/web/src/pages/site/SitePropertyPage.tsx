import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MessageSquare, ShieldCheck } from 'lucide-react'
import { PublicPropertyView } from '@/pages/property/PublicPropertyPage'
import { usePublicListing } from '@/lib/publicListing'
import { useSite, sitePath, trackSite } from '@/lib/site'
import { platformOrigin } from '@/lib/platformOrigin'
import { applySeo } from '@/lib/seo'

/** One listing, inside the professional's website. The same record as the Registry and /property/<ref>. */
export function SitePropertyPage() {
  const { ref } = useParams<{ ref: string }>()
  const { site, base, onHost, color } = useSite()
  const { data: listing, isLoading, isError } = usePublicListing(ref)

  const listingId = listing?.id
  useEffect(() => {
    if (listingId) trackSite(site.slug, { type: 'view', propertyId: listingId })
  }, [site.slug, listingId])

  useEffect(() => {
    if (!listing) return
    applySeo({
      title: `${listing.title} · ${site.name}`,
      description: listing.description?.slice(0, 160) ?? `${listing.title} from ${site.name}.`,
      canonical: listing.url ?? undefined,
      image: listing.images?.[0],
      siteName: site.name,
    })
  }, [listing, site.name])

  if (isLoading) return <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6"><div className="aspect-[16/7] animate-pulse rounded-3xl bg-slate-200" /></div>
  if (isError || !listing) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-serif text-3xl font-semibold text-slate-900">This property is no longer listed</h1>
        <p className="mt-3 text-slate-600">It may have been let or sold.</p>
        <Link to={sitePath(base, '/properties')} className="mt-6 inline-flex rounded-full px-6 py-3 text-sm font-semibold text-[var(--site-on-color)]" style={{ background: color }}>See other properties</Link>
      </div>
    )
  }

  // On the owner's own domain nobody is signed in: enquiries continue on RentOS.
  const actions = onHost ? (
    <>
      <a href={`${platformOrigin()}/property/${(listing.ref ?? listing.id).toLowerCase()}`} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-[var(--site-on-color)] transition hover:opacity-90" style={{ background: color }}>
        <MessageSquare size={16} /> Enquire on RentOS
      </a>
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500"><ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-500" />You will message {site.name} on RentOS, where your conversation, viewing and payment are protected.</p>
    </>
  ) : undefined

  return (
    <div className="bg-[#f7f5f2]">
      <PublicPropertyView listing={listing} backTo={{ href: sitePath(base, '/properties'), label: 'All properties' }} actionsOverride={actions} />
    </div>
  )
}
