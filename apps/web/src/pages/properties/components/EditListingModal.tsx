import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import TextField from '@mui/material/TextField'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useUpdateProperty } from '@/hooks/useApi'

export interface EditableListing {
  title: string
  description: string
  rentAmount: number
  rules?: string[]
}

interface EditListingModalProps {
  open: boolean
  onClose: () => void
  propertyId: string
  listing: EditableListing
}

/**
 * Edits the parts of a listing a reviewer usually asks about (the wording,
 * the rent, the house rules). "Changes requested" and "Rejected" offered only
 * a resubmit button, so an owner told to state a service charge could not.
 * Saving a content change on an approved listing sends it back to review on
 * the server; here the owner resubmits it themselves.
 */
export function EditListingModal({ open, onClose, propertyId, listing }: EditListingModalProps) {
  const [title, setTitle] = useState(listing.title)
  const [description, setDescription] = useState(listing.description)
  const [rent, setRent] = useState(String(listing.rentAmount ?? ''))
  const [rules, setRules] = useState((listing.rules ?? []).join('\n'))
  const updateProperty = useUpdateProperty()
  const qc = useQueryClient()

  const rentAmount = Number(rent)
  const invalid = !title.trim() || !description.trim() || !(rentAmount > 0)

  function save() {
    if (invalid) return
    updateProperty.mutate({
      id: propertyId,
      title: title.trim(),
      description: description.trim(),
      rentAmount,
      rules: rules.split('\n').map((r) => r.trim()).filter(Boolean),
    }, {
      onSuccess: () => {
        toast.success('Listing updated. Resubmit it when you are ready.')
        qc.invalidateQueries({ queryKey: ['property', propertyId] })
        onClose()
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save the listing'),
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit listing" className="max-w-2xl">
      <div className="space-y-4">
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth required />
        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          required
          multiline
          minRows={5}
          helperText="Include anything a reviewer asked you to state, such as service charges or what the rent covers."
        />
        <TextField
          label="Monthly rent (GHS)"
          type="number"
          value={rent}
          onChange={(e) => setRent(e.target.value)}
          fullWidth
          required
          slotProps={{ htmlInput: { min: 1, inputMode: 'decimal' } }}
          error={rent !== '' && !(rentAmount > 0)}
        />
        <TextField
          label="House rules (one per line)"
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          fullWidth
          multiline
          minRows={3}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={invalid || updateProperty.isPending}>
            {updateProperty.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
