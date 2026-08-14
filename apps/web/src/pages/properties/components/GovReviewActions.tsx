import { Button } from '@/components/ui/Button'
import { CheckCircle2, XCircle, MessageSquare } from 'lucide-react'

interface GovReviewActionsProps {
  onApprove: () => void
  onReject: () => void
  onMessageLandlord: () => void
  isPending: boolean
  messagingReviewer: boolean
  isError: boolean
  errorMessage?: string
}

export function GovReviewActions({ onApprove, onReject, onMessageLandlord, isPending, messagingReviewer, isError, errorMessage }: GovReviewActionsProps) {
  return (
    <div className="space-y-2">
      <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={onApprove} disabled={isPending}>
        <CheckCircle2 size={14} /> Approve Listing
      </Button>
      <Button variant="outline" className="w-full border-danger text-danger hover:bg-danger/10" onClick={onReject} disabled={isPending}>
        <XCircle size={14} /> Reject Listing
      </Button>
      <Button variant="outline" className="w-full" onClick={onMessageLandlord} disabled={messagingReviewer}>
        <MessageSquare size={14} /> {messagingReviewer ? 'Opening chat...' : 'Message Landlord'}
      </Button>
      {isError && (
        <p className="text-xs text-danger">{errorMessage}</p>
      )}
    </div>
  )
}
