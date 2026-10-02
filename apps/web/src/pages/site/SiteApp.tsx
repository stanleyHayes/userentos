import { useEffect, useMemo } from 'react'
import { Route, Routes, useLocation, useParams } from 'react-router-dom'
import { SiteContext, useSiteData, siteColor, type SiteContextValue } from '@/lib/site'
import { applySeo, clipDescription, setJsonLd } from '@/lib/seo'
import { StorefrontUnavailable } from '@/pages/storefront/StorefrontUnavailable'
import { SiteLayout } from './SiteLayout'
import { SiteHome } from './SiteHome'
import { SiteProperties } from './SiteProperties'
import { SitePropertyPage } from './SitePropertyPage'
import { SiteAbout } from './SiteAbout'
import { SiteNews, SiteNewsPost } from './SiteNews'
import { SiteContact } from './SiteContact'

const PAGE_TITLES: Record<string, string> = { properties: 'Properties', about: 'About', news: 'News', contact: 'Contact' }

/** Head tags for the site's own pages; listing and post pages set their own. */
function useSiteSeo(value: SiteContextValue | null) {
  const location = useLocation()
  const section = location.pathname.slice(value?.base.length ?? 0).split('/').filter(Boolean)
  const page = section[0] ?? ''
  const isDetail = page === 'property' || (page === 'news' && section.length > 1)
  useEffect(() => {
    if (!value || isDetail) return
    const { site, onHost } = value
    const canonical = `${site.canonicalUrl.replace(/\/$/, '')}${page ? `/${page}` : ''}`
    const onCanonicalHost = typeof window !== 'undefined' && site.canonicalUrl.startsWith(window.location.origin)
    applySeo({
      // The same title and description the server sends (siteMeta in apps/api/src/services/seo.ts).
      title: page ? `${PAGE_TITLES[page] ?? site.name} · ${site.name}` : site.tagline ? `${site.name}: ${site.tagline}` : site.name,
      description: clipDescription(site.heroSubtitle || site.about || site.tagline || `Homes to rent and buy from ${site.name}.`),
      canonical,
      image: site.branding.coverUrl ?? site.branding.logoUrl,
      siteName: site.name,
      // Drafts and duplicate addresses stay out of search results.
      noIndex: site.preview || (onHost && !onCanonicalHost),
    })
    setJsonLd('site-org', {
      '@context': 'https://schema.org',
      '@type': 'RealEstateAgent',
      name: site.name,
      url: site.canonicalUrl,
      ...(site.branding.logoUrl ? { logo: site.branding.logoUrl, image: site.branding.coverUrl ?? site.branding.logoUrl } : {}),
      ...(site.about ? { description: site.about.slice(0, 300) } : {}),
      ...(site.contact.city ? { address: { '@type': 'PostalAddress', addressLocality: site.contact.city, addressCountry: 'GH' } } : {}),
      ...(site.serviceAreas.length ? { areaServed: site.serviceAreas } : {}),
    })
    return () => setJsonLd('site-org', null)
  }, [value, page, isDetail])
}

/**
 * A professional's RentOS website (brief §03). `slug` comes from the host on
 * <slug>.userentos.com or a custom domain (base ""), or from /s/:slug on the
 * platform (base "/s/<slug>").
 */
export function SiteApp({ slug: hostSlug }: { slug?: string }) {
  const params = useParams<{ slug: string }>()
  const slug = hostSlug ?? params.slug
  const onHost = Boolean(hostSlug)
  const base = onHost ? '' : `/s/${slug}`
  const { data: site, isLoading, isError, error, refetch, isFetching } = useSiteData(slug)

  const value = useMemo<SiteContextValue | null>(() => (site ? { site, base, onHost, color: siteColor(site) } : null), [site, base, onHost])
  useSiteSeo(value)

  if (isLoading) {
    return (
      <div className="public-shell-bg min-h-screen">
        <div className="surface-card h-16 border-b" />
        <div className="h-[420px] animate-pulse bg-primary/5 dark:bg-white/[0.03]" />
      </div>
    )
  }
  if (isError || !value) {
    const missing = !isError || (error as { status?: number } | null)?.status === 404
    return <StorefrontUnavailable slug={slug} reason={missing ? 'missing' : 'unreachable'} onStorefrontHost={onHost} onRetry={() => { void refetch() }} retrying={isFetching} />
  }

  return (
    <SiteContext.Provider value={value}>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<SiteHome />} />
          <Route path="properties" element={<SiteProperties />} />
          <Route path="property/:ref" element={<SitePropertyPage />} />
          <Route path="about" element={<SiteAbout />} />
          <Route path="news" element={<SiteNews />} />
          <Route path="news/:postSlug" element={<SiteNewsPost />} />
          <Route path="contact" element={<SiteContact />} />
          <Route path="*" element={<SiteHome />} />
        </Route>
      </Routes>
    </SiteContext.Provider>
  )
}
