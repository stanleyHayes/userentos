import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

/**
 * Labelling real complaints so the classifier can stop being trained on
 * invented ones.
 *
 * The model is trained on phrasings we imagined. That ceiling cannot be
 * raised by writing more examples; it needs real ones, labelled by a person.
 * This is where that happens, and the scorecard at the top is the only
 * accuracy figure measured against what people actually wrote — the number in
 * train_legal.py is measured against text we wrote ourselves.
 *
 * The complaints shown here are redacted before storage: phone numbers,
 * emails, street and digital addresses and identifiers are removed on the way
 * in. They are still someone describing a dispute in their home, so treat
 * them accordingly.
 */

interface LabelInfo {
  key: string
  title: string
  law: string
  severity: 'high' | 'medium' | 'low'
}

interface Scorecard {
  windowDays: number
  labels: LabelInfo[]
  reviewed: number
  statutoryLabels: string[]
  precision: number
  recall: number
  falseAccusations: number
  lawfulReviewed: number
  perLabel: Record<string, { predicted: number; actual: number; correct: number }>
  note?: string
}

interface Complaint {
  _id: string
  text: string
  redacted: Record<string, number>
  predictedLabels: string[]
  scores: { label: string; probability: number; threshold: number }[]
  abstained: boolean
  source: string
  modelVersion?: string
  advanceVerdict?: 'violation' | 'lawful' | 'unclear'
  advanceMonths?: number
  reviewedLabels?: string[]
  reviewedAt?: string
  createdAt: string
}

function Stat({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: 'good' | 'bad'
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn(
        'font-display text-2xl font-extrabold',
        tone === 'good' && 'text-green-600 dark:text-green-400',
        tone === 'bad' && 'text-red-600 dark:text-red-400',
        !tone && 'text-primary dark:text-sky-300',
      )}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  )
}

function ReviewRow({ complaint, labels, statutory }: {
  complaint: Complaint
  labels: LabelInfo[]
  statutory: string[]
}) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string[]>(complaint.reviewedLabels ?? complaint.predictedLabels)
  const [note, setNote] = useState('')

  const submit = useMutation({
    mutationFn: () => api.post(`/ai/complaints/${complaint._id}/review`, { labels: selected, note: note || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['complaints'] })
      void queryClient.invalidateQueries({ queryKey: ['complaint-scorecard'] })
    },
  })

  const toggle = (key: string) =>
    setSelected(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]))

  const predicted = new Set(complaint.predictedLabels)

  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="text-sm leading-relaxed text-primary-dark dark:text-white">{complaint.text}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{new Date(complaint.createdAt).toLocaleString()}</span>
          <span>{complaint.source}</span>
          {complaint.abstained && (
            <span className="rounded bg-amber-100 px-1.5 py-px font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
              model abstained
            </span>
          )}
          {Object.entries(complaint.redacted ?? {}).map(([kind, n]) => (
            <span key={kind} className="text-muted/70">{n}&times; {kind} redacted</span>
          ))}
        </p>
        {complaint.advanceVerdict && (
          <p className="mt-1 text-xs text-muted">
            Statute: rent advance <strong>{complaint.advanceVerdict}</strong>
            {complaint.advanceMonths !== undefined && ` (${complaint.advanceMonths} months)`}
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          True labels — tick what the complaint actually describes
        </p>
        <div className="flex flex-wrap gap-2">
          {labels.map((label) => {
            const isOn = selected.includes(label.key)
            const wasPredicted = predicted.has(label.key)
            return (
              <button
                key={label.key}
                type="button"
                onClick={() => toggle(label.key)}
                title={label.law}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold transition',
                  isOn
                    ? 'border-primary bg-primary text-white'
                    : 'border-border/80 bg-surface/60 text-muted hover:border-primary/50 dark:border-white/10 dark:bg-white/[0.03]',
                )}
              >
                {label.title}
                {wasPredicted && <span className="ml-1 opacity-70">• predicted</span>}
                {statutory.includes(label.key) && <span className="ml-1 opacity-70">• statute</span>}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Tick nothing if the situation is lawful — that is the most valuable label there is,
          because a false accusation is the error this model is tuned to avoid.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for whoever rebuilds the corpus"
          className="flex-1 rounded-xl border border-border/80 bg-surface/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]"
        />
        <Button size="sm" onClick={() => submit.mutate()} disabled={submit.isPending}>
          {complaint.reviewedAt ? 'Update review' : 'Save review'}
        </Button>
      </div>
      {submit.isError && (
        <p className="text-xs text-red-600 dark:text-red-400">{(submit.error as Error).message}</p>
      )}
    </Card>
  )
}

export function AdminComplaintReviewPage() {
  const [unreviewedOnly, setUnreviewedOnly] = useState(true)
  const [abstainedOnly, setAbstainedOnly] = useState(false)

  const scorecard = useQuery({
    queryKey: ['complaint-scorecard'],
    queryFn: () => api.get<Scorecard>('/ai/complaints/scorecard?days=365'),
  })

  const complaints = useQuery({
    queryKey: ['complaints', unreviewedOnly, abstainedOnly],
    queryFn: () => api.get<{ items: Complaint[]; total: number }>(
      `/ai/complaints?limit=25&unreviewed=${unreviewedOnly}&abstained=${abstainedOnly}`,
    ),
  })

  const labels = scorecard.data?.labels ?? []
  const statutory = scorecard.data?.statutoryLabels ?? []

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-primary-dark dark:text-white">
          Complaint review
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          The rental-law classifier is trained on phrasings we wrote ourselves. Labelling real
          complaints here is how it learns the phrasings people actually use — and the scorecard
          below is the only accuracy figure measured against real text.
        </p>
        <p className="mt-1 max-w-3xl text-xs text-muted">
          Complaints are redacted before storage, but they are still people describing disputes in
          their homes.
        </p>
      </div>

      {scorecard.data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Reviewed" value={String(scorecard.data.reviewed)} hint="Only these can be scored" />
          <Stat
            label="Precision"
            value={scorecard.data.reviewed ? `${scorecard.data.precision}%` : '—'}
            hint="Of what the model claimed"
          />
          <Stat
            label="Recall"
            value={scorecard.data.reviewed ? `${scorecard.data.recall}%` : '—'}
            hint="Of what was actually there"
          />
          <Stat
            label="False accusations"
            value={scorecard.data.reviewed
              ? `${scorecard.data.falseAccusations}/${scorecard.data.lawfulReviewed}`
              : '—'}
            hint="Lawful situations the model flagged"
            tone={scorecard.data.falseAccusations > 0 ? 'bad' : 'good'}
          />
        </div>
      )}

      {scorecard.data?.note && (
        <Card className="border-amber-300/70 bg-amber-50 p-4 dark:border-amber-400/30 dark:bg-amber-400/10">
          <p className="text-sm text-amber-800 dark:text-amber-200">{scorecard.data.note}</p>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={unreviewedOnly ? 'primary' : 'outline'} onClick={() => setUnreviewedOnly(v => !v)}>
          {unreviewedOnly ? 'Unreviewed only' : 'All complaints'}
        </Button>
        <Button size="sm" variant={abstainedOnly ? 'primary' : 'outline'} onClick={() => setAbstainedOnly(v => !v)}>
          {abstainedOnly ? 'Abstentions only' : 'All confidences'}
        </Button>
      </div>

      <div className="space-y-4">
        {(complaints.data?.items ?? []).map((complaint) => (
          <ReviewRow key={complaint._id} complaint={complaint} labels={labels} statutory={statutory} />
        ))}
        {complaints.isSuccess && (complaints.data?.items ?? []).length === 0 && (
          <Card className="p-8 text-center text-sm text-muted">
            Nothing to review. Complaints appear here as people use the public rental-law checker.
          </Card>
        )}
      </div>
    </div>
  )
}
