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

/** What GET /reviews/property/:id actually returns. Only verified reviews are included. */
interface ApiReviewsResponse {
  reviews: (Omit<Review, 'comment' | 'anonymous'> & { title: string; content: string; verified: boolean })[]
  summary: { count: number; avgRating: number }
}

export function usePropertyReviews(propertyId: string) {
  return useQuery({
    queryKey: ['reviews', propertyId],
    // The API's shape is { reviews, summary } and its text field is
    // `content`; this read `items`/`averageRating`/`comment`, so the section
    // always rendered empty.
    queryFn: async (): Promise<ReviewsResponse> => {
      const res = await api.get<ApiReviewsResponse>(`/reviews/property/${propertyId}`)
      return {
        items: res.reviews.map((r) => ({ ...r, comment: r.content, anonymous: false })),
        total: res.summary.count,
        averageRating: res.summary.avgRating,
      }
    },
    enabled: !!propertyId,
  })
}

export function useCreateReview() {
  const qc = useQueryClient()
  return useMutation({
    // The API requires `title` and `content`; the modal collects one text.
    // Sending `comment` failed validation on every submission.
    mutationFn: ({ comment, anonymous: _anonymous, ...body }: CreateReviewBody) =>
      api.post<Review>('/reviews', { ...body, title: comment.trim().slice(0, 80), content: comment }),
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
