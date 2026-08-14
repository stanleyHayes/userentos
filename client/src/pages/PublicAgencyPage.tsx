import { useParams, Link } from 'react-router-dom'
import { DetailSkeleton } from '@/components/ui/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency } from '@/lib/utils'
import { Building2, MapPin, Phone, Users } from 'lucide-react'

interface AgencyData {
  agency: { name: string; description?: string; phone: string; city: string; logo?: string; teamMembers: { name: string; role: string }[] }
  listings: { id: string; title: string; rentAmount: number; address: { city: string }; images?: string[] }[]
}
export function PublicAgencyPage() {
  const { slug = '' } = useParams()
  const { data, isLoading } = useQuery({ queryKey: ['public-agency', slug], queryFn: () => api.get<AgencyData>(`/agency/${slug}`) })
  if (isLoading) return <DetailSkeleton />
  if (!data) return <EmptyState preset="general" title="Agency not found" description="This agency profile is unavailable." />
  return <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
    <header className="rounded-3xl bg-primary p-8 text-white">
      <Building2 size={32} /><h1 className="mt-4 text-3xl font-extrabold">{data.agency.name}</h1>
      <p className="mt-2 max-w-2xl text-white/75">{data.agency.description}</p>
      <div className="mt-4 flex gap-4 text-sm"><span><MapPin size={14} className="inline" /> {data.agency.city}</span><a href={`tel:${data.agency.phone}`}><Phone size={14} className="inline" /> {data.agency.phone}</a></div>
    </header>
    {!!data.agency.teamMembers.length && <Card><h2 className="mb-3 flex items-center gap-2 font-bold"><Users size={16} />Team</h2><div className="flex flex-wrap gap-3">{data.agency.teamMembers.map((member) => <div key={member.name} className="rounded-xl bg-surface p-3"><p className="font-bold">{member.name}</p><p className="text-xs text-muted">{member.role}</p></div>)}</div></Card>}
    <section><h2 className="mb-4 text-xl font-bold">Available properties</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.listings.map((property) => <Link key={property.id} to={`/properties/${property.id}`}><Card><img src={property.images?.[0] || '/og-image.png'} className="mb-3 aspect-video w-full rounded-xl object-cover" /><p className="font-bold">{property.title}</p><p className="text-sm text-muted">{formatCurrency(property.rentAmount)} · {property.address.city}</p></Card></Link>)}</div></section>
  </div>
}
