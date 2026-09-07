import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/* ================================================================
   Admin affiliate console — mirrors apps/api/src/routes/adminAffiliates.ts
   (spec §11), mounted at /api/admin/affiliates.
   ================================================================ */

export type AffiliateStatus = 'active' | 'suspended'

/**
 * The commission state machine. `approved` and `payable` are the two halves of
 * approval — a review, then a release into the payout queue — so a single click
 * can never carry a freshly recorded commission all the way to payable.
 * `paid`, `rejected` and `reversed` are terminal.
 */
export type CommissionStatus = 'pending' | 'approved' | 'payable' | 'paid' | 'reversed' | 'rejected'

export type CommissionEvent = 'qualified_signup' | 'subscription' | 'sponsorship' | 'transaction'

/**
 * The one roll-up the server computes for the programme, for each row and for a
 * single affiliate. `payableAmount` covers `approved` and `payable` together:
 * both are money the platform has committed to and has not yet sent.
 */
export interface CommissionTotals {
  count: number
  pendingAmount: number
  pendingCount: number
  payableAmount: number
  payableCount: number
  paidAmount: number
  paidCount: number
}

export interface AdminAffiliate {
  id: string
  userId: string
  code: string
  status: AffiliateStatus
  suspendedReason?: string
  createdAt: string
  updatedAt: string
  referralLink: string
  /** null when the owning account is gone — the profile outlives the user. */
  affiliateName: string | null
  affiliateEmail: string | null
  totals: CommissionTotals
  referrals: { total: number; converted: number }
}

export interface AdminAffiliateList {
  items: AdminAffiliate[]
  total: number
  page: number
  limit: number
  totalPages: number
  /** Programme-wide earnings, unaffected by the filters on the list. */
  summary: CommissionTotals
}

export interface AffiliateCommission {
  id: string
  affiliateId: string
  event: CommissionEvent
  /** The transaction, subscription or sponsorship that earned it. */
  sourceRef?: string
  /** Snapshotted when earned, so changed terms never rewrite what was owed. */
  ruleSnapshot: { type: 'flat' | 'percentage'; value: number }
  amount: number
  status: CommissionStatus
  /** The rejection reason, once one has been recorded. */
  reason?: string
  createdAt: string
  updatedAt: string
}

export interface AffiliateReferral {
  id: string
  /** null until the referred visitor actually signs up. */
  referredUserId: string | null
  referredUserName: string | null
  source?: string
  campaign?: string
  createdAt: string
  expiresAt: string
}

/** The detail route returns the referral records themselves, not the counts. */
export interface AdminAffiliateDetail extends Omit<AdminAffiliate, 'referrals'> {
  affiliatePhone: string | null
  /** Newest 50 of each; the route caps both. */
  commissions: AffiliateCommission[]
  referrals: AffiliateReferral[]
}

export interface AdminAffiliateParams {
  status?: AffiliateStatus | ''
  search?: string
  page?: number
  limit?: number
}

/** GET /admin/affiliates — the roster, newest first, with per-affiliate earnings. */
export function useAdminAffiliates(params: AdminAffiliateParams = {}) {
  const status = params.status ?? ''
  const search = params.search?.trim() ?? ''
  const page = params.page ?? 1
  const limit = params.limit ?? 20

  const qs = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (status) qs.set('status', status)
  if (search) qs.set('search', search)

  return useQuery({
    queryKey: ['admin-affiliates', { status, search, page, limit }],
    queryFn: () => api.get<AdminAffiliateList>(`/admin/affiliates?${qs.toString()}`),
    // The programme totals ride on the same response as the table. Blanking
    // them on every keystroke would make the money figures flicker while only
    // the row filter is changing.
    placeholderData: keepPreviousData,
  })
}

/** GET /admin/affiliates/:id — pass null while no affiliate is open. */
export function useAdminAffiliate(id: string | null) {
  return useQuery({
    queryKey: ['admin-affiliate', id],
    queryFn: () => api.get<AdminAffiliateDetail>(`/admin/affiliates/${id}`),
    enabled: Boolean(id),
  })
}

/**
 * POST /admin/affiliates/commissions/:id/approve — advances one step only.
 *
 * The server claims the transition against the status it read, so a stale row
 * comes back as a 409 rather than double-approving. The returned commission is
 * therefore the authority on what the click actually did.
 */
export function useApproveCommission() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.post<AffiliateCommission>(`/admin/affiliates/commissions/${id}/approve`, {}),
    onSuccess: (commission) => {
      qc.invalidateQueries({ queryKey: ['admin-affiliates'] })
      qc.invalidateQueries({ queryKey: ['admin-affiliate', commission.affiliateId] })
    },
  })
}

export interface RejectCommissionBody {
  id: string
  /** The server requires 3–300 characters and writes it to the audit trail. */
  reason: string
}

/** POST /admin/affiliates/commissions/:id/reject — terminal, with a reason. */
export function useRejectCommission() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, reason }: RejectCommissionBody) =>
      api.post<AffiliateCommission>(`/admin/affiliates/commissions/${id}/reject`, { reason }),
    onSuccess: (commission) => {
      qc.invalidateQueries({ queryKey: ['admin-affiliates'] })
      qc.invalidateQueries({ queryKey: ['admin-affiliate', commission.affiliateId] })
    },
  })
}
