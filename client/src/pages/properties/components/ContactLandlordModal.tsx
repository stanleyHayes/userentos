import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Mail } from 'lucide-react'
import TextField from '@mui/material/TextField'

interface ContactLandlordModalProps {
  open: boolean
  onClose: () => void
  title: string
}

export function ContactLandlordModal({ open, onClose, title }: ContactLandlordModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Contact Landlord">
      <div className="flex flex-col gap-5">
        <p className="text-xs text-muted dark:text-gray-400">Send a message about this property.</p>
        <TextField label="Message" multiline rows={3} fullWidth placeholder={`Hi, I'm interested in "${title}".`} slotProps={{ inputLabel: { shrink: true } }} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onClose}><Mail size={14} /> Send</Button>
        </div>
      </div>
    </Modal>
  )
}
