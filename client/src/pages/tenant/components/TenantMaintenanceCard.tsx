import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import type { MaintenanceRequest } from '@/hooks/useApi'
import { Wrench } from 'lucide-react'

interface TenantMaintenanceCardProps {
  requests: MaintenanceRequest[]
}

export function TenantMaintenanceCard({ requests }: TenantMaintenanceCardProps) {
  /* My Maintenance Requests */
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Wrench size={14} className="text-primary dark:text-blue-400" /> My Maintenance Requests
          </CardTitle>
          <Link to="/maintenance" className="text-[11px] text-primary dark:text-blue-400 hover:underline">View all</Link>
        </div>
      </CardHeader>
      <CardContent>
        {requests.length > 0 ? (
          <div className="space-y-2">
            {requests.map((m) => (
              <Link key={m.id} to="/maintenance" className="flex items-start gap-2.5 group">
                <div className="w-7 h-7 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Wrench size={12} className="text-primary dark:text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-primary-dark dark:text-white truncate group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">{m.title}</p>
                  <p className="text-[10px] text-muted dark:text-gray-500 capitalize">{m.status.replace('_', ' ')} &middot; {m.priority}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-3">
            <Wrench size={20} className="mx-auto text-muted/30 mb-2" />
            <p className="text-xs text-muted dark:text-gray-500">No maintenance requests</p>
            <Link to="/maintenance" className="text-[11px] text-primary dark:text-blue-400 hover:underline mt-1 inline-block">Report an issue</Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
