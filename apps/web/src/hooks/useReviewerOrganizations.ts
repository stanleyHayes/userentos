import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/* ================================================================
   Reviewer organizations — the optional external authorities that may
   review property listings (server/src/routes/reviewerOrganizations.ts).
   Admin-only; with none active, review stays entirely inside RentOS.
   ================================================================ */

export type ReviewerOrgKind = 'platform' | 'government' | 'partner'
export type ReviewerOrgMode = 'advisory' | 'required' | 'delegated'

/**
 * The review permissions the server recognises (services/propertyReview.ts).
 *
 * `property.review.override` is deliberately not offered: canReview() refuses
 * it to everyone but a super admin, so granting it to an organization would be
 * a promise the server never keeps.
 */
export const REVIEWER_PERMISSIONS = [
  'property.review.read',
  'property.review.approve',
  'property.review.reject',
  'property.review.request_changes',
  'property.review.assign',
] as const

export type ReviewerPermission = (typeof REVIEWER_PERMISSIONS)[number]

export interface ReviewerOrgScope {
  regions: string[]
  cities: string[]
}

export interface ReviewerOrganization {
  id: string
  name: string
  slug: string
  kind: ReviewerOrgKind
  reviewMode: ReviewerOrgMode
  isActive: boolean
  /** Empty arrays mean unrestricted — the organization may review anywhere. */
  scope: ReviewerOrgScope
  permissions: string[]
  createdAt: string
  updatedAt: string
}

export interface ReviewerOrganizationsResponse {
  items: ReviewerOrganization[]
  total: number
}

/** Mirrors the server's zod schema for POST / PATCH. */
export interface ReviewerOrganizationInput {
  name: string
  slug: string
  kind: ReviewerOrgKind
  reviewMode: ReviewerOrgMode
  isActive: boolean
  scope: ReviewerOrgScope
  permissions: string[]
}

const QUERY_KEY = ['reviewer-organizations']

export function useReviewerOrganizations() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.get<ReviewerOrganizationsResponse>('/reviewer-organizations'),
  })
}

export function useCreateReviewerOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ReviewerOrganizationInput) =>
      api.post<ReviewerOrganization>('/reviewer-organizations', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

/**
 * The server parses PATCH bodies with `orgSchema.partial()`, which is shallow:
 * a `scope` that is sent replaces the stored one wholesale, so callers must
 * send both arrays together or leave `scope` out entirely.
 */
export function useUpdateReviewerOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<ReviewerOrganizationInput> & { id: string }) =>
      api.patch<ReviewerOrganization>(`/reviewer-organizations/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
