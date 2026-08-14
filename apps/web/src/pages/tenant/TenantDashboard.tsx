import type { Property } from '@/types'
import { useAuthStore } from '@/stores/authStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useMyAnalytics, usePayments, useSavingsPlans, useAgreements, useNotifications, useDisputes, usePropertyRecommendations, useMaintenanceRequests, useMyAchievements, useMyStreak } from '@/hooks/useApi'
import { api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'
import { DashboardSkeleton } from '@/components/ui/Skeleton'
import { TenantHeroSection } from './components/TenantHeroSection'
import { TenantResidenceStatus } from './components/TenantResidenceStatus'
import { TenantAlertBanners } from './components/TenantAlertBanners'
import { TenantTodayActions } from './components/TenantTodayActions'
import { TenantBadgesPanel } from './components/TenantBadgesPanel'
import { TenantPaymentsChart } from './components/TenantPaymentsChart'
import { TenantActivityTimeline } from './components/TenantActivityTimeline'
import { TenantCreditScoreCard } from './components/TenantCreditScoreCard'
import { TenantSavingsGoalCard } from './components/TenantSavingsGoalCard'
import { TenantActiveLeaseCard } from './components/TenantActiveLeaseCard'
import { TenantNotificationsCard } from './components/TenantNotificationsCard'
import { TenantMaintenanceCard } from './components/TenantMaintenanceCard'
import { TenantQuickLinks } from './components/TenantQuickLinks'
import { TenantRecommendedProperties } from './components/TenantRecommendedProperties'
import { TenantSavedProperties } from './components/TenantSavedProperties'
import { TenantApplicationsPanel } from './components/TenantApplicationsPanel'
import { TenantPaymentSummaryCard } from './components/TenantPaymentSummaryCard'
import { TenantRentalHistoryCard } from './components/TenantRentalHistoryCard'

export function TenantDashboard() {
  const user = useAuthStore((s) => s.user)
  const { data: analytics, isLoading } = useMyAnalytics()
  const { data: paymentsData } = usePayments()
  const { data: plansData } = useSavingsPlans()
  const { data: agreementsData } = useAgreements()
  const { data: notifData } = useNotifications()
  const { data: disputesData } = useDisputes()
  const { data: creditData } = useQuery({ queryKey: ['credit-score'], queryFn: () => api.get<{ score: number; factors: Record<string, number> }>('/credit/me') })
  const { data: profileData } = useQuery({ queryKey: ['tenant-profile'], queryFn: () => api.get<{ completionScore: number; profileComplete: boolean }>('/tenant-profile/me') })
  const { data: recommendations } = usePropertyRecommendations()
  const { data: maintenanceData } = useMaintenanceRequests()
  const { data: streakData } = useMyStreak()
  const { data: achievementsData } = useMyAchievements()
  const favoriteIds = useFavoritesStore((s) => s.ids)
  const favIdsKey = JSON.stringify([...favoriteIds].sort())
  const { data: favPropsItems } = useQuery({
    queryKey: ['favorite-properties-detail', favIdsKey],
    queryFn: async () => {
      const ids = useFavoritesStore.getState().ids
      if (ids.length === 0) return []
      const results = await Promise.all(
        ids.slice(0, 6).map((id) => api.get<Property & { _id?: string }>(`/properties/${id}`).catch(() => null))
      )
      return results.filter((r): r is Property & { _id?: string } => r !== null)
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
  const favPropsData = { items: (favPropsItems ?? []).filter((p) => favoriteIds.includes(p.id ?? p._id)) }

  const payments = paymentsData?.items ?? []
  const plans = plansData?.items ?? []
  const agreements = agreementsData?.items ?? []
  const notifications = (notifData?.items ?? []).filter((n) => !n.read).slice(0, 4)
  const disputes = disputesData?.items ?? []
  const completedPayments = payments.filter((p) => p.status === 'completed')
  const myMaintenance = (maintenanceData?.items ?? []).slice(0, 3)
  const recentPayments = completedPayments.slice(-8).reverse()
  const activePlan = plans.find((p) => p.status === 'active')
  const activeAgreement = agreements.find((a) => a.status === 'active')
  const openDisputes = disputes.filter((d) => d.status !== 'resolved' && d.status !== 'closed')

  if (isLoading) return <DashboardSkeleton />

  const a = analytics as Record<string, number> | undefined
  const credit = creditData as { score: number; factors: Record<string, number> } | undefined
  const creditScore = credit?.score ?? 0
  const profileScore = profileData?.completionScore ?? 0
  const profileComplete = profileData?.profileComplete ?? false

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-6">
      <TenantHeroSection
        greeting={greeting}
        firstName={user?.firstName}
        profileComplete={profileComplete}
        profileScore={profileScore}
        analytics={a}
        activeAgreement={activeAgreement}
      />

      <TenantResidenceStatus activeAgreement={activeAgreement} />

      <TenantAlertBanners analytics={a} openDisputesCount={openDisputes.length} />

      <TenantTodayActions
        profileComplete={profileComplete}
        profileScore={profileScore}
        analytics={a}
        activeAgreement={activeAgreement}
        maintenanceCount={myMaintenance.length}
        openDisputesCount={openDisputes.length}
        hasRecommendations={Boolean(recommendations?.length)}
      />

      <TenantBadgesPanel streak={streakData} achievements={achievementsData?.items} />

      {/* === Main 3-col grid === */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">

        {/* Left: Chart + Activity (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          <TenantPaymentsChart completedPayments={completedPayments} recentPayments={recentPayments} />
          <TenantActivityTimeline recentPayments={recentPayments} openDisputes={openDisputes} notifications={notifications} />
        </div>

        {/* Right sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <TenantCreditScoreCard creditScore={creditScore} factors={credit?.factors} />

          {activePlan && <TenantSavingsGoalCard plan={activePlan} />}

          {activeAgreement && <TenantActiveLeaseCard agreement={activeAgreement} />}

          {notifications.length > 0 && <TenantNotificationsCard notifications={notifications} />}

          <TenantMaintenanceCard requests={myMaintenance} />

          <TenantQuickLinks profileScore={profileScore} />
        </div>
      </div>

      {(recommendations?.length ?? 0) > 0 && (
        <TenantRecommendedProperties properties={recommendations as Array<Property & { _id?: string }>} />
      )}

      <TenantSavedProperties properties={favPropsData.items} />

      {/* === Bottom row: Applications, Payment Stats, Rental History === */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <TenantApplicationsPanel analytics={a} />
        <TenantPaymentSummaryCard analytics={a} />
        <TenantRentalHistoryCard analytics={a} />
      </div>
    </div>
  )
}
