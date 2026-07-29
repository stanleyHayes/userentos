import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface HousingDemandRegion {
  region: string
  listings: number
  avgRent: number
  minRent: number
  maxRent: number
  vacancyRate: number
}

export interface HousingDemandTrendMonth {
  month: string
  newListings: number
  avgRent: number
}

export interface HousingDemandSummary {
  totalListings: number
  overallVacancyRate: number
  activeAgreements: number
  totalApplications: number
  applicationsPerListing: number
}

export interface HousingDemand {
  regions: HousingDemandRegion[]
  rentTrend: HousingDemandTrendMonth[]
  summary: HousingDemandSummary
}

export function useHousingDemand() {
  return useQuery({
    queryKey: ['analytics', 'housing-demand'],
    queryFn: () => api.get<HousingDemand>('/analytics/housing-demand'),
  })
}
