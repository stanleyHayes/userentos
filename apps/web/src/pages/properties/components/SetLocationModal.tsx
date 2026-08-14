import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { LocationPicker, type Coordinates } from '@/components/map/LocationPicker'
import { useUpdateProperty } from '@/hooks/useApi'

interface SetLocationModalProps {
  open: boolean
  onClose: () => void
  propertyId: string
  current?: Coordinates
}

/**
 * Pins an existing listing. Properties created before the map — or by a
 * landlord who skipped the step — have no coordinates and are invisible on it
 * until this runs.
 */
export function SetLocationModal({ open, onClose, propertyId, current }: SetLocationModalProps) {
  const [picked, setPicked] = useState<Coordinates | undefined>(current)
  const updateProperty = useUpdateProperty()
  const qc = useQueryClient()

  function save() {
    if (!picked) { toast.error('Tap the map to drop a pin first'); return }
    updateProperty.mutate({ id: propertyId, coordinates: picked }, {
      onSuccess: () => {
        toast.success('Location saved')
        qc.invalidateQueries({ queryKey: ['property', propertyId] })
        qc.invalidateQueries({ queryKey: ['property-pins'] })
        onClose()
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save the location'),
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={current ? 'Move the pin' : 'Set the location'} className="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-muted dark:text-gray-400">
          The pin is what puts this property on the map and makes it findable in nearby searches.
        </p>

        <LocationPicker value={picked} onChange={setPicked} />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!picked || updateProperty.isPending}>
            {updateProperty.isPending ? 'Saving…' : 'Save location'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
