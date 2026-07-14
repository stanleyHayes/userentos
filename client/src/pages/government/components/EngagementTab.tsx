import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Gavel, Star, Bell, MessageSquare, Heart, Mail, Eye } from 'lucide-react'
import { num } from './analytics-constants'
import { KPICard } from './KPICard'
import { QuickRow } from './QuickRow'
import { DisputesPieCard } from './DisputesPieCard'
import { DisputesPipelineCard } from './DisputesPipelineCard'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
export function EngagementTab({ dis, rev, notif, msg, fav, invit, props }: any) {
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={<Gavel size={18} />} label="Total Disputes" value={num(dis.total)} detail={`${num(dis.open)} open`} gradient="from-red-500 to-rose-600" />
        <KPICard icon={<Star size={18} />} label="Reviews" value={num(rev.total)} detail={`${rev.avgRating ?? 0}/5 avg · ${rev.wouldRecommendPercent ?? 0}% recommend`} gradient="from-amber-500 to-yellow-600" />
        <KPICard icon={<Bell size={18} />} label="Notifications" value={num(notif.total)} detail={`${num(notif.unread)} unread`} gradient="from-violet-500 to-purple-600" />
        <KPICard icon={<MessageSquare size={18} />} label="Messages" value={num(msg.totalMessages)} detail={`${num(msg.conversations)} conversations`} gradient="from-cyan-500 to-blue-600" />
      </div>

      {/* Disputes deep dive */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DisputesPieCard disputes={dis} />
        <DisputesPipelineCard disputes={dis} />
      </div>

      {/* Reviews + Notifications + Favorites + Invitations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Star size={16} className="text-amber-500" />Review Insights</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Reviews" value={num(rev.total)} />
              <QuickRow label="Verified Reviews" value={num(rev.verified)} />
              <QuickRow label="Average Rating" value={`${rev.avgRating ?? 0}/5`} />
              <QuickRow label="Would Recommend" value={`${rev.wouldRecommendPercent ?? 0}%`} />
              <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Sub-Ratings (avg)</p>
                {Object.entries(rev.avgSubRatings ?? {}).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between py-1">
                    <span className="text-xs text-muted capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-primary-dark dark:text-white">{String(val)}</span>
                      <Star size={10} className="text-amber-400 fill-amber-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Bell size={16} className="text-violet-500" />Notifications</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                <QuickRow label="Total Sent" value={num(notif.total)} />
                <QuickRow label="Unread" value={num(notif.unread)} />
                <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-2">By Channel</p>
                  {Object.entries(notif.byChannel ?? {}).map(([ch, c]) => <QuickRow key={ch} label={ch.replace(/_/g, ' ')} value={num(c as number)} />)}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2"><Heart size={14} className="text-red-400" /><span className="text-[10px] text-muted uppercase tracking-wider">Favorites</span></div>
                <p className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">{num(fav.total)}</p>
                <p className="text-[10px] text-accent mt-1">Property saves</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2"><Mail size={14} className="text-blue-400" /><span className="text-[10px] text-muted uppercase tracking-wider">Invitations</span></div>
                <p className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">{num(invit.total)}</p>
                <p className="text-[10px] text-accent mt-1">{num(invit.byStatus?.pending)} pending</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Property engagement */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Eye size={16} className="text-blue-400" />Property Engagement</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="bg-blue-500/10 rounded-xl p-4">
              <Eye size={20} className="text-blue-500 mx-auto mb-2" />
              <p className="text-xl font-extrabold font-display text-primary-dark dark:text-white">{num(props.engagement?.views)}</p>
              <p className="text-[10px] text-muted">Total Views</p>
            </div>
            <div className="bg-emerald-500/10 rounded-xl p-4">
              <MessageSquare size={20} className="text-emerald-500 mx-auto mb-2" />
              <p className="text-xl font-extrabold font-display text-primary-dark dark:text-white">{num(props.engagement?.inquiries)}</p>
              <p className="text-[10px] text-muted">Inquiries</p>
            </div>
            <div className="bg-red-500/10 rounded-xl p-4">
              <Heart size={20} className="text-red-500 mx-auto mb-2" />
              <p className="text-xl font-extrabold font-display text-primary-dark dark:text-white">{num(props.engagement?.favorites)}</p>
              <p className="text-[10px] text-muted">Favorites</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
