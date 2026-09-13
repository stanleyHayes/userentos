import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface Report {
  id: string; targetType: string; targetId: string; targetLabel?: string; reason: string; details?: string
  status: string; handledBy?: string; reporterName: string; ownerName?: string; createdAt: string
  canRestoreAccount?: boolean; resolutionNote?: string; pendingAction?: string; pendingNote?: string; action: string; openReportsForTarget: number
}
export function ContentReportsPage() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Report | null>(null)
  const [action, setAction] = useState('none')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const user = useAuthStore(state => state.user)
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['content-reports', status, page], queryFn: () => api.get<{ items: Report[]; total: number }>(`/reports/admin/queue?status=${status}&page=${page}&limit=25`) })
  async function claim(report: Report) {
    setPending(true); setError('')
    try {
      await api.post(`/reports/admin/${report.id}/claim`, {})
      setSelected({ ...report, status: 'reviewing', handledBy: user?.id })
      setAction('none'); setNote('')
      await queryClient.invalidateQueries({ queryKey: ['content-reports'] })
    } catch (error) { setError((error as Error).message) }
    finally { setPending(false) }
  }
  async function release(report: Report) {
    setPending(true); setError('')
    try {
      await api.post(`/reports/admin/${report.id}/release`, {})
      setSelected(null)
      await queryClient.invalidateQueries({ queryKey: ['content-reports'] })
    } catch (error) { setError((error as Error).message) }
    finally { setPending(false) }
  }
  async function takeover(report: Report) {
    setPending(true); setError('')
    try {
      await api.post(`/reports/admin/${report.id}/takeover`, {})
      await queryClient.invalidateQueries({ queryKey: ['content-reports'] })
    } catch (error) { setError((error as Error).message) }
    finally { setPending(false) }
  }
  async function resolve() {
    if (!selected) return
    setPending(true); setError('')
    try {
      await api.post(`/reports/admin/${selected.id}/${action === 'account_restored' ? 'restore-account' : 'resolve'}`, { action, note: note.trim() })
      setSelected(null)
      await queryClient.invalidateQueries({ queryKey: ['content-reports'] })
    } catch (error) { setError((error as Error).message); setSelected(null); await queryClient.invalidateQueries({ queryKey: ['content-reports'] }) }
    finally { setPending(false) }
  }
  return <div className="space-y-5">
    <PageHeader title="Content reports" description="Review reported content, record the evidence and resolve each concern." />
    <label>Status <select aria-label="Report status" className="border rounded p-2 bg-transparent" value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}>
      <option value="">Awaiting review</option><option value="open">Open</option><option value="reviewing">Claimed</option><option value="actioned">Actioned</option><option value="dismissed">Dismissed</option>
    </select></label>
    {(error || query.error) && <p role="alert" className="text-red-600">{error || (query.error as Error).message}</p>}
    {query.isLoading && <p role="status">Loading reports…</p>}
    {query.data?.items.length === 0 && <p>No reports in this queue.</p>}
    {query.data?.items.map(report => <Card key={report.id} className="p-5 space-y-3">
      <div className="flex flex-wrap justify-between gap-2"><strong>{report.targetType.replaceAll('_', ' ')} · {report.reason.replaceAll('_', ' ')}</strong><span>{report.status} · {new Date(report.createdAt).toLocaleString()}</span></div>
      <p className="whitespace-pre-wrap break-words">{report.targetLabel || report.targetId}</p>
      {report.details && <p className="whitespace-pre-wrap break-words">Reporter details: {report.details}</p>}
      <p className="text-sm">Reported by {report.reporterName} · Content owner: {report.ownerName || 'Unavailable'} · Open reports for this item: {report.openReportsForTarget}</p>
      {report.resolutionNote && <p>Decision: {report.action} — {report.resolutionNote}</p>}
      {report.status === 'open' && <Button disabled={pending} onClick={() => claim(report)}>Claim report</Button>}
      {report.status === 'reviewing' && (report.handledBy === user?.id ? <Button onClick={() => { setSelected(report); setNote(report.pendingNote || ''); setAction(report.pendingAction || 'none'); setError('') }}>Review report</Button> : <p>Claimed by another moderator.</p>)}
      {report.status === 'reviewing' && !report.pendingAction && (report.handledBy === user?.id || user?.roles.includes('super_admin')) && <Button variant="outline" disabled={pending} onClick={() => release(report)}>Release claim</Button>}
      {report.status === 'reviewing' && report.handledBy !== user?.id && user?.roles.includes('super_admin') && <Button variant="outline" disabled={pending} onClick={() => takeover(report)}>Take over claim</Button>}
      {report.pendingAction && report.status === 'reviewing' && <p>A saved decision needs completion. Reopen the report to retry it.</p>}
      {report.canRestoreAccount && <Button variant="outline" onClick={() => { setSelected({ ...report, pendingAction: undefined, pendingNote: undefined }); setAction('account_restored'); setNote(''); setError('') }}>Restore account access</Button>}
    </Card>)}
    <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page}</span><Button variant="outline" disabled={!query.data || page * 25 >= query.data.total} onClick={() => setPage(page + 1)}>Next</Button></div>
    <Modal open={!!selected} onClose={() => { if (!pending) setSelected(null) }} title="Resolve report">
      <p className="whitespace-pre-wrap mb-4">{selected?.targetLabel}</p>
      <label className="block mb-4">Decision<select disabled={!!selected?.pendingAction} aria-label="Moderation decision" className="block border rounded p-2 w-full bg-transparent" value={action} onChange={event => setAction(event.target.value)}>{selected?.status === 'actioned' ? <option value="account_restored">Restore account access</option> : <><option value="none">Dismiss — no violation found</option>{selected?.targetType === 'user' ? <option value="account_suspended">Suspend account access</option> : <option value="content_removed">Remove reported content</option>}</>}</select></label>
      <label className="block mb-4">Reason for decision<textarea disabled={!!selected?.pendingAction} aria-label="Decision reason" className="block border rounded p-2 w-full bg-transparent" value={note} maxLength={1000} onChange={event => setNote(event.target.value)} /></label>
      {error && <p role="alert" className="text-red-600 mb-3">{error}</p>}
      <Button disabled={pending || note.trim().length < 3} onClick={resolve}>{pending ? 'Saving…' : 'Save decision'}</Button>
    </Modal>
  </div>
}
