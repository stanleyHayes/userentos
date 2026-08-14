import type { RentalAgreement } from '@/types'
import { DashboardActionItem, DashboardActionPanel } from '@/components/dashboard/DashboardPrimitives'
import { formatCurrency } from '@/lib/utils'
import { CreditCard, Home, Scale, UserCircle, Wrench } from 'lucide-react'

interface TenantTodayActionsProps {
  profileComplete: boolean
  profileScore: number
  analytics: Record<string, number> | undefined
  activeAgreement: RentalAgreement | undefined
  maintenanceCount: number
  openDisputesCount: number
  hasRecommendations: boolean
}

export function TenantTodayActions({ profileComplete, profileScore, analytics: a, activeAgreement, maintenanceCount, openDisputesCount, hasRecommendations }: TenantTodayActionsProps) {
  return (
    <DashboardActionPanel
      title="Today"
      description="The fastest path through rent, profile, and home tasks."
      action={{ label: 'Open dashboard', href: '/dashboard' }}
    >
      <DashboardActionItem
        title={profileComplete ? 'Profile ready' : 'Finish tenant passport'}
        description={profileComplete ? 'Your profile can be shared with landlords.' : `${profileScore}% complete - finish the missing sections before applying.`}
        icon={<UserCircle size={16} />}
        href="/my-profile"
        tone={profileComplete ? 'success' : 'warning'}
        meta={`${profileScore}%`}
      />
      <DashboardActionItem
        title={Number(a?.overduePayments ?? 0) > 0 ? 'Clear overdue rent' : 'Rent payments'}
        description={Number(a?.overduePayments ?? 0) > 0 ? `${formatCurrency(Number(a?.overdueAmount ?? 0))} needs attention.` : activeAgreement ? `Next tracked amount is ${formatCurrency(Number(a?.nextPaymentAmount ?? 0))}.` : 'Track rent and payment history.'}
        icon={<CreditCard size={16} />}
        href="/payments"
        tone={Number(a?.overduePayments ?? 0) > 0 ? 'danger' : 'default'}
      />
      <DashboardActionItem
        title={maintenanceCount > 0 ? 'Maintenance updates' : 'Request maintenance'}
        description={maintenanceCount > 0 ? `${maintenanceCount} recent request${maintenanceCount === 1 ? '' : 's'} in progress.` : 'Report repairs and keep a record.'}
        icon={<Wrench size={16} />}
        href="/maintenance"
        tone={maintenanceCount > 0 ? 'warning' : 'accent'}
      />
      <DashboardActionItem
        title={openDisputesCount > 0 ? 'Review disputes' : 'Find a place'}
        description={openDisputesCount > 0 ? `${openDisputesCount} open case${openDisputesCount === 1 ? '' : 's'} need follow-up.` : hasRecommendations ? 'Fresh recommendations are ready.' : 'Browse available listings.'}
        icon={openDisputesCount > 0 ? <Scale size={16} /> : <Home size={16} />}
        href={openDisputesCount > 0 ? '/disputes' : '/properties'}
        tone={openDisputesCount > 0 ? 'danger' : 'success'}
      />
    </DashboardActionPanel>
  )
}
