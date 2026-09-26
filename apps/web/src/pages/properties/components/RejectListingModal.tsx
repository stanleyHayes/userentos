import type { Dispatch, SetStateAction } from 'react'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { REJECT_REASONS } from './propertyStatusMaps'

interface RejectListingModalProps {
  open: boolean
  onClose: () => void
  title: string
  reasonCode: string
  setReasonCode: Dispatch<SetStateAction<string>>
  reason: string
  setReason: Dispatch<SetStateAction<string>>
  onReject: () => void
  isPending: boolean
  isError: boolean
  errorMessage?: string
}

export function RejectListingModal({ open, onClose, title, reasonCode, setReasonCode, reason, setReason, onReject, isPending, isError, errorMessage }: RejectListingModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Reject Property Listing">
      <div className="flex flex-col gap-6">
        <p className="text-sm text-muted dark:text-gray-400">
          Provide a reason for rejecting <strong className="text-primary-dark dark:text-white">{title}</strong>.
        </p>
        {/* The API refuses a rejection without a reason code. */}
        <TextField
          select fullWidth size="small" label="Reason" value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value)}
          helperText="Required — the owner sees this"
          slotProps={{ inputLabel: { shrink: true } }}
        >
          {REJECT_REASONS.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
        </TextField>
        <Textarea
          id="reject-reason"
          label="Rejection Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why this listing is being rejected..."
          rows={4}
          aiContext="property listing rejection reason"
        />
        {isError && (
          <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">
            {errorMessage}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-danger hover:bg-danger/90"
            onClick={onReject}
            disabled={isPending || !reasonCode}
          >
            {isPending ? 'Rejecting...' : 'Reject Listing'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
