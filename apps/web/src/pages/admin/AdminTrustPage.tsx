import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Loader2, Check, Undo2 } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { cn, formatDate } from '@/lib/utils'

interface Decision {
  id: string
  author: { id: string; name: string; roles: string[]; suspended: boolean }
  channel: string
  decision: 'ALLOW' | 'BLOCK'
  enforced: boolean
  mode: 'enforce' | 'shadow'
  basis?: string
  reasonCodes: string[]
  riskScore: number
  scores: { structure: number; intent: number; context: number }
  intentLabel?: string
  maskedExcerpt: string
  overrideOf?: string
  review: { status: 'pending' | 'appealed' | 'upheld' | 'overturned'; appealNote?: string; label?: string; note?: string; reviewedAt?: string }
  createdAt: string
}

interface Stats {
  days: number
  config: { mode: string; modelEnforcePercent: number; versions: { model: string; policy: string; normalizer: string; feature: string } }
  volume: { messagesSent: number; enforcedBlocks: number; shadowBlocks: number; nearMisses: number; blockRate: number }
  reasons: { code: string; count: number }[]
  channels: { channel: string; count: number }[]
  reviews: { upheld: number; overturned: number; overturnRate: number | null; appealsOpen: number }
  latencyMs: { p50: number | null; p95: number | null; p99: number | null }
  degraded: number
}

const VIEWS = [
  { key: 'appealed', label: 'Appeals', query: 'status=appealed' },
  { key: 'stopped', label: 'Stopped', query: 'decision=BLOCK&mode=enforce' },
  { key: 'shadow', label: 'Shadow', query: 'mode=shadow' },
  { key: 'near', label: 'Near misses', query: 'decision=ALLOW' },
  { key: 'upheld', label: 'Upheld', query: 'status=upheld' },
  { key: 'overturned', label: 'Overturned', query: 'status=overturned' },
] as const

const LABELS = ['NO_CONTACT', 'SHARE_CONTACT', 'REQUEST_CONTACT', 'MOVE_OFF_PLATFORM', 'DISCUSS_CONTACT_POLICY', 'BENIGN_CONTACT_REFERENCE'] as const
const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`)
const human = (code: string) => code.toLowerCase().replace(/_/g, ' ')

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="!p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted dark:text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-primary-dark dark:text-white">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted dark:text-gray-500">{hint}</p>}
    </Card>
  )
}

function DecisionCard({ item }: { item: Decision }) {
  const queryClient = useQueryClient()
  const [label, setLabel] = useState(item.review.label ?? '')
  const [note, setNote] = useState('')
  const review = useMutation({
    mutationFn: (outcome: 'upheld' | 'overturned') => api.post(`/trust/admin/decisions/${item.id}/review`, { outcome, ...(label ? { label } : {}), ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trust'] }),
  })
  const reviewed = item.review.status === 'upheld' || item.review.status === 'overturned'

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-primary-dark dark:text-white">
            {item.author.name}
            {item.author.suspended && <Badge variant="muted" className="ml-2 text-[10px]">Suspended</Badge>}
          </p>
          <p className="text-xs text-muted dark:text-gray-500">{item.author.roles.join(', ') || '—'} · {item.channel} · {formatDate(item.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={item.decision === 'BLOCK' ? (item.enforced ? 'warning' : 'default') : 'muted'} className="text-[10px]">
            {item.decision === 'BLOCK' ? (item.enforced ? 'Stopped' : item.overrideOf ? 'Let through (overturned)' : 'Shadow') : 'Near miss'}
          </Badge>
          {item.basis && <Badge variant="muted" className="text-[10px]">{item.basis}</Badge>}
          <Badge variant={reviewed ? 'success' : item.review.status === 'appealed' ? 'warning' : 'muted'} className="text-[10px] capitalize">{item.review.status}</Badge>
        </div>
      </div>

      {/* Masked: digits, emails, links and handles were removed before storage. */}
      <p className="neumorphic-inset rounded-lg px-3 py-2 font-mono text-xs leading-relaxed text-primary-dark dark:text-gray-300">{item.maskedExcerpt || '(empty)'}</p>

      <div className="flex flex-wrap gap-1.5">
        {item.reasonCodes.map((code) => (
          <span key={code} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary dark:bg-blue-500/15 dark:text-blue-300">{human(code)}</span>
        ))}
        <span className="text-[11px] text-muted dark:text-gray-500">
          risk {item.riskScore.toFixed(2)} · structure {item.scores.structure.toFixed(2)} · intent {item.scores.intent.toFixed(2)} · context {item.scores.context.toFixed(2)}{item.intentLabel ? ` · model: ${human(item.intentLabel)}` : ''}
        </span>
      </div>

      {item.review.appealNote && <p className="text-xs italic text-muted dark:text-gray-400">Appeal: “{item.review.appealNote}”</p>}
      {reviewed && item.review.note && <p className="text-xs text-muted dark:text-gray-400">Reviewer: {item.review.note}</p>}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/50 pt-3 dark:border-[#252a3a]/50">
        <select aria-label="Intent label for the dataset" value={label} onChange={(e) => setLabel(e.target.value)} className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-xs dark:border-[#252a3a]">
          <option value="">Label (optional)</option>
          {LABELS.map((l) => <option key={l} value={l}>{human(l)}</option>)}
        </select>
        <input aria-label="Reviewer note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2 py-1.5 text-xs dark:border-[#252a3a]" />
        <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate('upheld')}>
          {review.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Uphold
        </Button>
        <Button size="sm" disabled={review.isPending} onClick={() => review.mutate('overturned')}>
          <Undo2 size={13} /> Overturn
        </Button>
        {review.isError && <span className="text-xs text-danger">{(review.error as Error).message}</span>}
      </div>
    </Card>
  )
}

/**
 * Contact protection (TRUST-2): how the screen is doing, and the review queue.
 * Overturning lets the same text through for its author and removes the
 * strike; labels feed the next training set (docs/trust/LABELING_GUIDE.md).
 */
export function AdminTrustPage() {
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('appealed')
  const [page, setPage] = useState(1)
  const current = VIEWS.find((v) => v.key === view)!
  const stats = useQuery({ queryKey: ['trust', 'stats'], queryFn: () => api.get<Stats>('/trust/admin/stats?days=7') })
  const queue = useQuery({ queryKey: ['trust', 'decisions', view, page], queryFn: () => api.get<{ items: Decision[]; totalPages: number; total: number }>(`/trust/admin/decisions?${current.query}&page=${page}`) })
  const s = stats.data

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Trust & safety"
        title="Contact protection"
        description="Messages and text stopped for sharing contact details or moving deals off RentOS. Excerpts are masked: numbers, emails, links and handles are never stored."
        icon={<ShieldCheck size={22} />}
      />

      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Stat label="Messages sent (7 days)" value={s.volume.messagesSent.toLocaleString()} />
            <Stat label="Stopped" value={s.volume.enforcedBlocks.toLocaleString()} hint={`${pct(s.volume.blockRate)} of sends`} />
            <Stat label="Shadow" value={s.volume.shadowBlocks.toLocaleString()} hint="would have stopped" />
            <Stat label="Open appeals" value={String(s.reviews.appealsOpen)} />
            <Stat label="Overturn rate" value={pct(s.reviews.overturnRate)} hint={`${s.reviews.upheld} upheld · ${s.reviews.overturned} overturned`} />
            <Stat label="Latency p95" value={s.latencyMs.p95 === null ? '—' : `${s.latencyMs.p95.toFixed(1)} ms`} hint={s.degraded ? `${s.degraded} on fallback` : 'no fallbacks'} />
          </div>
          <Card className="!p-4">
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted dark:text-gray-400">
              <span>Mode <strong className="text-primary-dark dark:text-white">{s.config.mode}</strong></span>
              <span>Model-only blocks enforced for <strong className="text-primary-dark dark:text-white">{s.config.modelEnforcePercent}%</strong> of authors</span>
              <span>Model <code>{s.config.versions.model}</code></span>
              <span>Policy <code>{s.config.versions.policy}</code></span>
            </div>
            {s.reasons.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.reasons.map((r) => (
                  <span key={r.code} className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-primary-dark dark:bg-white/[0.04] dark:text-gray-200">{human(r.code)} · {r.count}</span>
                ))}
                {s.channels.map((c) => (
                  <span key={c.channel} className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">{c.channel} · {c.count}</span>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => { setView(v.key); setPage(1) }}
            className={cn('rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', view === v.key ? 'bg-primary text-white dark:bg-blue-500' : 'bg-surface text-muted hover:text-primary dark:bg-white/[0.04] dark:text-gray-400')}
          >
            {v.label}
          </button>
        ))}
      </div>

      {queue.isLoading ? (
        <ListSkeleton rows={4} />
      ) : !queue.data?.items.length ? (
        <EmptyState preset="general" title={view === 'appealed' ? 'No appeals waiting' : 'Nothing here'} description="Decisions appear here as the screen makes them." compact />
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {queue.data.items.map((item) => <DecisionCard key={item.id} item={item} />)}
          </div>
          {queue.data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-xs text-muted">Page {page} of {queue.data.totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= queue.data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
