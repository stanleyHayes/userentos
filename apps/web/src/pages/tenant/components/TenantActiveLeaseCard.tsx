import type { ReactNode } from 'react'
import type { RentalAgreement } from '@/types'
import { Card, CardContent } from '@/components/ui/Card'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Calendar, CheckCircle, Clock, FileText } from 'lucide-react'

interface TenantActiveLeaseCardProps {
  agreement: RentalAgreement
}

export function TenantActiveLeaseCard({ agreement }: TenantActiveLeaseCardProps) {
  /* Active lease */
  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
            <FileText size={18} className="text-primary dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-primary-dark dark:text-white">Active Lease</p>
            <p className="text-lg font-extrabold font-display text-primary dark:text-blue-400">{formatCurrency(agreement.rentAmount)}<span className="text-xs font-normal text-muted dark:text-gray-400">/mo</span></p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="Start" value={formatDate(agreement.startDate).split(',')[0]} icon={<Calendar size={12} />} />
          <MiniStat label="End" value={formatDate(agreement.endDate).split(',')[0]} icon={<Calendar size={12} />} />
          <MiniStat label="Advance" value={`${agreement.advanceMonths} months`} icon={<Clock size={12} />} />
          <MiniStat label="Status" value="Active" icon={<CheckCircle size={12} className="text-accent" />} />
        </div>
      </CardContent>
    </Card>
  )
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-lg bg-surface dark:bg-[#0c0e1a] p-2.5">
      <div className="flex items-center gap-1 text-muted dark:text-gray-500 mb-0.5">{icon}<span className="text-[10px]">{label}</span></div>
      <p className="text-xs font-bold text-primary-dark dark:text-white">{value}</p>
    </div>
  )
}
