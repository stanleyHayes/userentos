import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Building2 } from 'lucide-react'

interface Offplan { id: string; data: { title?: string; amount?: number; scheduledDate?: string }; status: string }
export function PublicDevelopmentsPage() {
  const { data } = useQuery({ queryKey: ['offplan-developments'], queryFn: () => api.get<{ items: Offplan[] }>('/capabilities/developer/offplan') })
  return <div className="mx-auto max-w-6xl px-4 py-12"><header className="mb-8"><Building2 size={30} className="text-primary" /><h1 className="mt-3 text-3xl font-extrabold">Off-plan developments</h1><p className="mt-2 text-muted">Explore pre-sales opportunities published by RentOS property developers.</p></header>
    {!data?.items.length ? <EmptyState preset="general" title="No developments published" description="New off-plan opportunities will appear here." /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.items.map((item) => <Card key={item.id}><p className="text-xs uppercase text-muted">{item.status}</p><h2 className="mt-2 text-lg font-bold">{item.data.title}</h2><p className="mt-3 text-sm text-muted">Starting at GHS {Number(item.data.amount ?? 0).toLocaleString()}</p>{item.data.scheduledDate && <p className="text-xs text-muted">Expected: {item.data.scheduledDate}</p>}</Card>)}</div>}
  </div>
}
