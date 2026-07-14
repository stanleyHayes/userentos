import { Link } from 'react-router-dom'
import type { Notification } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

interface TenantNotificationsCardProps {
  notifications: Notification[]
}

export function TenantNotificationsCard({ notifications }: TenantNotificationsCardProps) {
  /* Notifications */
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Alerts</CardTitle>
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[10px] text-white font-bold">{notifications.length}</div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5">
          {notifications.map((n) => (
            <Link key={n.id} to={n.actionUrl ?? '#'} className="flex items-start gap-2.5 group">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 mt-2 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-primary-dark dark:text-white group-hover:text-primary dark:group-hover:text-blue-400 transition-colors truncate">{n.title}</p>
                <p className="text-[10px] text-muted dark:text-gray-500 truncate">{n.message}</p>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
