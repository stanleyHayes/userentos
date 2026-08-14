import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { formatDate } from '@/lib/utils'
import { useDeleteReview } from '@/hooks/useReviews'
import type { Review } from '@/hooks/useReviews'
import { StarRating } from './StarRating'
import { EyeOff, UserCircle, Trash2, ThumbsUp, ThumbsDown, Check, X as XIcon } from 'lucide-react'

interface ReviewCardProps {
  review: Review
  propertyId: string
}

export function ReviewCard({ review, propertyId }: ReviewCardProps) {
  const user = useAuthStore((s) => s.user)
  const deleteReview = useDeleteReview()
  const isOwn = review.userId === user?.id

  return (
    <div className="rounded-xl border border-border/40 dark:border-[#252a3a]/40 p-4 space-y-2.5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 dark:bg-blue-500/15">
            {review.anonymous ? (
              <EyeOff size={14} className="text-muted dark:text-gray-500" />
            ) : (
              <UserCircle size={14} className="text-primary dark:text-blue-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-primary-dark dark:text-white">
              {review.anonymous ? 'Anonymous Tenant' : review.userName ?? 'Tenant'}
            </p>
            <p className="text-[10px] text-muted dark:text-gray-500">{formatDate(review.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StarRating value={review.rating} size={12} />
          {isOwn && (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={() => deleteReview.mutate({ id: review.id, propertyId })}
              disabled={deleteReview.isPending}
            >
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      </div>

      {/* Comment */}
      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{review.comment}</p>

      {/* Pros & Cons */}
      {(review.pros.length > 0 || review.cons.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {review.pros.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-success uppercase tracking-wider flex items-center gap-1"><ThumbsUp size={10} /> Pros</span>
              {review.pros.map((pro, i) => (
                <p key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                  <Check size={10} className="text-success flex-shrink-0 mt-0.5" />{pro}
                </p>
              ))}
            </div>
          )}
          {review.cons.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-danger uppercase tracking-wider flex items-center gap-1"><ThumbsDown size={10} /> Cons</span>
              {review.cons.map((con, i) => (
                <p key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                  <XIcon size={10} className="text-danger flex-shrink-0 mt-0.5" />{con}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
