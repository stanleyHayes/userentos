import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// Mirrors apps/api/src/models/Promotion.ts
export interface AdminPromotion {
  id: string
  ownerId?: string
  storefrontId?: string
  fundingSource: 'platform' | 'seller'
  code: string
  type: 'percentage' | 'fixed'
  value: number
  startAt: string
  endAt: string
  /** Total redemptions allowed across all users. Absent means uncapped. */
  usageLimit?: number
  /** Redemptions allowed per user. Absent means uncapped. */
  perUserLimit?: number
  minimumSpend?: number
  eligiblePropertyIds: string[]
  usedCount: number
  status: 'active' | 'paused' | 'expired' | 'disabled'
  disabledReason?: string
  createdAt: string
  updatedAt: string
}

/** Matches the zod schema on POST /marketplace/promotions. */
export interface CreatePromotionBody {
  code: string
  type: 'percentage' | 'fixed'
  value: number
  startAt: string
  endAt: string
  usageLimit?: number
  perUserLimit?: number
  minimumSpend?: number
  eligiblePropertyIds: string[]
}

/** The CouponResult the server returns from validate/redeem. */
export interface CouponPreview {
  valid: boolean
  reason?: string
  discountAmount: number
  promotionId?: string
  fundingSource?: 'platform' | 'seller'
}

export interface ValidateCouponBody {
  code: string
  amount: number
  sellerId?: string
  propertyId?: string
}

/** Every promotion on the platform — `all=true` is honoured for admins only. */
export function useAdminPromotions() {
  return useQuery({
    queryKey: ['admin-promotions'],
    queryFn: () => api.get<{ items: AdminPromotion[]; total: number }>('/marketplace/promotions?all=true'),
  })
}

export function useCreatePromotion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreatePromotionBody) => api.post<AdminPromotion>('/marketplace/promotions', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-promotions'] }),
  })
}

export function useDisablePromotion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<{ id: string; status: string }>(`/marketplace/promotions/${id}/disable`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-promotions'] }),
  })
}

/**
 * Preview a coupon. Deliberately no cache invalidation: /validate computes the
 * discount without touching `usedCount`, so nothing an admin sees goes stale.
 */
export function useValidateCoupon() {
  return useMutation({
    mutationFn: (body: ValidateCouponBody) => api.post<CouponPreview>('/marketplace/promotions/validate', body),
  })
}

export type PromotionLifecycle = 'disabled' | 'paused' | 'expired' | 'exhausted' | 'scheduled' | 'active'

/**
 * What state is this coupon really in?
 *
 * Nothing on the server rewrites `status` when a window closes or a cap fills —
 * the stored value only records what a person did to the promotion — so a row
 * that still reads "active" can already be unusable. validateCoupon rejects on
 * the window and on the cap independently of `status`, and whoever is triaging
 * a "my coupon stopped working" complaint needs that same split: a disabled
 * coupon was switched off by an admin and has a reason attached; an expired or
 * exhausted one simply ran out on its own terms.
 */
export function promotionLifecycle(promotion: AdminPromotion, now: number = Date.now()): PromotionLifecycle {
  if (promotion.status === 'disabled') return 'disabled'
  if (promotion.status === 'paused') return 'paused'
  if (promotion.status === 'expired' || new Date(promotion.endAt).getTime() < now) return 'expired'
  if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) return 'exhausted'
  if (new Date(promotion.startAt).getTime() > now) return 'scheduled'
  return 'active'
}
