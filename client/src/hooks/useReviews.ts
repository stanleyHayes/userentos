import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Review {
  id: string
  propertyId: string
  userId: string
  userName?: string
  rating: number
  comment: string
  pros: string[]
  cons: string[]
  anonymous: boolean
  createdAt: string
  updatedAt: string
}

interface ReviewsResponse {
  items: Review[]
  total: number
  averageRating: number
}

interface CreateReviewBody {
  propertyId: string
  rating: number
  comment: string
  pros: string[]
  cons: string[]
  anonymous: boolean
}

export function usePropertyReviews(propertyId: string) {
  return useQuery({
    queryKey: ['reviews', propertyId],
    queryFn: () => api.get<ReviewsResponse>(`/reviews/property/${propertyId}`),
    enabled: !!propertyId,
  })
}

export function useCreateReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateReviewBody) => api.post<Review>('/reviews', body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['reviews', variables.propertyId] })
    },
  })
}

export function useDeleteReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; propertyId: string }) =>
      api.delete(`/reviews/${id}`),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['reviews', variables.propertyId] })
    },
  })
}
