import { useQuery } from '@tanstack/react-query'
import { apiBase } from '@/lib/publicListing'

export interface SearchLink { label: string; path: string }

/** The main markets, linked while the live list loads (or if it cannot). Kept in step with popularSearches in apps/api/src/services/seoLanding.ts. */
export const FALLBACK_SEARCHES: SearchLink[] = [
  { label: 'Houses for rent in Accra', path: '/rent/accra/houses' },
  { label: 'Apartments for rent in Accra', path: '/rent/accra/apartments' },
  { label: 'Homes for rent in Kumasi', path: '/rent/kumasi' },
  { label: 'Homes for rent in Tema', path: '/rent/tema' },
  { label: 'Houses for sale in Accra', path: '/buy/accra/houses' },
  { label: 'Short stays in Accra', path: '/short-stay/accra' },
]

/** The busiest search pages (GET /api/seo/popular), for "Popular searches". */
export function usePopularSearches(): SearchLink[] {
  const { data } = useQuery({
    queryKey: ['seo-popular'],
    queryFn: async () => {
      const response = await fetch(`${apiBase()}/seo/popular`)
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.success) throw new Error('Could not load popular searches')
      return json.data as SearchLink[]
    },
    staleTime: 15 * 60 * 1000,
    retry: false,
  })
  return data?.length ? data : FALLBACK_SEARCHES
}
