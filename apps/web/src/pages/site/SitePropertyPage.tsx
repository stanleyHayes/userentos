import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { MessageSquare, ShieldCheck } from 'lucide-react'
import { PublicPropertyView } from '@/pages/property/PublicPropertyPage'
import { usePublicListing } from '@/lib/publicListing'
import { useSite, sitePath, trackSite } from '@/lib/site'
import { platformOrigin } from '@/lib/platformOrigin'
import { applySeo, clipDescription } from '@/lib/seo'
import { DetailSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { BrandLink } from './parts'

/** One listing, inside the professional's website. The same record as the Registry and /property/<ref>. */
export function SitePropertyPage() {
  const { ref } = useParams<{ ref: string }>()
  const { site, base, onHost } = useSite()
  const { data: listing, isLoading, isError } = usePublicListing(ref)

  const listingId = listing?.id
  useEffect(() => {
    if (listingId) trackSite(site.slug, { type: 'view', propertyId: listingId })
  }, [site.slug, listingId])

  useEffect(() => {
    if (!listing) return
    applySeo({
      title: `${listing.title} · ${site.name}`,
      // The listing's description as the server sends it for this page.
      description: listing.seo?.description ?? clipDescription(listing.description || `${listing.title} from ${site.name}.`),
      // The descriptive platform address the server names too (listing.url is the short share link).
      canonical: listing.canonicalUrl ?? listing.url ?? undefined,
      image: listing.images?.[0],
      siteName: site.name,
    })
  }, [listing, site.name])

  if (isLoading) return <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6"><DetailSkeleton /></div>
  if (isError || !listing) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <EmptyState preset="properties" title="This property is no longer listed" description="It may have been let or sold." action={{ label: 'See other properties', href: sitePath(base, '/properties') }} />
      </div>
    )
  }

  // On the owner's own domain nobody is signed in: enquiries continue on RentOS.
  const actions = onHost ? (
    <>
      <BrandLink href={listing.canonicalUrl ?? `${platformOrigin()}/property/${(listing.ref ?? listing.id).toLowerCase()}`} className="w-full">
        <MessageSquare size={16} /> Enquire on RentOS
      </BrandLink>
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted dark:text-gray-400"><ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-500" />You will message {site.name} on RentOS, where your conversation, viewing and payment are protected.</p>
    </>
  ) : undefined

  return (
    <PublicPropertyView listing={listing} backTo={{ href: sitePath(base, '/properties'), label: 'All properties' }} actionsOverride={actions} />
  )
}
