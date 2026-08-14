import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { FileText, Activity, ShieldCheck, Bell, ClipboardList } from 'lucide-react'
import { COLORS, num, formatFileSize } from './analytics-constants'
import { EmptyState } from './PanelEmptyState'
import { KPICard } from './KPICard'
import { ProgressRow } from './ProgressRow'
import { PieCard } from './PieCard'
import { QuickRow } from './QuickRow'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- large dynamic analytics object from API; fully typing is excessively verbose
export function SystemTab({ docs, audit, agr, notif }: any) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={<FileText size={18} />} label="Documents" value={num(docs.total)} detail={formatFileSize(docs.totalFileSize ?? 0)} gradient="from-blue-500 to-indigo-600" />
        <KPICard icon={<Activity size={18} />} label="Audit Logs" value={num(audit.total)} detail="All recorded actions" gradient="from-emerald-500 to-teal-600" />
        <KPICard icon={<ShieldCheck size={18} />} label="Compliance Flags" value={num((agr.compliance?.violations ?? 0) + (agr.compliance?.warnings ?? 0))} detail={`${num(agr.compliance?.violations)} violations · ${num(agr.compliance?.warnings)} warnings`} gradient="from-red-500 to-rose-600" alert={(agr.compliance?.violations ?? 0) > 0} />
        <KPICard icon={<Bell size={18} />} label="Notifications" value={num(notif.total)} detail={`${num(notif.unread)} unread`} gradient="from-violet-500 to-purple-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText size={16} className="text-blue-400" />Documents by Type</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(docs.byType ?? {}).map(([type, count], i) => (
                <ProgressRow key={type} label={type.replace(/_/g, ' ')} value={num(count as number)} percent={((count as number) / Math.max(docs.total ?? 1, 1)) * 100} color={COLORS[i % COLORS.length]} />
              ))}
              {Object.keys(docs.byType ?? {}).length === 0 && <EmptyState text="No documents" />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity size={16} className="text-emerald-500" />Audit by Action</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(audit.byAction ?? {}).sort(([, a], [, b]) => (b as number) - (a as number)).map(([action, count], i) => (
                <ProgressRow key={action} label={action} value={num(count as number)} percent={((count as number) / Math.max(audit.total ?? 1, 1)) * 100} color={COLORS[i % COLORS.length]} />
              ))}
              {Object.keys(audit.byAction ?? {}).length === 0 && <EmptyState text="No audit logs" />}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PieCard title="Audit by Entity Type" data={audit.byEntity ?? {}} />

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList size={16} className="text-amber-500" />Agreement Compliance</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <QuickRow label="Total Agreements" value={num(agr.total)} />
              {Object.entries(agr.byStatus ?? {}).map(([s, c]) => <QuickRow key={s} label={s.replace(/_/g, ' ')} value={num(c as number)} />)}
              <div className="border-t border-border dark:border-gray-700 pt-3 mt-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Renewal Status</p>
                {Object.entries(agr.byRenewalStatus ?? {}).map(([s, c]) => <QuickRow key={s} label={s.replace(/_/g, ' ')} value={num(c as number)} />)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
