import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Mail } from 'lucide-react'
import TextField from '@mui/material/TextField'
import { useCreateLead } from '@/hooks/useAgent'
import { isContactBlocked } from '@/lib/contactProtection'
import { ContactBlockedNotice } from '@/components/trust/ContactBlockedNotice'

interface ContactLandlordModalProps {
  open: boolean
  onClose: () => void
  title: string
}

/** The enquiry endpoint's limit. */
const MAX_LENGTH = 500

/**
 * "Message on RentOS" about a listing. The message goes through the enquiry
 * endpoint, like "I'm interested": it is screened for contact details, reaches
 * whoever handles the listing (the owner, their agent or a delegate), becomes
 * a lead and alerts them by SMS. It used to open a plain chat with the owner,
 * so no lead was recorded and a delegated agent never heard about it.
 */
export function ContactLandlordModal({ open, onClose, title }: ContactLandlordModalProps) {
  // Rendered on /properties/:id
  const { id: propertyId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const send = useCreateLead()
  const [message, setMessage] = useState('')
  const blocked = isContactBlocked(send.error) ? send.error : null

  async function handleSend() {
    const text = message.trim()
    if (!text || !propertyId) return
    try {
      const lead = await send.mutateAsync({ propertyId, message: text })
      setMessage('')
      onClose()
      toast.success('Sent. The reply will arrive in your RentOS messages.')
      const conversationId = (lead as { conversationId?: string }).conversationId
      navigate(conversationId ? `/messages?conversationId=${conversationId}` : '/messages')
    } catch {
      // A stopped message is explained below and keeps its text; other errors toast from the hook.
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Message on RentOS">
      <div className="flex flex-col gap-5">
        <p className="text-xs text-muted dark:text-gray-400">Your message goes to whoever handles this listing. Your phone number stays private, and the reply arrives in your RentOS messages.</p>
        <TextField
          label="Message"
          multiline
          rows={3}
          fullWidth
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
          placeholder={`Hi, I'm interested in "${title}".`}
          helperText={`${message.length}/${MAX_LENGTH}`}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: MAX_LENGTH } }}
        />
        {blocked && <ContactBlockedNotice error={blocked} onDismiss={() => send.reset()} />}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void handleSend()} disabled={send.isPending || message.trim().length === 0}>
            <Mail size={14} /> {send.isPending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
