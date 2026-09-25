import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { PaginatedResponse } from '@/types'

interface RenewalSignature {
  role: 'landlord' | 'tenant'
  signatureName: string
  signedAt: string
  termsHash: string
  agreementVersion: number
}

// Mirrors apps/api/src/models/RenewalOffer.ts (+ offerView)
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
  /** SHA-256 of the renewed terms — the tenant echoes it back when signing. */
  termsHash?: string
  signatureConsentStatement?: string
  landlordEvidence?: RenewalSignature
  tenantEvidence?: RenewalSignature
}

/** Typed legal name + consent: the e-signature a renewal needs (Act 772). */
export interface RenewalSignatureInput {
  signatureName: string
  consent: true
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

/** Landlord signs and sends a renewal offer for an active agreement. */
export function useCreateRenewalOffer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ agreementId, ...body }: { agreementId: string; proposedRent: number; proposedEndDate: string; message?: string } & RenewalSignatureInput) =>
      api.post<RenewalOffer>(`/renewals/agreement/${agreementId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renewals'] })
      qc.invalidateQueries({ queryKey: ['agreements'] })
    },
  })
}

/** Tenant signs to accept (the agreement moves to the renewed terms) or declines. */
export function useRespondToRenewal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; accept: false } | ({ id: string; accept: true; termsHash: string } & RenewalSignatureInput)) =>
      api.post<RenewalOffer>(`/renewals/${id}/respond`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renewals'] })
      qc.invalidateQueries({ queryKey: ['agreements'] })
    },
  })
}
