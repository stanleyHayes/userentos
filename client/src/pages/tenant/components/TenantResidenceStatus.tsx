import { Link } from 'react-router-dom'
import type { RentalAgreement } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ChevronRight, Home, XCircle } from 'lucide-react'

interface TenantResidenceStatusProps {
  activeAgreement: RentalAgreement | undefined
}

export function TenantResidenceStatus({ activeAgreement }: TenantResidenceStatusProps) {
  /* === Residence Status === */
  return activeAgreement ? (
    <Link to="/agreements" className="block rounded-xl border border-accent/20 dark:border-accent/30 bg-accent/5 dark:bg-accent/8 px-4 py-3 hover:border-accent/40 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent/15 dark:bg-accent/20 flex items-center justify-center flex-shrink-0">
          <Home size={18} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-primary-dark dark:text-white">Currently Residing</p>
            <Badge variant="success" className="text-[10px]">Active</Badge>
          </div>
        </div>
        <ChevronRight size={16} className="text-muted flex-shrink-0" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pl-12 text-xs text-muted dark:text-gray-400">
        <span>{formatCurrency(activeAgreement.rentAmount)}/mo</span>
        <span className="text-border dark:text-[#252a3a]">&middot;</span>
        <span>{formatDate(activeAgreement.startDate).split(',')[0]} - {formatDate(activeAgreement.endDate).split(',')[0]}</span>
        {activeAgreement.landlordName && (
          <>
            <span className="text-border dark:text-[#252a3a]">&middot;</span>
            <span>Landlord: <strong className="text-primary-dark dark:text-gray-300">{activeAgreement.landlordName}</strong></span>
          </>
        )}
      </div>
    </Link>
  ) : (
    <Link to="/properties" className="block rounded-xl border border-border/40 dark:border-[#252a3a]/40 bg-surface/50 dark:bg-[#0c0e1a]/40 px-4 py-3 hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-muted/10 dark:bg-gray-700/30 flex items-center justify-center flex-shrink-0">
          <XCircle size={18} className="text-muted dark:text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-primary-dark dark:text-white">No Active Lease</p>
          <p className="text-xs text-muted dark:text-gray-400 mt-0.5">You're not under any rental agreement</p>
        </div>
        <ChevronRight size={16} className="text-muted flex-shrink-0" />
      </div>
    </Link>
  )
}
