import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Download, Layers3, Plus, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

type WorkflowKind = 'provider_payout' | 'business_order' | 'business_campaign' | 'business_subscription' | 'housing_benefit' | 'developer_profile' | 'offplan_listing'
interface Workflow { id: string; kind: WorkflowKind; status: string; data: Record<string, unknown>; createdAt: string }

const modules: Record<string, { title: string; kind?: WorkflowKind; exportPath?: string }[]> = {
  tenant: [{ title: 'Export rental history', exportPath: '/capabilities/tenant/rental-history.csv' }],
  landlord: [{ title: 'Developer profile', kind: 'developer_profile' }, { title: 'Off-plan listing', kind: 'offplan_listing' }],
  property_manager: [{ title: 'Developer profile', kind: 'developer_profile' }, { title: 'Off-plan listing', kind: 'offplan_listing' }],
  service_provider: [{ title: 'MoMo payout request', kind: 'provider_payout' }],
  business: [
    { title: 'Order & fulfillment', kind: 'business_order' },
    { title: 'New-mover campaign', kind: 'business_campaign' },
    { title: 'Featured subscription', kind: 'business_subscription' },
  ],
  financier: [{ title: 'BoG securitized export', exportPath: '/capabilities/financier/securitized-report.csv' }],
  employer: [{ title: 'Employee housing benefit', kind: 'housing_benefit' }, { title: 'SSNIT/tax export', exportPath: '/capabilities/employer/compliance.csv' }],
  government: [
    { title: 'National rental export', exportPath: '/capabilities/government/national-rental-export.csv' },
  ],
  admin: [{ title: 'National rental export', exportPath: '/capabilities/government/national-rental-export.csv' }],
  developer: [{ title: 'Developer profile', kind: 'developer_profile' }, { title: 'Off-plan listing', kind: 'offplan_listing' }],
}

function download(path: string) {
  const token = useAuthStore.getState().token
  fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(async (response) => {
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'rentos-export.csv'
      anchor.click()
      URL.revokeObjectURL(url)
    })
    .catch((error) => toast.error(error.message))
}

export function RoleCapabilitiesPage() {
  const role = useAuthStore((s) => s.user?.activeRole ?? 'tenant')
  const qc = useQueryClient()
  const [form, setForm] = useState({ kind: '' as WorkflowKind | '', title: '', amount: '', date: '', participantId: '' })
  const { data } = useQuery({ queryKey: ['capability-workflows'], queryFn: () => api.get<{ items: Workflow[] }>('/capabilities/workflows') })
  const { data: agentPerformance } = useQuery({
    queryKey: ['agent-performance'],
    queryFn: () => api.get<Record<string, number>>('/capabilities/agent/performance'),
    enabled: role === 'landlord' || role === 'property_manager',
  })
  const { data: targeting } = useQuery({
    queryKey: ['financier-targeting'],
    queryFn: () => api.get<Record<string, unknown>>('/capabilities/financier/targeting'),
    enabled: role === 'financier',
  })
  const { data: tax } = useQuery({
    queryKey: ['tax-compliance'],
    queryFn: () => api.get<{ items: unknown[] }>('/capabilities/government/tax-compliance'),
    enabled: role === 'government' || role === 'admin',
  })
  const { data: fraud } = useQuery({
    queryKey: ['fraud-watch'],
    queryFn: () => api.get<{ duplicateListings: unknown[]; suspiciousPayments: unknown[] }>('/capabilities/government/fraud-watch'),
    enabled: role === 'government' || role === 'admin',
  })
  const { data: market } = useQuery({
    queryKey: ['developer-market'],
    queryFn: () => api.get<{ items: unknown[] }>('/capabilities/developer/market'),
    enabled: role === 'landlord' || role === 'property_manager' || role === 'admin' || role === 'developer',
  })
  const create = useMutation({
    mutationFn: () => api.post('/capabilities/workflows', {
      kind: form.kind, participantId: form.participantId || undefined,
      status: form.kind === 'business_order' ? 'requested' : 'active',
      data: { title: form.title, amount: Number(form.amount) || 0, scheduledDate: form.date || undefined },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['capability-workflows'] }); setForm({ kind: '', title: '', amount: '', date: '', participantId: '' }); toast.success('Workflow created') },
    onError: (error) => toast.error((error as Error).message),
  })
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/capabilities/workflows/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['capability-workflows'] }),
  })
  const available = modules[role] ?? []

  return (
    <div className="space-y-6">
      <PageHeader icon={<Layers3 size={22} />} title="Role Capabilities" description="Advanced workflows, reports, and exports for your active role." />
      {(agentPerformance || targeting || tax || fraud || market) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {agentPerformance && Object.entries(agentPerformance).slice(0, 4).map(([key, value]) => <Card key={key}><CardContent><p className="text-xs text-muted">{key}</p><p className="text-xl font-bold">{value}</p></CardContent></Card>)}
          {targeting && <Card><CardContent><p className="text-xs text-muted">Targeting analytics</p><p className="text-xl font-bold">{String(targeting.totalApplications ?? 0)}</p></CardContent></Card>}
          {tax && <Card><CardContent><p className="text-xs text-muted">Landlords reporting</p><p className="text-xl font-bold">{tax.items.length}</p></CardContent></Card>}
          {fraud && <Card><CardContent><p className="text-xs text-muted">Fraud signals</p><p className="text-xl font-bold">{fraud.duplicateListings.length + fraud.suspiciousPayments.length}</p></CardContent></Card>}
          {market && <Card><CardContent><p className="text-xs text-muted">Market segments</p><p className="text-xl font-bold">{market.items.length}</p></CardContent></Card>}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {available.map((module) => (
          <Card key={module.title}>
            <CardHeader><CardTitle>{module.title}</CardTitle></CardHeader>
            <CardContent>
              {module.exportPath ? (
                <Button onClick={() => download(module.exportPath!)}><Download size={14} />Download CSV</Button>
              ) : (
                <Button variant="outline" onClick={() => setForm((current) => ({ ...current, kind: module.kind! }))}><Plus size={14} />Start workflow</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {form.kind && (
        <Card>
          <CardHeader><CardTitle>New {form.kind.replaceAll('_', ' ')}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Input id="cap-title" label="Title / description" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <Input id="cap-amount" label="Amount / budget (GHS)" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            <Input id="cap-date" label="Scheduled date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            <Input id="cap-participant" label="Participant user ID (optional)" value={form.participantId} onChange={(e) => setForm((f) => ({ ...f, participantId: e.target.value }))} />
            <div className="sm:col-span-2 flex justify-end gap-2"><Button variant="outline" onClick={() => setForm((f) => ({ ...f, kind: '' }))}>Cancel</Button><Button disabled={!form.title || create.isPending} onClick={() => create.mutate()}>Create</Button></div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Active workflow ledger</CardTitle></CardHeader>
        <CardContent>
          {!data?.items.length ? <EmptyState preset="general" title="No advanced workflows yet" description="Start one above when you are ready." compact /> : (
            <div className="space-y-2">{data.items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div><p className="text-sm font-bold">{String(item.data.title || item.kind).replaceAll('_', ' ')}</p><p className="text-xs text-muted">{new Date(item.createdAt).toLocaleDateString()}</p></div>
                <div className="flex items-center gap-2"><Badge variant="muted">{item.status}</Badge><Select id={`status-${item.id}`} value={item.status} onChange={(e) => update.mutate({ id: item.id, status: e.target.value })} options={['active', 'requested', 'confirmed', 'scheduled', 'fulfilled', 'paid', 'cancelled'].map((value) => ({ value, label: value }))} /></div>
              </div>
            ))}</div>
          )}
        </CardContent>
      </Card>
      <button className="text-xs text-muted hover:text-primary" onClick={() => qc.invalidateQueries({ queryKey: ['capability-workflows'] })}><RefreshCw size={12} className="inline" /> Refresh</button>
    </div>
  )
}
