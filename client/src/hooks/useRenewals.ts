import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { PaginatedResponse } from '@/types'

// Mirrors server/src/models/RenewalOffer.ts
export interface RenewalOffer {
  id: string
  agreementId: string
  landlordId: string
  tenantId: string
  proposedRent: number
  proposedEndDate: string
  message?: string
  status: 'pending' | 'accepted' | 'declined'
  respondedAt?: string
  createdAt: string
}

/** My renewal offers — as landlord (offers I sent) or tenant (offers I received). */
export function useRenewalOffers(params?: { role?: 'landlord' | 'tenant'; status?: string }, options?: { enabled?: boolean }) {
  const query = new URLSearchParams()
  if (params?.role) query.set('role', params.role)
  if (params?.status) query.set('status', params.status)
  const qs = query.toString()
  return useQuery({
    queryKey: ['renewals', params],
    queryFn: () => api.get<PaginatedResponse<RenewalOffer>>(`/renewals${qs ? `?${qs}` : ''}`),
    enabled: options?.enabled ?? true,
  })
}

/** Landlord creates a renewal offer for an active agreement. */
export function useCreateRenewalOffer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ agreementId, ...body }: { agreementId: string; proposedRent: number; proposedEndDate: string; message?: string }) =>
      api.post<RenewalOffer>(`/renewals/agreement/${agreementId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renewals'] })
      qc.invalidateQueries({ queryKey: ['agreements'] })
    },
  })
}

/** Tenant accepts (agreement extended at the proposed terms) or declines. */
export function useRespondToRenewal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      api.post<RenewalOffer>(`/renewals/${id}/respond`, { accept }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renewals'] })
      qc.invalidateQueries({ queryKey: ['agreements'] })
    },
  })
}
