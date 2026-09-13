import { useState } from 'react'
import { api } from '@/lib/api'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/stores/toastStore'

export function ReportMessageButton({ messageId, targetType = 'message' }: { messageId: string; targetType?: 'message' | 'user' }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('offensive_content')
  const [details, setDetails] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    setPending(true); setError('')
    try {
      await api.post('/reports', { targetType, targetId: messageId, reason, details })
      setOpen(false)
      useToastStore.getState().addToast('Report received for moderation review.', 'success')
    } catch (error) { setError((error as Error).message) }
    finally { setPending(false) }
  }
  return <>
    <button type="button" className="text-xs underline mt-1" onClick={() => setOpen(true)}>{targetType === 'user' ? 'Report user' : 'Report message'}</button>
    <Modal open={open} onClose={() => { if (!pending) setOpen(false) }} title={targetType === 'user' ? 'Report user' : 'Report message'}>
      <p className="text-sm mb-4">The moderation team will review your report. You can also block this contact from the conversation header.</p>
      <label className="block mb-4">Reason<select aria-label="Report reason" className="block w-full border rounded p-2 bg-transparent" value={reason} onChange={event => setReason(event.target.value)}>
        <option value="offensive_content">Abuse or offensive content</option><option value="spam">Spam</option><option value="scam_or_fraud">Scam or fraud</option><option value="illegal">Illegal content</option><option value="other">Other</option>
      </select></label>
      <label className="block mb-4">Additional details (optional)<textarea aria-label="Report details" className="block w-full border rounded p-2 bg-transparent" value={details} maxLength={2000} onChange={event => setDetails(event.target.value)} /></label>
      {error && <p role="alert" className="text-red-600 mb-3">{error}</p>}
      <Button disabled={pending} onClick={submit}>{pending ? 'Submitting…' : 'Submit report'}</Button>
    </Modal>
  </>
}
