import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuthStore } from '@/stores/authStore'
import { formatDate } from '@/lib/utils'
import { api } from '@/lib/api'
import { usePropertyReviews } from '@/hooks/useReviews'
import { User, Star, UserCircle, Mail, Phone, Plus } from 'lucide-react'
import { ReviewCard } from './ReviewCard'
import { CreateReviewModal } from './CreateReviewModal'
import { TenantAccessButton } from './TenantAccessButton'
import type { RentalAgreement } from '@/types'

interface TenantReviewSectionProps {
  propertyId: string
  pastAgreements: RentalAgreement[]
}

export function TenantReviewSection({ propertyId, pastAgreements }: TenantReviewSectionProps) {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [tab, setTab] = useState<'tenants' | 'reviews'>('tenants')
  const [showCreateReview, setShowCreateReview] = useState(false)
  const { data: reviewsData, isLoading: reviewsLoading } = usePropertyReviews(propertyId)
  const reviews = reviewsData?.items ?? []
  const averageRating = reviewsData?.averageRating ?? 0

  const isLandlordOrManager = user?.activeRole === 'landlord' || user?.activeRole === 'property_manager' || user?.activeRole === 'government' || user?.activeRole === 'admin'

  const requestAccessMutation = useMutation({
    mutationFn: (tenantId: string) => api.post('/profile-access/request', { tenantId, propertyId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile-access-check'] }) },
  })

  return (
    <Card>
      <div className="flex border-b border-border/30 dark:border-[#252a3a]/30">
        <button onClick={() => setTab('tenants')} className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${tab === 'tenants' ? 'text-primary dark:text-blue-400 border-b-2 border-primary dark:border-blue-400' : 'text-muted dark:text-gray-400'}`}>
          <User size={14} className="inline mr-1.5" />Tenants ({pastAgreements.length})
        </button>
        <button onClick={() => setTab('reviews')} className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${tab === 'reviews' ? 'text-primary dark:text-blue-400 border-b-2 border-primary dark:border-blue-400' : 'text-muted dark:text-gray-400'}`}>
          <Star size={14} className="inline mr-1.5" />Reviews ({reviews.length})
        </button>
      </div>
      <div className="p-4">
        {tab === 'tenants' ? (
          pastAgreements.length > 0 ? (
            <div className="space-y-3">
              {pastAgreements.map((a) => (
                <div key={a.id} className="rounded-xl border border-border/40 dark:border-[#252a3a]/40 p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 dark:bg-blue-500/15 flex-shrink-0">
                        <UserCircle size={16} className="text-primary dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-primary-dark dark:text-white truncate">{a.tenantName ?? 'Tenant'}</p>
                        <p className="text-[11px] text-muted dark:text-gray-500">
                          {formatDate(a.startDate).split(',')[0]} – {a.status === 'active' ? 'Present' : formatDate(a.endDate).split(',')[0]}
                        </p>
                      </div>
                    </div>
                    <Badge variant={a.status === 'active' ? 'success' : 'default'}>{a.status}</Badge>
                  </div>

                  {/* Basic info always visible + full profile access gated */}
                  <div className="mt-3 pt-3 border-t border-border/30 dark:border-[#252a3a]/30 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-[11px] text-muted dark:text-gray-500">
                      {a.tenantEmail && (
                        <span className="flex items-center gap-1"><Mail size={11} /> {a.tenantEmail}</span>
                      )}
                      {a.tenantPhone && (
                        <span className="flex items-center gap-1"><Phone size={11} /> {a.tenantPhone}</span>
                      )}
                    </div>
                    {isLandlordOrManager && a.tenantId && (
                      <TenantAccessButton
                        tenantId={a.tenantId}
                        propertyId={propertyId}
                        onRequest={() => requestAccessMutation.mutate(a.tenantId)}
                        isRequesting={requestAccessMutation.isPending}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState preset="general" title="No tenant history yet" description="Tenant history will appear here." compact />
          )
        ) : (
          <div className="space-y-4">
            {/* Reviews header with avg rating + create button */}
            <div className="flex items-center justify-between">
              {reviews.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} size={14} className={s <= Math.round(averageRating) ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'} />
                    ))}
                  </div>
                  <span className="text-sm font-bold text-primary-dark dark:text-white">{averageRating.toFixed(1)}</span>
                  <span className="text-xs text-muted dark:text-gray-400">({reviews.length} review{reviews.length !== 1 ? 's' : ''})</span>
                </div>
              )}
              {user?.activeRole === 'tenant' && (
                <Button size="sm" onClick={() => setShowCreateReview(true)}>
                  <Plus size={14} /> Write Review
                </Button>
              )}
            </div>

            {/* Reviews list */}
            {reviewsLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse rounded-lg border border-border/40 dark:border-[#252a3a]/40 p-4 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-[#252a3a] rounded w-1/3" />
                    <div className="h-3 bg-gray-200 dark:bg-[#252a3a] rounded w-full" />
                    <div className="h-3 bg-gray-200 dark:bg-[#252a3a] rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : reviews.length === 0 ? (
              <EmptyState preset="general" icon={<Star size={40} />} title="No reviews yet" description="Be the first to review this property." compact />
            ) : (
              <div className="space-y-3">
                {reviews.map((review) => (
                  <ReviewCard key={review.id} review={review} propertyId={propertyId} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateReview && (
        <CreateReviewModal propertyId={propertyId} onClose={() => setShowCreateReview(false)} />
      )}
    </Card>
  )
}
