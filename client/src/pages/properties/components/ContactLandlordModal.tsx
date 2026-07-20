import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Mail } from 'lucide-react'
import TextField from '@mui/material/TextField'
import { useProperty, useCreateConversation, useSendMessage } from '@/hooks/useApi'

interface ContactLandlordModalProps {
  open: boolean
  onClose: () => void
  title: string
}

export function ContactLandlordModal({ open, onClose, title }: ContactLandlordModalProps) {
  // Rendered on /properties/:id — the landlord id comes from the (already cached) property query
  const { id: propertyId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: property } = useProperty(propertyId ?? '')
  const createConversation = useCreateConversation()
  const sendMessage = useSendMessage()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    const text = message.trim()
    if (!text || !property?.landlordId) return
    setSending(true)
    setError(null)
    try {
      const conversation = await createConversation.mutateAsync({ participantId: property.landlordId, propertyId })
      await sendMessage.mutateAsync({ conversationId: conversation.id, text })
      setMessage('')
      onClose()
      navigate(`/messages?conversationId=${conversation.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Contact Landlord">
      <div className="flex flex-col gap-5">
        <p className="text-xs text-muted dark:text-gray-400">Send a message about this property.</p>
        <TextField
          label="Message"
          multiline
          rows={3}
          fullWidth
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Hi, I'm interested in "${title}".`}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {error && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || message.trim().length === 0}>
            <Mail size={14} /> {sending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
