import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { useProperties } from '@/hooks/useApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/layout/PageHeader'
import { Building2, Link2, Trash2, Users } from 'lucide-react'
import toast from 'react-hot-toast'

interface Agency {
  id: string
  name: string
  slug: string
  description?: string
  phone: string
  email?: string
  city: string
  teamMembers: { name: string; role: string; phone?: string }[]
}

interface Delegation {
  id: string
  propertyId: string
  propertyTitle?: string
  delegateName?: string
  delegateEmail?: string
  ownerName?: string
  scopes: string[]
}

export function AgencyPage() {
  const role = useAuthStore((s) => s.user?.activeRole)
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['agency', 'me'], queryFn: () => api.get<{ agency: Agency | null }>('/agency/me') })
  const { data: delegationData } = useQuery({
    queryKey: ['agency', 'delegations', role],
    queryFn: () => api.get<{ items: Delegation[] }>(`/agency/delegations${role === 'property_manager' ? '?as=delegate' : ''}`),
  })
  const { data: propertiesData } = useProperties({ mine: role === 'landlord' })
  const agency = data?.agency
  const [form, setForm] = useState({ name: '', phone: '', email: '', city: '', description: '', team: '' })
  const [delegation, setDelegation] = useState({ propertyId: '', delegateEmail: '', scopes: ['applications', 'leads'] })

  const save = useMutation({
    mutationFn: () => api.post('/agency/me', {
      name: form.name || agency?.name,
      phone: form.phone || agency?.phone,
      email: form.email || agency?.email || undefined,
      city: form.city || agency?.city,
      description: form.description || agency?.description || undefined,
      teamMembers: form.team.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        const [name, memberRole, phone] = line.split(',').map((part) => part.trim())
        return { name, role: memberRole || 'Agent', ...(phone ? { phone } : {}) }
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agency'] }); toast.success('Agency profile saved') },
    onError: (e) => toast.error((e as Error).message),
  })
  const delegate = useMutation({
    mutationFn: () => api.post('/agency/delegations', delegation),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agency', 'delegations'] }); toast.success('Property delegated') },
    onError: (e) => toast.error((e as Error).message),
  })
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/agency/delegations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agency', 'delegations'] }),
  })

  const properties = propertiesData?.items ?? []
  const delegations = delegationData?.items ?? []

  return (
    <div className="space-y-6">
      <PageHeader icon={Building2} title="Agency & Delegation" description="Publish your agency identity and manage scoped owner relationships." />
      <Card>
        <CardHeader><CardTitle>Branded agency profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {agency && <div className="flex items-center gap-2"><Badge variant="success">Published</Badge><a className="text-xs font-semibold text-primary hover:underline" href={`/agency/${agency.slug}`}><Link2 size={12} className="inline" /> /agency/{agency.slug}</a></div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="agency-name" label="Agency name" value={form.name || agency?.name || ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Input id="agency-phone" label="Phone" value={form.phone || agency?.phone || ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            <Input id="agency-email" label="Email" value={form.email || agency?.email || ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <Input id="agency-city" label="City" value={form.city || agency?.city || ''} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </div>
          <Textarea id="agency-description" label="Description" value={form.description || agency?.description || ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <Textarea id="agency-team" label="Team members (one per line: name, role, phone)" value={form.team} onChange={(e) => setForm((f) => ({ ...f, team: e.target.value }))} placeholder="Ama Mensah, Senior Agent, 024..." />
          <div className="flex justify-end"><Button onClick={() => save.mutate()} disabled={save.isPending}>Save profile</Button></div>
        </CardContent>
      </Card>

      {role === 'landlord' && (
        <Card>
          <CardHeader><CardTitle>Delegate a property</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <select className="neumorphic-inset rounded-xl px-3 text-sm" value={delegation.propertyId} onChange={(e) => setDelegation((d) => ({ ...d, propertyId: e.target.value }))}>
              <option value="">Choose property</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}
            </select>
            <Input id="delegate-email" label="Manager email" value={delegation.delegateEmail} onChange={(e) => setDelegation((d) => ({ ...d, delegateEmail: e.target.value }))} />
            <Button onClick={() => delegate.mutate()} disabled={!delegation.propertyId || !delegation.delegateEmail || delegate.isPending}>Delegate</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users size={16} />Active relationships</CardTitle></CardHeader>
        <CardContent>
          {!delegations.length ? <EmptyState preset="general" title="No active delegations" description="Delegated owner relationships will appear here." compact /> : (
            <div className="space-y-2">{delegations.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                <div><p className="text-sm font-bold">{item.propertyTitle}</p><p className="text-xs text-muted">{role === 'landlord' ? `${item.delegateName} · ${item.delegateEmail}` : `Owner: ${item.ownerName}`} · {item.scopes.join(', ')}</p></div>
                {role === 'landlord' && <button aria-label="Revoke delegation" onClick={() => revoke.mutate(item.id)} className="text-danger"><Trash2 size={16} /></button>}
              </div>
            ))}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
