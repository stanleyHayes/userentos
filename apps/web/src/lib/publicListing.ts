import { useQuery } from '@tanstack/react-query'
import { listingKey, listingPath } from '../../../../packages/shared/listingTypes'

export interface PublicListingAgent {
  name: string
  type: string
  logoUrl: string | null
  websiteUrl: string | null
  storefrontSlug: string | null
  identityVerified: boolean
  whatsapp: boolean
}

/** GET /public/properties/:ref — what anyone may see of a listing. */
export interface PublicListing {
  id: string
  ref: string | null
  listingType: string
  title: string
  description: string
  city: string
  region: string
  neighborhood: string
  digitalAddress: string
  propertyType: string
  rentAmount: number
  bedrooms: number
  bathrooms: number
  listingStatus: string
  publishedAt: string | null
  image: string | null
  url: string | null
  /** The descriptive address search engines index (/property/<description>-<ref>). */
  canonicalUrl?: string
  /** What the server renders for this page (apps/api/src/services/seo.ts listingSeo); the page keeps it after JavaScript runs. */
  seo?: { title: string; description: string; jsonLd: Record<string, unknown>[] }
  images: string[]
  amenities: string[]
  rules: string[]
  status: string
  furnished: boolean
  floorArea: number | null
  parkingSpaces: number
  availableFrom: string | null
  rentDurationMonths?: number
  advanceMonths?: number
  landlordIdentityVerified?: boolean
  agent: PublicListingAgent | null
}

export const TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartment', house: 'House', studio: 'Studio', townhouse: 'Townhouse', room: 'Room',
  shared_room: 'Shared Room', hostel: 'Hostel', commercial: 'Commercial', warehouse: 'Warehouse',
}
export const apiBase = () => import.meta.env.VITE_API_URL || '/api'

export function usePublicListing(param: string | undefined) {
  // "/property/2-bedroom-house-for-rent-in-osu-accra-rx7k2p9" and "/property/rx7k2p9" are the same listing.
  const key = param ? listingKey(param) : undefined
  return useQuery({
    queryKey: ['public-listing', key],
    queryFn: async () => {
      const response = await fetch(`${apiBase()}/public/properties/${encodeURIComponent(key!)}`)
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.success) throw new Error(json.error || 'Property not found')
      return json.data as PublicListing
    },
    enabled: !!key,
    retry: (count, err) => count < 2 && (err as Error).message !== 'Property not found',
  })
}

export function listingLocation(listing: Pick<PublicListing, 'neighborhood' | 'city' | 'region'>) {
  return [listing.neighborhood, listing.city, listing.region].filter(Boolean).join(', ')
}

/** The address a listing is shared at: its reference page on the platform. */
export function shareUrlFor(listing: Pick<PublicListing, 'ref' | 'id' | 'url'>) {
  return listing.url ?? `${window.location.origin}${listingPath(listing.ref ?? listing.id)}`
}

