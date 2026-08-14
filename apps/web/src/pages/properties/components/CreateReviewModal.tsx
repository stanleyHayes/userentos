import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Switch } from '@/components/ui/Switch'
import { useCreateReview } from '@/hooks/useReviews'
import { StarRating } from './StarRating'
import { EyeOff } from 'lucide-react'

interface CreateReviewModalProps {
  propertyId: string
  onClose: () => void
}

export function CreateReviewModal({ propertyId, onClose }: CreateReviewModalProps) {
  const createReview = useCreateReview()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [prosText, setProsText] = useState('')
  const [consText, setConsText] = useState('')
  const [anonymous, setAnonymous] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (rating === 0) return
    const pros = prosText.split('\n').map((s) => s.trim()).filter(Boolean)
    const cons = consText.split('\n').map((s) => s.trim()).filter(Boolean)
    try {
      await createReview.mutateAsync({ propertyId, rating, comment, pros, cons, anonymous })
      onClose()
    } catch {
      // Error is displayed via mutation.isError
    }
  }

  return (
    <Modal open onClose={onClose} title="Write a Review" className="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Star rating */}
        <div>
          <label className="block text-sm font-semibold text-primary-dark dark:text-white mb-2">Rating</label>
          <StarRating value={rating} onChange={setRating} size={28} />
          {rating === 0 && <p className="text-xs text-muted dark:text-gray-500 mt-1">Click a star to rate</p>}
        </div>

        {/* Comment */}
        <Textarea
          id="review-comment"
          label="Your Review"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your experience living at this property..."
          required
          rows={4}
          minLength={10}
          aiContext="property review"
        />

        {/* Pros */}
        <Textarea
          id="review-pros"
          label="Pros (one per line)"
          value={prosText}
          onChange={(e) => setProsText(e.target.value)}
          placeholder={"Great location\nResponsive landlord\nQuiet neighborhood"}
          rows={3}
        />

        {/* Cons */}
        <Textarea
          id="review-cons"
          label="Cons (one per line)"
          value={consText}
          onChange={(e) => setConsText(e.target.value)}
          placeholder={"Parking can be tight\nWater pressure issues"}
          rows={3}
        />

        {/* Anonymous toggle */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Switch checked={anonymous} onChange={(v) => setAnonymous(v)} size="sm" />
          <div className="flex items-center gap-1.5">
            <EyeOff size={14} className="text-muted dark:text-gray-500" />
            <span className="text-sm text-gray-600 dark:text-gray-300">Post anonymously</span>
          </div>
        </label>

        {createReview.isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            {(createReview.error as Error).message}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={rating === 0 || createReview.isPending}>
            {createReview.isPending ? 'Submitting...' : 'Submit Review'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
