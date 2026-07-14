import { Link } from 'react-router-dom'
import type { Property } from '@/types'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency } from '@/lib/utils'
import { Building2, ChevronRight, Heart } from 'lucide-react'

interface TenantSavedPropertiesProps {
  properties: Array<Property & { _id?: string }>
}

export function TenantSavedProperties({ properties }: TenantSavedPropertiesProps) {
  /* Saved Properties */
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-primary-dark dark:text-white flex items-center gap-2">
          <Heart size={16} className="text-danger" /> Saved Properties
        </h3>
        <Link to="/properties" className="text-xs text-primary dark:text-blue-400 hover:underline flex items-center gap-1">Browse all <ChevronRight size={12} /></Link>
      </div>
      {properties.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {properties.slice(0, 3).map((p) => (
            <Link key={p.id ?? p._id} to={`/properties/${p.id ?? p._id}`}>
              <Card className="group hover:shadow-lg dark:hover:shadow-black/20 hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden">
                <CardContent>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                      <Building2 size={16} className="text-primary dark:text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-primary-dark dark:text-white truncate group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">{p.title}</p>
                      <p className="text-xs text-muted dark:text-gray-500 truncate">{p.address?.city}, {p.address?.region}</p>
                      <p className="text-sm font-bold text-primary dark:text-blue-400 mt-1">{formatCurrency(p.rentAmount)}<span className="text-[10px] font-normal text-muted dark:text-gray-500">/mo</span></p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent>
            <EmptyState preset="properties" title="No saved properties" description="Save properties you love to find them here later." action={{ label: 'Explore Properties', href: '/properties' }} compact />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
