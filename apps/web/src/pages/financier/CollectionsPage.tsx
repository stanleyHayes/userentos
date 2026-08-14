import { useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { DoodleUnderline } from '@/components/ui/Doodles'
import {
  useFinancierCollections,
  useSendCollectionsReminder,
  useMarkContractDefaulted,
  useAddContractNote,
} from '@/hooks/useApi'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'
import { AlertTriangle, BellRing, FileWarning, MessageSquarePlus } from 'lucide-react'
import type { FinancingContractStatus } from '@/types'

const filterChips: { value: 'all' | 'in_grace' | 'in_arrears' | 'defaulted'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in_grace', label: 'In Grace' },
  { value: 'in_arrears', label: 'In Arrears' },
  { value: 'defaulted', label: 'Defaulted' },
]

const statusVariant: Record<FinancingContractStatus, 'muted' | 'warning' | 'danger' | 'success' | 'default'> = {
  pending_disbursement: 'muted',
  active: 'success',
  in_grace: 'warning',
  in_arrears: 'danger',
  closed: 'muted',
  defaulted: 'danger',
  settled: 'success',
}

export function CollectionsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialStatus = searchParams.get('status') as 'in_grace' | 'in_arrears' | 'defaulted' | null
  const [filter, setFilter] = useState<'all' | 'in_grace' | 'in_arrears' | 'defaulted'>(initialStatus ?? 'all')
  const { attach: pillAttach, style: pillStyle, visible: pillVisible } = useSlidingIndicator<HTMLDivElement>(filter)

  const queryStatus = filter === 'all' ? undefined : filter
  const { data, isLoading } = useFinancierCollections(queryStatus)
  const items = useMemo(() => data?.items ?? [], [data])

  const remind = useSendCollectionsReminder()
  const markDefaulted = useMarkContractDefaulted()
  const addNote = useAddContractNote()

  const [noteModalId, setNoteModalId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [confirmDefault, setConfirmDefault] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  function changeFilter(next: typeof filter) {
    setFilter(next)
    if (next === 'all') {
      searchParams.delete('status')
    } else {
      searchParams.set('status', next)
    }
    setSearchParams(searchParams, { replace: true })
  }

  function handleRemind(id: string) {
    remind.mutate(id, {
      onSuccess: () => setStatusMsg('Reminder sent.'),
      onError: (err) => setStatusMsg(err instanceof Error ? err.message : 'Failed to send reminder.'),
    })
  }

  function handleMarkDefaulted() {
    if (!confirmDefault) return
    markDefaulted.mutate({ id: confirmDefault }, {
      onSuccess: () => {
        setStatusMsg('Contract marked as defaulted.')
        setConfirmDefault(null)
      },
      onError: (err) => setStatusMsg(err instanceof Error ? err.message : 'Failed to mark as defaulted.'),
    })
  }

  function handleAddNote() {
    if (!noteModalId || !noteText.trim()) return
    addNote.mutate(
      { id: noteModalId, text: noteText.trim() },
      {
        onSuccess: () => {
          setStatusMsg('Note added.')
          setNoteModalId(null)
          setNoteText('')
        },
        onError: (err) => setStatusMsg(err instanceof Error ? err.message : 'Failed to add note.'),
      }
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-dark dark:text-white">Collections</h1>
        <DoodleUnderline className="text-primary/10 dark:text-blue-400/10 w-32 pointer-events-none" />
        <p className="text-sm text-muted mt-1">Manage borrowers in grace, arrears, or default.</p>
      </div>

      {/* Filter chips */}
      <div ref={pillAttach} className="relative isolate flex flex-wrap gap-2">
        <span aria-hidden className="pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-primary shadow-sm transition-[transform,width,height] duration-300 ease-out" style={{ ...pillStyle, opacity: pillVisible ? 1 : 0 }} />
        {filterChips.map((c) => (
          <button
            key={c.value}
            data-tab-key={c.value}
            onClick={() => changeFilter(c.value)}
            className={
              'relative z-10 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ' +
              (filter === c.value
                ? 'text-white'
                : 'bg-surface dark:bg-[#161927] text-muted hover:bg-primary/10 dark:hover:bg-blue-500/15')
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      {statusMsg && (
        <div className="rounded-lg bg-primary/5 dark:bg-blue-500/10 border border-primary/20 dark:border-blue-500/30 px-4 py-2 text-sm text-primary-dark dark:text-blue-300 flex items-center justify-between">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg(null)} className="text-xs underline">dismiss</button>
        </div>
      )}

      {isLoading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle size={36} />}
          title="No collections cases"
          description="No contracts currently match this filter."
        />
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <Card key={row.id} className="hover:shadow-md transition-shadow">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => navigate(`/financing/contracts/${row.id}`)}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-primary-dark dark:text-white">
                      {row.applicantName ?? row.applicantId}
                    </h3>
                    <Badge variant={statusVariant[row.status]}>{row.status.replace('_', ' ')}</Badge>
                    {row.daysOverdue > 0 && (
                      <Badge variant="danger">{row.daysOverdue} day{row.daysOverdue === 1 ? '' : 's'} overdue</Badge>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-muted">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider">Oldest unpaid</div>
                      <div className="text-primary-dark dark:text-white text-sm">
                        {row.oldestUnpaidDueDate
                          ? `${formatDate(row.oldestUnpaidDueDate).split(',')[0]} · ${row.daysOverdue}d overdue`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider">Total outstanding</div>
                      <div className="text-primary-dark dark:text-white text-sm">
                        {formatCurrency(row.outstanding)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider">Last contact</div>
                      <div className="text-primary-dark dark:text-white text-sm">
                        {row.lastContactAt ? formatDate(row.lastContactAt) : 'Never'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider">Last reminder</div>
                      <div className="text-primary-dark dark:text-white text-sm">
                        {row.lastReminderAt ? formatDate(row.lastReminderAt) : 'Never'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRemind(row.id)}
                    disabled={remind.isPending}
                  >
                    <BellRing size={14} />
                    Send reminder
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNoteModalId(row.id)
                      setNoteText('')
                    }}
                  >
                    <MessageSquarePlus size={14} />
                    Add note
                  </Button>
                  {row.status !== 'defaulted' && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setConfirmDefault(row.id)}
                      disabled={markDefaulted.isPending}
                    >
                      <FileWarning size={14} />
                      Mark defaulted
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add note modal */}
      <Modal
        open={!!noteModalId}
        onClose={() => {
          setNoteModalId(null)
          setNoteText('')
        }}
        title="Add note"
      >
        <div className="space-y-4">
          <Textarea
            id="contract-note"
            label="Note"
            placeholder="Spoke with applicant. They will pay by Friday..."
            rows={5}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setNoteModalId(null)
                setNoteText('')
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddNote} disabled={!noteText.trim() || addNote.isPending}>
              Save note
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm default modal */}
      <Modal
        open={!!confirmDefault}
        onClose={() => setConfirmDefault(null)}
        title="Mark contract as defaulted?"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            This is a manual override and will notify both the applicant and you. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDefault(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleMarkDefaulted} disabled={markDefaulted.isPending}>
              Mark as defaulted
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
