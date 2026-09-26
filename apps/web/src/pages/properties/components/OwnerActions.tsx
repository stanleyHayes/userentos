import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { useUploadPropertyImages } from '@/hooks/useApi'
import { Send, MessageSquare, MapPin, Pencil } from 'lucide-react'
import { SetLocationModal } from './SetLocationModal'
import { EditListingModal, type EditableListing } from './EditListingModal'
import type { ListingStatus } from '@/types'

interface OwnerActionsProps {
  propertyId: string
  listingStatus: ListingStatus
  coordinates?: { lat: number; lng: number }
  rejectionReason?: string
  /** What a reviewer asked the owner to fix ('changes_requested'). */
  reviewIssues?: string[]
  /** Current content, for the edit form offered after a rejection or change request. */
  listing: EditableListing
  publishErrors: { field: string; message: string }[]
  onPublish: () => void
  isPublishing: boolean
  onMessageReviewer: () => void
  messagingReviewer: boolean
}

export function OwnerActions({ propertyId, listingStatus, coordinates, rejectionReason, reviewIssues, listing, publishErrors, onPublish, isPublishing, onMessageReviewer, messagingReviewer }: OwnerActionsProps) {
  const qc = useQueryClient()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const uploadImages = useUploadPropertyImages()
  const [locationOpen, setLocationOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  // Fix what the reviewer raised, then send it back: two steps, two buttons.
  const editAndResubmit = (
    <>
      <Button variant="outline" className="w-full" onClick={() => setEditOpen(true)}>
        <Pencil size={14} /> Edit listing
      </Button>
      <Button className="w-full" onClick={onPublish} disabled={isPublishing}>
        <Send size={14} /> {isPublishing ? 'Resubmitting...' : 'Resubmit for review'}
      </Button>
    </>
  )

  return (
    <div className="space-y-2">
      <input
        ref={imageInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 0) {
            uploadImages.mutate({ id: propertyId, files }, {
              onSuccess: () => qc.invalidateQueries({ queryKey: ['property', propertyId] }),
            })
          }
          e.target.value = ''
        }}
      />
      <Button variant="outline" className="w-full" onClick={() => imageInputRef.current?.click()} disabled={uploadImages.isPending}>
        {uploadImages.isPending ? 'Uploading...' : 'Upload Images'}
      </Button>
      {listingStatus === 'draft' && (
        <Button className="w-full" onClick={onPublish} disabled={isPublishing}>
          <Send size={14} /> {isPublishing ? 'Publishing...' : 'Publish for Review'}
        </Button>
      )}
      {listingStatus === 'rejected' && (
        <div className="space-y-2">
          <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
            <p className="font-semibold">Rejection Reason:</p>
            <p>{rejectionReason || 'No reason provided'}</p>
          </div>
          {editAndResubmit}
        </div>
      )}
      {listingStatus === 'changes_requested' && (
        <div className="space-y-2">
          <div className="rounded-xl bg-warning/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <p className="font-semibold">Changes requested</p>
            {rejectionReason && <p className="mt-1">{rejectionReason}</p>}
            {(reviewIssues?.length ?? 0) > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {reviewIssues!.map((issue, i) => <li key={i}>{issue}</li>)}
              </ul>
            )}
          </div>
          {editAndResubmit}
        </div>
      )}
      {publishErrors.length > 0 && (
        <div className="space-y-1 rounded-xl bg-danger/10 p-3 text-xs text-danger">
          <p className="font-semibold">Please fix the following before publishing:</p>
          {publishErrors.map((e, i) => <p key={i}>- {e.message}</p>)}
        </div>
      )}
      {listingStatus === 'pending_review' && (
        <Button variant="outline" className="w-full" onClick={onMessageReviewer} disabled={messagingReviewer}>
          <MessageSquare size={14} /> {messagingReviewer ? 'Opening chat...' : 'Message Reviewer'}
        </Button>
      )}

      <Button variant="outline" className="w-full" onClick={() => setLocationOpen(true)}>
        <MapPin size={14} /> {coordinates ? 'Move Map Pin' : 'Set Map Location'}
      </Button>
      {!coordinates && (
        <p className="text-center text-xs text-muted dark:text-gray-500">
          Not on the property map yet — drop a pin so tenants can find it.
        </p>
      )}

      {editOpen && (
        <EditListingModal open={editOpen} onClose={() => setEditOpen(false)} propertyId={propertyId} listing={listing} />
      )}
      <SetLocationModal
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        propertyId={propertyId}
        current={coordinates}
      />
    </div>
  )
}
