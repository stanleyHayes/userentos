import { useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { useUploadPropertyImages } from '@/hooks/useApi'
import { Send, MessageSquare } from 'lucide-react'
import type { ListingStatus } from '@/types'

interface OwnerActionsProps {
  propertyId: string
  listingStatus: ListingStatus
  rejectionReason?: string
  publishErrors: { field: string; message: string }[]
  onPublish: () => void
  isPublishing: boolean
  onMessageReviewer: () => void
  messagingReviewer: boolean
}

export function OwnerActions({ propertyId, listingStatus, rejectionReason, publishErrors, onPublish, isPublishing, onMessageReviewer, messagingReviewer }: OwnerActionsProps) {
  const qc = useQueryClient()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const uploadImages = useUploadPropertyImages()

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
          <Button className="w-full" onClick={onPublish} disabled={isPublishing}>
            <Send size={14} /> {isPublishing ? 'Resubmitting...' : 'Edit & Resubmit'}
          </Button>
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
    </div>
  )
}
