import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  AdminPagination,
  AdminStatCard,
  AdminStatGrid,
  AdminTableCard,
  AdminToolbar,
} from '@/components/admin/AdminPagePrimitives'
import { adminTableClassName } from '@/components/admin/adminPageUtils'
import { useAdminAuditLog, type AuditLogEntry } from '@/hooks/useAdminAuditLog'
import toast from 'react-hot-toast'
import { Check, Copy, FileSearch, Fingerprint, ScrollText, Shield, UserRound } from 'lucide-react'

/** Seconds matter: bulk writes land in the same minute and the order is the evidence. */
const TIMESTAMP = new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'medium' })

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : TIMESTAMP.format(d)
}

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const days = Math.floor(ms / 86_400_000)
  if (days >= 1) return `${days}d ago`
  const hrs = Math.floor(ms / 3_600_000)
  if (hrs >= 1) return `${hrs}h ago`
  const mins = Math.floor(ms / 60_000)
  return `${Math.max(1, mins)}m ago`
}

function humanise(value: string): string {
  return value.replaceAll('_', ' ').replaceAll('.', ' · ')
}

/**
 * Writers store details as either a plain sentence or a JSON blob. Pretty-print
 * the JSON so an expanded row is readable, but never alter the text otherwise —
 * what is on screen has to be what was recorded.
 */
function presentDetails(details: string): string {
  try {
    const parsed: unknown = JSON.parse(details)
    if (parsed !== null && typeof parsed === 'object') return JSON.stringify(parsed, null, 2)
  } catch {
    // Not JSON. Show it exactly as written.
  }
  return details
}

/** Past this, a details blob starts pushing every other column off the page. */
const DETAILS_PREVIEW_LENGTH = 140

function DetailsCell({ details, expanded, onToggle }: { details: string | null; expanded: boolean; onToggle: () => void }) {
  if (!details) return <span className="text-xs text-muted dark:text-gray-600">No details recorded</span>

  const text = presentDetails(details)
  const isLong = text.length > DETAILS_PREVIEW_LENGTH || text.includes('\n')

  // Audit rows are evidence, so nothing is clipped by CSS — a long value is cut
  // only behind an explicit control that says so and gives the rest back.
  if (!isLong) {
    return <p className="whitespace-pre-wrap break-words text-xs text-primary-dark dark:text-gray-300">{text}</p>
  }

  return (
    <div className="space-y-1.5">
      {expanded ? (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-2 font-mono text-[11px] leading-relaxed text-primary-dark dark:bg-white/[0.04] dark:text-gray-300">
          {text}
        </pre>
      ) : (
        <p className="whitespace-pre-wrap break-words text-xs text-primary-dark dark:text-gray-300">
          {text.slice(0, DETAILS_PREVIEW_LENGTH)}…
        </p>
      )}
      <button
        type="button"
        onClick={onToggle}
        className="focus-ring rounded-full text-[11px] font-bold text-primary hover:underline dark:text-blue-400"
      >
        {expanded ? 'Show less' : `Show all ${text.length.toLocaleString()} characters`}
      </button>
    </div>
  )
}

/**
 * The audit trail (spec §15).
 *
 * Built for one job: someone is tracing an incident and has a name, a date or an
 * entity ID to go on. Filters narrow the trail, and every row hands back the
 * entity ID — the key you carry to the next screen — as a single click.
 */
export function AdminAuditLogPage() {
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [actorInput, setActorInput] = useState('')
  const [actorId, setActorId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  // The actor box takes a pasted ID, so debounce it rather than firing a request
  // per keystroke while someone types 24 hex characters.
  useEffect(() => {
    const next = actorInput.trim()
    if (next === actorId) return
    const timer = window.setTimeout(() => {
      setActorId(next)
      setPage(1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [actorInput, actorId])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(null), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  const params = useMemo(
    () => ({ page, entityType, action, userId: actorId, from, to }),
    [page, entityType, action, actorId, from, to],
  )
  const { data, isLoading, isFetching } = useAdminAuditLog(params)

  const items = useMemo(() => data?.items ?? [], [data?.items])
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1
  const hasFilters = Boolean(entityType || action || actorId || from || to)

  const distinctActors = useMemo(() => new Set(items.map((l) => l.userId)).size, [items])

  // A filter can outlive its vocabulary entry only while the first response is in
  // flight; keep the selected value in the list so the control never reads blank.
  const entityTypeOptions = useMemo(() => buildOptions(data?.entityTypes, entityType, 'All entity types'), [data?.entityTypes, entityType])
  const actionOptions = useMemo(() => buildOptions(data?.actions, action, 'All actions'), [data?.actions, action])

  async function copyEntityId(log: AuditLogEntry) {
    try {
      // navigator.clipboard is undefined over plain http and throws when denied.
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(log.entityId)
      setCopied(log.id)
      toast.success('Entity ID copied')
    } catch {
      toast.error('Could not copy — select the ID and copy it manually')
    }
  }

  function toggleDetails(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  /**
   * Every narrowing invalidates the page number — page 4 of the old result set
   * is a different slice of the new one — so each filter resets it together
   * with the value.
   */
  function applyFilter(setter: (value: string) => void, value: string) {
    setter(value)
    setPage(1)
  }

  function resetFilters() {
    setEntityType('')
    setAction('')
    setActorInput('')
    setFrom('')
    setTo('')
    setPage(1)
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Platform admin"
        title="Audit Log"
        description="Every recorded write, in order, with the actor, the entity it touched and the address it came from."
        icon={<ScrollText size={22} />}
        accent="#6366f1"
        meta={`${total.toLocaleString()} events • Page ${page} of ${totalPages}`}
      />

      <AdminStatGrid>
        <AdminStatCard
          label="Events matched"
          value={total.toLocaleString()}
          description={hasFilters ? 'Across every page of the current filter.' : 'Every event the platform has recorded.'}
          icon={<Shield size={18} />}
          accent="#6366f1"
        />
        <AdminStatCard
          label="On this page"
          value={items.length.toLocaleString()}
          description={items.length ? `Newest is ${relativeAge(items[0].createdAt)}.` : 'Nothing on this page.'}
          icon={<ScrollText size={18} />}
          accent="#60a5fa"
        />
        <AdminStatCard
          label="Distinct actors"
          value={distinctActors.toLocaleString()}
          description="Separate accounts behind the events listed below."
          icon={<UserRound size={18} />}
          accent="#f59e0b"
        />
        <AdminStatCard
          label="Action types"
          value={(data?.actions.length ?? 0).toLocaleString()}
          description={`${(data?.entityTypes.length ?? 0).toLocaleString()} entity types have ever been written to the log.`}
          icon={<Fingerprint size={18} />}
          accent="#10b981"
        />
      </AdminStatGrid>

      <AdminToolbar
        title="Trace filters"
        description="Narrow by entity, action, actor or date range. Both dates are inclusive."
        resultLabel={isFetching ? 'Updating…' : `${items.length.toLocaleString()} of ${total.toLocaleString()}`}
      >
        <div className="w-full sm:w-44">
          <Select
            id="audit-entity-type"
            label="Entity type"
            value={entityType}
            onChange={(e) => applyFilter(setEntityType, e.target.value)}
            options={entityTypeOptions}
          />
        </div>
        <div className="w-full sm:w-44">
          <Select
            id="audit-action"
            label="Action"
            value={action}
            onChange={(e) => applyFilter(setAction, e.target.value)}
            options={actionOptions}
          />
        </div>
        <div className="w-full sm:w-56">
          <Input
            id="audit-actor"
            label="Actor user ID"
            value={actorInput}
            onChange={(e) => setActorInput(e.target.value)}
            placeholder="Paste an ID, or click an actor"
          />
        </div>
        <div className="w-full sm:w-40">
          <Input id="audit-from" label="From" type="date" value={from} onChange={(e) => applyFilter(setFrom, e.target.value)} max={to || undefined} />
        </div>
        <div className="w-full sm:w-40">
          <Input id="audit-to" label="To" type="date" value={to} onChange={(e) => applyFilter(setTo, e.target.value)} min={from || undefined} />
        </div>
        <Button variant="outline" size="sm" onClick={resetFilters} disabled={!hasFilters}>
          Reset
        </Button>
      </AdminToolbar>

      {isLoading ? (
        <AdminLoadingState title="Loading the audit trail" description="Reading recorded events and resolving the accounts behind them." rows={8} cols={6} />
      ) : items.length === 0 ? (
        <AdminEmptyState
          title="No events match"
          description={hasFilters ? 'Nothing was recorded under these filters. Widen the date range or clear a filter.' : 'The audit log is empty.'}
          icon={<FileSearch size={22} />}
        />
      ) : (
        // Dimmed while refetching so nobody reads the previous filter's rows as
        // the answer to the one they just typed.
        <div className={isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={isFetching}>
          <AdminTableCard
            title="Recorded events"
            description="Newest first. Entity IDs are copyable — that is the key you carry into the rest of the admin tools."
          >
            <table className={adminTableClassName('min-w-[1120px]')}>
              <thead>
                <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted dark:border-[#252a3a]/70 dark:text-gray-500">
                  <th className="px-4 py-3 font-bold">When</th>
                  <th className="px-4 py-3 font-bold">Actor</th>
                  <th className="px-4 py-3 font-bold">Action</th>
                  <th className="px-4 py-3 font-bold">Entity</th>
                  <th className="px-4 py-3 font-bold">Details</th>
                  <th className="px-4 py-3 font-bold">IP address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 dark:divide-[#252a3a]/50">
                {items.map((log) => (
                  <tr key={log.id} className="align-top transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="font-semibold text-primary-dark dark:text-white">{formatTimestamp(log.createdAt)}</div>
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">{relativeAge(log.createdAt)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setActorInput(log.userId)}
                        title="Filter to this actor"
                        className="focus-ring rounded-lg text-left font-semibold text-primary-dark hover:text-primary dark:text-white dark:hover:text-blue-400"
                      >
                        {log.user ? log.user.name : log.userId}
                      </button>
                      <div className="mt-1 break-all text-[11px] text-muted dark:text-gray-500">
                        {log.user ? log.user.email : 'No account on record for this writer'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge className="text-[10px] font-semibold">{humanise(log.action)}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-muted dark:text-gray-500">{humanise(log.entityType)}</div>
                      {log.entityId ? (
                        <button
                          type="button"
                          onClick={() => copyEntityId(log)}
                          title="Copy entity ID"
                          className="focus-ring mt-1.5 inline-flex items-start gap-1.5 rounded-lg border border-border/60 bg-surface px-2 py-1 text-left font-mono text-[11px] text-primary-dark transition-colors hover:border-primary/40 hover:text-primary dark:border-[#252a3a] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:border-blue-400/40"
                        >
                          <span className="break-all">{log.entityId}</span>
                          {copied === log.id ? (
                            <Check size={12} className="mt-0.5 shrink-0 text-success" />
                          ) : (
                            <Copy size={12} className="mt-0.5 shrink-0 opacity-60" />
                          )}
                        </button>
                      ) : (
                        <div className="mt-1.5 text-[11px] text-muted dark:text-gray-600">No entity ID recorded</div>
                      )}
                    </td>
                    <td className="min-w-[260px] max-w-[420px] px-4 py-4">
                      <DetailsCell details={log.details} expanded={expanded.has(log.id)} onToggle={() => toggleDetails(log.id)} />
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-mono text-[11px] text-muted dark:text-gray-400">{log.ipAddress ?? 'Not captured'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableCard>
        </div>
      )}

      <AdminPagination
        page={page}
        totalPages={totalPages}
        onPrevious={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      />
    </div>
  )
}

function buildOptions(vocabulary: string[] | undefined, selected: string, allLabel: string) {
  const values = vocabulary ?? []
  const withSelected = selected && !values.includes(selected) ? [selected, ...values] : values
  return [{ value: '', label: allLabel }, ...withSelected.map((v) => ({ value: v, label: humanise(v) }))]
}
