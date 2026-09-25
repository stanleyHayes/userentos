import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { AdminPageHeader, AdminLoadingState, AdminEmptyState } from '@/components/admin/AdminPagePrimitives'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'

interface AgencyLicence {
  id: string
  name: string
  slug: string
  city: string
  phone: string
  email?: string
  reacLicenceNumber: string
  reacLicenceVerifiedAt?: string
  updatedAt: string
}

/** Record the outcome of checking an agency's self-reported licence with REAC (Act 1047). */
export function AgencyLicencesPage() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<'pending' | 'verified'>('pending')
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['agency-licences', status],
    queryFn: () => api.get<{ items: AgencyLicence[] }>(`/agency/admin/licences?status=${status}`),
  })
  const decide = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) => api.patch(`/agency/${id}/licence`, { verified }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agency-licences'] }),
  })

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={<BadgeCheck size={22} />}
        title="Agency licences"
        description="Check each number on the REAC register before marking it verified. Public agency pages show whether a licence has been verified."
      />
      <div className="flex gap-2">
        {(['pending', 'verified'] as const).map((value) => (
          <Button key={value} variant={status === value ? 'primary' : 'outline'} size="sm" onClick={() => setStatus(value)}>
            {value === 'pending' ? 'Awaiting check' : 'Verified'}
          </Button>
        ))}
      </div>
      {decide.isError && <p role="alert" className="text-sm text-red-700 dark:text-red-400">Could not save that decision. Please retry.</p>}
      {isPending ? <AdminLoadingState title="Loading licences" description="Fetching agency licence numbers." /> : isError ? (
        <Card><div role="alert" className="text-sm">Could not load agency licences. <button type="button" className="font-semibold underline" onClick={() => { void refetch() }}>Retry</button></div></Card>
      ) : !data.items.length ? (
        <AdminEmptyState title={status === 'pending' ? 'Nothing awaiting a check' : 'No verified licences yet'} description="Agencies appear here once they add a REAC licence number." />
      ) : (
        <div className="space-y-3">
          {data.items.map((agency) => (
            <Card key={agency.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-primary-dark dark:text-white">{agency.name} <span className="text-xs font-normal text-muted">· {agency.city}</span></p>
                  <p className="text-sm">Licence <span className="font-mono">{agency.reacLicenceNumber}</span></p>
                  <p className="text-xs text-muted">{agency.phone}{agency.email ? ` · ${agency.email}` : ''} · updated {formatDate(agency.updatedAt)}{agency.reacLicenceVerifiedAt ? ` · verified ${formatDate(agency.reacLicenceVerifiedAt)}` : ''}</p>
                </div>
                <div className="flex gap-2">
                  {status === 'pending'
                    ? <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: agency.id, verified: true })}>Mark verified</Button>
                    : <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: agency.id, verified: false })}>Withdraw verification</Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
