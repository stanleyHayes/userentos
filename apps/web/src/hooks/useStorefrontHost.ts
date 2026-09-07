import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { detectStorefrontSlug, isPossibleCustomDomain } from '@/lib/subdomain'

/**
 * Which storefront, if any, is this browser tab on? (spec §4.1)
 *
 * A platform subdomain ({slug}.userentos.com) carries the slug in the hostname
 * and needs no request. A custom domain does not — only the server knows which
 * storefront a given domain is attached to — so that case asks
 * GET /storefronts/resolve/host, which reads the same Host header the API's
 * tenant middleware resolved.
 *
 * Returns null on the platform's own hosts, which is the overwhelmingly common
 * case, so the normal app renders with no extra request.
 */
export function useStorefrontHost() {
  const slugFromHost = detectStorefrontSlug()
  const mightBeCustomDomain = isPossibleCustomDomain()

  const { data, isLoading } = useQuery({
    queryKey: ['storefront-host'],
    queryFn: () => api.get<{ slug: string; name: string; canonicalUrl: string } | null>('/storefronts/resolve/host'),
    // Only ask when the hostname could belong to a storefront we cannot name.
    enabled: mightBeCustomDomain,
    staleTime: Infinity,
    retry: false,
  })

  return {
    slug: slugFromHost ?? data?.slug ?? null,
    canonicalUrl: data?.canonicalUrl,
    // A subdomain resolves synchronously; only a custom domain has to wait.
    isResolving: mightBeCustomDomain && isLoading,
  }
}
