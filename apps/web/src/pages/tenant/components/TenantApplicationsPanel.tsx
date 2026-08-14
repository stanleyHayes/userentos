import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'

interface TenantApplicationsPanelProps {
  analytics: Record<string, number> | undefined
}

export function TenantApplicationsPanel({ analytics: a }: TenantApplicationsPanelProps) {
  /* Applications Status */
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">My Applications</CardTitle>
          <Badge variant={Number(a?.pendingApplications ?? 0) > 0 ? 'warning' : 'muted'} className="text-[10px]">{a?.totalApplications ?? 0} total</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {Number(a?.totalApplications ?? 0) > 0 ? (
          <div className="space-y-2.5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {Object.entries((a as Record<string, any> | undefined)?.applicationsByStatus as Record<string, any> | undefined ?? {}).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${status === 'approved' ? 'bg-accent' : status === 'pending' ? 'bg-secondary' : status === 'rejected' ? 'bg-danger' : 'bg-muted'}`} />
                  <span className="text-xs text-primary-dark dark:text-gray-300 capitalize">{status.replace('_', ' ')}</span>
                </div>
                <span className="text-xs font-bold text-primary-dark dark:text-white">{String(count)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState preset="agreements" title="No applications yet" description="Your rental applications will appear here." compact />
        )}
      </CardContent>
    </Card>
  )
}
