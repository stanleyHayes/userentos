import { Link } from 'react-router-dom'
import type { RentalAgreement } from '@/types'
import { buttonVariants } from '@/components/ui/buttonVariants'
import { DashboardHero, DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Home, FileText, CreditCard, PiggyBank, Wallet, ChevronRight, Send, Heart } from 'lucide-react'

interface TenantHeroSectionProps {
  greeting: string
  firstName?: string
  profileComplete: boolean
  profileScore: number
  analytics: Record<string, number> | undefined
  activeAgreement: RentalAgreement | undefined
  /** Paying rent through RentOS and the wallet are regulated services, shown only where the operator offers them. */
  rentCollectionEnabled: boolean
  walletEnabled: boolean
  savedCount: number
}

export function TenantHeroSection({ greeting, firstName, profileComplete, profileScore, analytics: a, activeAgreement, rentCollectionEnabled, walletEnabled, savedCount }: TenantHeroSectionProps) {
  const heroAction = buttonVariants({ size: 'sm', className: 'bg-white/10 border-0 text-white hover:bg-white/20' })
  return (
    <>
      {/* === Hero greeting === */}
      <DashboardHero
        title={`${greeting}, ${firstName ?? 'there'}`}
        description={
          <>
            <span className="hidden sm:inline">{new Date().toLocaleDateString('en-GH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span className="sm:hidden">{new Date().toLocaleDateString('en-GH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </>
        }
        tone="tenant"
        watermarkIcon={Home}
        actions={(rentCollectionEnabled || walletEnabled) && (
          <div className="hidden gap-2 md:flex">
            {rentCollectionEnabled && <Link to="/payments" className={heroAction}><CreditCard size={14} /> Pay Rent</Link>}
            {walletEnabled && <Link to="/savings" className={heroAction}><PiggyBank size={14} /> Save</Link>}
          </div>
        )}
      >
        {!profileComplete && (
          <Link to="/my-profile" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs text-white transition-colors hover:bg-white/15">
            <div className="relative h-6 w-6">
              <svg className="h-6 w-6 -rotate-90" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" />
                <circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(profileScore / 100) * 62.8} 62.8`} />
              </svg>
            </div>
            Profile {profileScore}% complete - finish to unlock bidding
            <ChevronRight size={12} />
          </Link>
        )}
      </DashboardHero>

      {/* === KPI strip === */}
      <div className="stagger-3d grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <DashboardMetricCard icon={<FileText size={18} />} label="Agreements" value={String(a?.activeAgreements ?? 0)} sub="Active" accent="#3b82f6" href="/agreements" />
        <DashboardMetricCard icon={<CreditCard size={18} />} label="Next Payment" value={formatCurrency(a?.nextPaymentAmount ?? 0)} sub={activeAgreement ? `Due ${formatDate(nextPaymentDueDate(activeAgreement.startDate)).split(' ').slice(0,2).join(' ')}` : 'No active lease'} accent="#f59e0b" href="/payments" />
        {walletEnabled ? (
          <>
            <DashboardMetricCard icon={<PiggyBank size={18} />} label="Total Saved" value={formatCurrency(a?.totalSaved ?? 0)} sub={`${a?.savingsProgress ?? 0}% of target`} accent="#10b981" href="/savings" />
            <DashboardMetricCard icon={<Wallet size={18} />} label="Wallet" value={formatCurrency(a?.walletBalance ?? 0)} sub="Available balance" accent="#8b5cf6" href="/savings" />
          </>
        ) : (
          <>
            <DashboardMetricCard icon={<Send size={18} />} label="Applications" value={String(a?.totalApplications ?? 0)} sub={`${a?.pendingApplications ?? 0} pending`} accent="#10b981" href="/applications" />
            <DashboardMetricCard icon={<Heart size={18} />} label="Saved Homes" value={String(savedCount)} sub="Your shortlist" accent="#8b5cf6" href="/saved" />
          </>
        )}
      </div>
    </>
  )
}

// Next rent due date on the agreement's monthly cycle: the startDate day-of-month,
// this month if that occurrence hasn't passed yet, otherwise next month.
// Mirrors the rent-reminder math in the server-side scheduler.
function nextPaymentDueDate(startDate: string): Date {
  const dueDay = new Date(startDate).getDate()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), dueDay)
  if (thisMonth >= today) return thisMonth
  return new Date(now.getFullYear(), now.getMonth() + 1, dueDay)
}
