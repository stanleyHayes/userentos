import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Loader2, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface Worker {
  _id: string
  name: string
  phone: string
  trades: string[]
  hourlyRate?: number
}

interface MaintenancePrefill {
  id: string
  title: string
  description: string
  category: string
}

interface BookingModalProps {
  worker: Worker
  onClose: () => void
  onSuccess?: () => void
  prefill?: MaintenancePrefill
}

const BOOKING_TYPES = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'repair', label: 'Repair' },
  { value: 'installation', label: 'Installation' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'other', label: 'Other' },
]

function mapCategoryToType(category: string): string {
  const map: Record<string, string> = {
    plumbing: 'repair',
    electrical: 'repair',
    structural: 'maintenance',
    pest: 'maintenance',
    appliance: 'repair',
    security: 'installation',
    other: 'maintenance',
  }
  return map[category] || 'maintenance'
}

export function BookingModal({ worker, onClose, onSuccess, prefill }: BookingModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    type: prefill ? mapCategoryToType(prefill.category) : 'maintenance' as string,
    description: prefill ? `[From maintenance request: ${prefill.title}]\n\n${prefill.description}` : '',
    scheduledDate: '',
    scheduledTime: '',
    estimatedCost: undefined as number | undefined,
  })

  async function handleSubmit() {
    if (!form.description.trim()) {
      toast.error('Please describe the work needed')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/service-bookings', {
        workerId: worker._id,
        type: form.type,
        description: form.description,
        scheduledDate: form.scheduledDate || undefined,
        scheduledTime: form.scheduledTime || undefined,
        estimatedCost: form.estimatedCost,
        maintenanceRequestId: prefill?.id,
      })
      setSubmitted(true)
      onSuccess?.()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Book ${worker.name}`}>
      {submitted ? (
        <div className="text-center py-6">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-primary-dark dark:text-white mb-1">Booking Request Sent!</h3>
          <p className="text-sm text-muted mb-4">{worker.name} will review your request and respond shortly.</p>
          <Button onClick={onClose}>Close</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            {worker.trades?.[0] && <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">{worker.trades[0]}</span>}
            {worker.hourlyRate && <span>GHS {worker.hourlyRate}/hr</span>}
          </div>

          <Select
            id="booking-type"
            label="Service Type"
            value={form.type}
            onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
            options={BOOKING_TYPES}
          />

          <Textarea
            id="booking-desc"
            label="Describe the work needed"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="e.g. Kitchen sink is leaking. Need plumber to fix the pipe under the sink."
            rows={4}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              id="booking-date"
              label="Preferred Date"
              type="date"
              value={form.scheduledDate}
              onChange={e => setForm(p => ({ ...p, scheduledDate: e.target.value }))}
            />
            <Input
              id="booking-time"
              label="Preferred Time"
              type="time"
              value={form.scheduledTime}
              onChange={e => setForm(p => ({ ...p, scheduledTime: e.target.value }))}
            />
          </div>

          <Input
            id="booking-cost"
            label="Your Budget (GHS)"
            type="number"
            value={String(form.estimatedCost ?? '')}
            onChange={e => setForm(p => ({ ...p, estimatedCost: e.target.value ? Number(e.target.value) : undefined }))}
            placeholder="Optional"
          />

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
              {submitting ? <><Loader2 size={16} className="animate-spin mr-2" /> Sending...</> : 'Send Request'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
