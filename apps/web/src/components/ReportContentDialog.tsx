import { useState } from 'react'
import { createPortal } from 'react-dom'
import TextField from '@mui/material/TextField'
import { CheckCircle2, Flag, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Target types POST /reports accepts that the web app reports from outside
 * chat. A `review` is a property review; a `worker_review` is identified by
 * the service booking that carries the rating.
 */
export type ReportTargetType = 'property' | 'review' | 'business' | 'business_review' | 'worker' | 'worker_review'

export interface ReportTarget {
  type: ReportTargetType
  id: string
  /** What is being reported, in the viewer's words: "listing", "review", ... */
  noun: string
}

type Reason = 'scam_or_fraud' | 'misleading_listing' | 'not_available' | 'offensive_content' | 'spam' | 'duplicate' | 'illegal' | 'other'

const LISTING_REASONS: { value: Reason; label: string }[] = [
  { value: 'scam_or_fraud', label: 'Scam or fraud' },
  { value: 'misleading_listing', label: 'Misleading or inaccurate details' },
  { value: 'not_available', label: 'No longer available' },
  { value: 'duplicate', label: 'Duplicate listing' },
  { value: 'offensive_content', label: 'Offensive or abusive content' },
  { value: 'illegal', label: 'Illegal or discriminatory' },
  { value: 'other', label: 'Something else' },
]

const CONTENT_REASONS: { value: Reason; label: string }[] = [
  { value: 'offensive_content', label: 'Offensive, abusive or hateful' },
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'misleading_listing', label: 'False or misleading' },
  { value: 'scam_or_fraud', label: 'Scam or fraud' },
  { value: 'illegal', label: 'Illegal content' },
  { value: 'other', label: 'Something else' },
]

const DETAILS_LIMIT = 2000

/**
 * Report a listing, profile or review to the moderation queue (POST /reports):
 * pick a reason, optionally explain, then see an explicit confirmation.
 * Mirrors the mobile ReportContentModal so both apps collect the same thing.
 *
 * Rendered into document.body so it can open from inside another modal (the
 * local-services business sheet) without inheriting its stacking context.
 */
export function ReportContentDialog({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  if (!target) return null
  return createPortal(<ReportForm key={`${target.type}:${target.id}`} target={target} onClose={onClose} />, document.body)
}

function ReportForm({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const reasons = target.type === 'property' ? LISTING_REASONS : CONTENT_REASONS
  const [reason, setReason] = useState<Reason | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const needsDetails = reason === 'other' && details.trim().length < 5
  const canSubmit = !!reason && !needsDetails && !submitting

  async function submit() {
    if (!reason) { setError('Choose a reason for your report.'); return }
    if (needsDetails) { setError('Tell us briefly what is wrong.'); return }
    setSubmitting(true)
    setError('')
    try {
      const text = details.trim().slice(0, DETAILS_LIMIT)
      await api.post('/reports', { targetType: target.type, targetId: target.id, reason, ...(text ? { details: text } : {}) })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not send your report. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={() => { if (!submitting) onClose() }} title={sent ? 'Report sent' : `Report ${target.noun}`}>
      {sent ? (
        <div className="space-y-5">
          <div role="status" className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
            <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-emerald-500" />
            <p className="text-sm text-primary-dark dark:text-gray-200">
              Thanks. Our moderation team will review this {target.noun} and act on it if it breaks the RentOS rules.
            </p>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm text-muted dark:text-gray-400">Why are you reporting this {target.noun}?</legend>
            <div className="space-y-1.5">
              {reasons.map((r) => {
                const selected = reason === r.value
                return (
                  <label
                    key={r.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
                      selected
                        ? 'border-primary bg-primary/5 text-primary-dark dark:border-blue-400 dark:bg-blue-500/10 dark:text-white'
                        : 'border-border/70 text-primary-dark hover:border-primary/40 dark:border-[#252a3a] dark:text-gray-200',
                    )}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={r.value}
                      checked={selected}
                      onChange={() => { setReason(r.value); setError('') }}
                      className="h-4 w-4 accent-[#18345a] dark:accent-blue-400"
                    />
                    {r.label}
                  </label>
                )
              })}
            </div>
          </fieldset>
          <TextField
            label={reason === 'other' ? 'Details (required)' : 'Details (optional)'}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="What should our team know?"
            multiline
            rows={3}
            fullWidth
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: 1500 } }}
          />
          {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={() => void submit()} disabled={!canSubmit}>
              {submitting ? <Loader2 size={13} className="animate-spin" /> : <Flag size={13} />}
              Submit report
            </Button>
          </div>
          <p className="text-center text-xs text-muted dark:text-gray-500">
            Reports are confidential. The person you report is not told who reported them.
          </p>
        </div>
      )}
    </Modal>
  )
}

/**
 * A small "Report" link that opens the dialog. Callers decide whether to render
 * it: never for the viewer's own content (the API refuses those anyway).
 */
export function ReportContentButton({ target, label, className }: { target: ReportTarget; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const name = `Report ${target.noun}`
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        aria-label={name}
        className={cn('inline-flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-danger dark:text-gray-500', className)}
      >
        <Flag size={11} aria-hidden /> {label ?? name}
      </button>
      <ReportContentDialog target={open ? target : null} onClose={() => setOpen(false)} />
    </>
  )
}
