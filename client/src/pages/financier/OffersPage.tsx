import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useMyFinancingOffers, useToggleFinancingOffer } from '@/hooks/useApi'
import { formatCurrency } from '@/lib/utils'
import { Plus, Power } from 'lucide-react'
import { GridSkeleton } from '@/components/ui/Skeleton'

export function FinancierOffersPage() {
  const { data, isLoading } = useMyFinancingOffers()
  const toggle = useToggleFinancingOffer()
  const offers = data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold font-display text-primary-dark dark:text-white">Financing Offers</h1>
          <p className="text-sm text-muted dark:text-gray-500">Configure the products you offer to applicants</p>
        </div>
        <Link to="/financing/offers/new"><Button size="sm"><Plus size={14} /> New Offer</Button></Link>
      </div>

      {isLoading ? (
        <GridSkeleton cols={2} count={4} />
      ) : offers.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <p className="text-sm font-semibold text-primary-dark dark:text-white">No offers yet</p>
          <p className="text-xs text-muted dark:text-gray-500 mt-1 mb-4">Create your first lending product to start receiving applications</p>
          <Link to="/financing/offers/new"><Button size="sm"><Plus size={14} /> Create Offer</Button></Link>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {offers.map((o) => (
            <Card key={o.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <CardTitle>{o.name}</CardTitle>
                    <p className="text-[11px] text-muted dark:text-gray-500 capitalize mt-0.5">{o.productType.replace('_', ' ')}</p>
                  </div>
                  <Badge variant={o.active ? 'success' : 'muted'} className="text-[10px]">{o.active ? 'Live' : 'Disabled'}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted dark:text-gray-400 line-clamp-2 mb-3">{o.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <Row label="Amount" value={`${formatCurrency(o.minAmount)}–${formatCurrency(o.maxAmount)}`} />
                  <Row label="Tenure" value={`${o.minTenureMonths}–${o.maxTenureMonths} mo`} />
                  <Row label="APR" value={`${o.annualInterestRate}%`} />
                  <Row label="Processing" value={`${o.processingFeePct}%`} />
                  <Row label="Min credit" value={String(o.minCreditScore)} />
                  <Row label="Late fee" value={`${o.lateFeePct}%`} />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggle.mutate({ id: o.id, active: !o.active })}>
                    <Power size={12} /> {o.active ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted dark:text-gray-500">{label}</span>
      <span className="font-semibold text-primary-dark dark:text-white">{value}</span>
    </div>
  )
}
