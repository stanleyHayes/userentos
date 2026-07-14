import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { usePlatformAnalytics } from '@/hooks/useApi'
import { DashboardSkeleton } from '@/components/ui/Skeleton'
import { Link } from 'react-router-dom'
import { Shield, Building2, Users, Scale, HardDrive, Activity, BarChart3, Eye, DollarSign } from 'lucide-react'
import { DoodleStars } from '@/components/ui/Doodles'
import { OverviewTab } from './components/OverviewTab'
import { PropertiesTab } from './components/PropertiesTab'
import { FinancialTab } from './components/FinancialTab'
import { PeopleTab } from './components/PeopleTab'
import { EngagementTab } from './components/EngagementTab'
import { SystemTab } from './components/SystemTab'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'

type TabKey = 'overview' | 'properties' | 'financial' | 'people' | 'engagement' | 'system'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <BarChart3 size={14} /> },
  { key: 'properties', label: 'Properties', icon: <Building2 size={14} /> },
  { key: 'financial', label: 'Financial', icon: <DollarSign size={14} /> },
  { key: 'people', label: 'People', icon: <Users size={14} /> },
  { key: 'engagement', label: 'Engagement', icon: <Activity size={14} /> },
  { key: 'system', label: 'System', icon: <HardDrive size={14} /> },
]

export function GovernmentPanel() {
  const { data: raw, isLoading } = usePlatformAnalytics()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const { attach: pillAttach, style: pillStyle, visible: pillVisible } = useSlidingIndicator<HTMLDivElement>(activeTab)

  if (isLoading) return <DashboardSkeleton />

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = (raw ?? {}) as Record<string, any>
  const users = a.users ?? {}
  const props = a.properties ?? {}
  const agr = a.agreements ?? {}
  const pay = a.payments ?? {}
  const dis = a.disputes ?? {}
  const apps = a.applications ?? {}
  const rev = a.reviews ?? {}
  const credit = a.creditScores ?? {}
  const inv = a.investments ?? {}
  const lo = a.loans ?? {}
  const tp = a.tenantProfiles ?? {}
  const wal = a.wallets ?? {}
  const sav = a.savings ?? {}
  const notif = a.notifications ?? {}
  const msg = a.messaging ?? {}
  const fav = a.favorites ?? {}
  const invit = a.invitations ?? {}
  const docs = a.documents ?? {}
  const audit = a.auditLogs ?? {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white">
            <Shield size={20} />
          </div>
          <div className="relative">
            <DoodleStars className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
            <h1 className="text-xl sm:text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
              Platform Analytics
            </h1>
            <p className="text-xs text-muted dark:text-gray-400">Complete database snapshot across all {Object.keys(a).length} collections</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/government/reviews">
            <Button size="sm" variant="outline"><Eye size={14} /> <span className="hidden sm:inline">Reviews</span></Button>
          </Link>
          <Link to="/government/simulation">
            <Button size="sm" variant="outline"><Scale size={14} /> <span className="hidden sm:inline">Simulate</span></Button>
          </Link>
        </div>
      </div>

      {/* Tab navigation */}
      <div ref={pillAttach} className="relative isolate flex gap-1 overflow-x-auto rounded-full border border-border/70 bg-surface/60 p-1 scrollbar-hide dark:border-white/10 dark:bg-white/[0.04]">
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-primary shadow-md transition-[transform,width,height] duration-300 ease-out"
          style={{ ...pillStyle, opacity: pillVisible ? 1 : 0 }}
        />
        {TABS.map((tab) => (
          <button
            key={tab.key}
            data-tab-key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative z-10 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeTab === tab.key
                ? 'text-white'
                : 'text-muted hover:bg-white/60 hover:text-foreground dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          users={users} props={props} agr={agr} pay={pay} dis={dis}
          sav={sav} apps={apps} rev={rev} lo={lo} inv={inv}
        />
      )}
      {activeTab === 'properties' && <PropertiesTab props={props} />}
      {activeTab === 'financial' && <FinancialTab pay={pay} inv={inv} lo={lo} wal={wal} sav={sav} />}
      {activeTab === 'people' && <PeopleTab users={users} tp={tp} credit={credit} apps={apps} rev={rev} />}
      {activeTab === 'engagement' && <EngagementTab dis={dis} rev={rev} notif={notif} msg={msg} fav={fav} invit={invit} props={props} />}
      {activeTab === 'system' && <SystemTab docs={docs} audit={audit} agr={agr} notif={notif} />}
    </div>
  )
}
