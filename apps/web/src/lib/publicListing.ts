import { useQuery } from '@tanstack/react-query'
import { listingPath } from '../../../../packages/shared/listingTypes'

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
export const SCHEMA_TYPES: Record<string, string> = { apartment: 'Apartment', studio: 'Apartment', house: 'SingleFamilyResidence', townhouse: 'House', room: 'Room', shared_room: 'Room', hostel: 'Accommodation', commercial: 'Place', warehouse: 'Place' }

export const apiBase = () => import.meta.env.VITE_API_URL || '/api'

export function usePublicListing(key: string | undefined) {
  return useQuery({
    queryKey: ['public-listing', key?.toLowerCase()],
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

