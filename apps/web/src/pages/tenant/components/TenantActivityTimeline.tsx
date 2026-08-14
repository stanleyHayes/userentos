import type { ReactNode } from 'react'
import type { Dispute, Notification, Payment } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { AlertTriangle, Bell, CheckCircle, Clock } from 'lucide-react'

interface TenantActivityTimelineProps {
  recentPayments: Payment[]
  openDisputes: Dispute[]
  notifications: Notification[]
}

export function TenantActivityTimeline({ recentPayments, openDisputes, notifications }: TenantActivityTimelineProps) {
  /* Recent activity — timeline style */
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Activity</CardTitle>
          <span className="text-[10px] text-muted dark:text-gray-500">{recentPayments.length + openDisputes.length + notifications.length} events</span>
        </div>
      </CardHeader>
      <CardContent>
        {(recentPayments.length === 0 && openDisputes.length === 0 && notifications.length === 0) ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-2xl bg-surface dark:bg-[#0c0e1a] flex items-center justify-center mx-auto mb-3">
              <Clock size={20} className="text-muted/40" />
            </div>
            <p className="text-sm text-muted dark:text-gray-500">No recent activity</p>
          </div>
        ) : (
          <div className="relative">
            <div className="space-y-0">
              {(() => {
                const items: { key: string; lineColor: string; iconBg: string; icon: ReactNode; title: string; detail: string; badge?: ReactNode; time: string }[] = [
                  ...recentPayments.slice(0, 4).map((p) => ({
                    key: p.id, lineColor: '#10b981', iconBg: 'bg-accent',
                    icon: <CheckCircle size={12} className="text-white" />,
                    title: 'Rent Payment',
                    detail: `${formatCurrency(p.amount)} via ${p.method.replace('_', ' ')}`,
                    badge: <Badge variant="success" className="text-[9px]">Paid</Badge>,
                    time: p.paidAt ? formatDate(p.paidAt) : '',
                  })),
                  ...openDisputes.slice(0, 2).map((d) => ({
                    key: d.id, lineColor: '#ef4444', iconBg: 'bg-danger',
                    icon: <AlertTriangle size={12} className="text-white" />,
                    title: d.title,
                    detail: d.description.slice(0, 60) + '...',
                    badge: <Badge variant="warning" className="text-[9px]">{d.status.replace('_', ' ')}</Badge>,
                    time: formatDate(d.createdAt),
                  })),
                  ...notifications.slice(0, 2).map((n) => ({
                    key: n.id, lineColor: '#f59e0b', iconBg: 'bg-secondary',
                    icon: <Bell size={12} className="text-white" />,
                    title: n.title,
                    detail: n.message,
                    time: formatDate(n.createdAt),
                  })),
                ]

                return items.map((item, i) => (
                  <TimelineItem
                    key={item.key}
                    icon={item.icon}
                    iconBg={item.iconBg}
                    title={item.title}
                    detail={item.detail}
                    badge={item.badge}
                    time={item.time}
                    lineColor={item.lineColor}
                    isLast={i === items.length - 1}
                  />
                ))
              })()}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TimelineItem({ icon, iconBg, title, detail, badge, time, lineColor, isLast }: {
  icon: ReactNode; iconBg: string; title: string; detail: string; badge?: ReactNode; time: string; lineColor: string; isLast: boolean
}) {
  return (
    <div className="relative flex gap-2.5 sm:gap-3.5 py-3 pl-1 group">
      {/* Colored connector line */}
      {!isLast && (
        <div
          className="absolute left-[13px] sm:left-[15px] top-[34px] sm:top-[38px] bottom-0 w-[2px] rounded-full opacity-30"
          style={{ backgroundColor: lineColor }}
        />
      )}
      <div className={`relative z-10 w-[26px] h-[26px] sm:w-[30px] sm:h-[30px] rounded-full ${iconBg} flex items-center justify-center flex-shrink-0 ring-4 ring-white dark:ring-[#161927]`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 flex-wrap">
          <p className="text-xs sm:text-sm font-semibold text-primary-dark dark:text-white truncate">{title}</p>
          {badge}
        </div>
        <p className="text-[11px] text-muted dark:text-gray-500 truncate">{detail}</p>
        <p className="text-[10px] text-muted/60 dark:text-gray-600 mt-0.5">{time}</p>
      </div>
    </div>
  )
}
