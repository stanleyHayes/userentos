import { useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'

type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum'

type AchievementCode =
  | 'first_lease'
  | 'on_time_streak_3'
  | 'on_time_streak_6'
  | 'on_time_streak_12'
  | 'on_time_streak_24'
  | 'verified_landlord'
  | 'first_savings_goal'
  | 'savings_goal_completed'
  | 'rent_paid_via_payroll'
  | 'first_property_listed'
  | 'profile_verified'
  | 'loan_settled'

interface AchievementDefinition {
  code: AchievementCode
  title: string
  description: string
  icon: keyof typeof Ionicons.glyphMap
  tier: AchievementTier
}

interface Achievement {
  id: string
  code: AchievementCode
  earnedAt?: string
}

interface PaymentStreak {
  currentStreak: number
  longestStreak: number
}

interface StreakLeaderboardEntry {
  userId: string
  displayName: string
  longestStreak: number
  currentStreak: number
  tier: AchievementTier
}

const TIER_ORDER: AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum']

const TIER_COLORS: Record<AchievementTier, string> = {
  bronze: '#cd7f32',
  silver: '#94a3b8',
  gold: '#f59e0b',
  platinum: '#a78bfa',
}

const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  { code: 'first_lease', title: 'First Lease', description: 'Signed your first rental agreement on RentOS.', icon: 'home-outline', tier: 'bronze' },
  { code: 'on_time_streak_3', title: '3-Month Streak', description: 'Paid rent on time for 3 consecutive months.', icon: 'flame-outline', tier: 'bronze' },
  { code: 'on_time_streak_6', title: '6-Month Streak', description: 'Paid rent on time for 6 consecutive months.', icon: 'flame', tier: 'silver' },
  { code: 'on_time_streak_12', title: '1-Year Streak', description: 'Paid rent on time for 12 consecutive months.', icon: 'ribbon-outline', tier: 'gold' },
  { code: 'on_time_streak_24', title: '2-Year Streak', description: 'Paid rent on time for 24 consecutive months.', icon: 'trophy', tier: 'platinum' },
  { code: 'verified_landlord', title: 'Verified Landlord', description: 'Your landlord profile is fully verified.', icon: 'shield-checkmark', tier: 'silver' },
  { code: 'first_savings_goal', title: 'First Savings Goal', description: 'Created your first savings plan.', icon: 'wallet-outline', tier: 'bronze' },
  { code: 'savings_goal_completed', title: 'Goal Smasher', description: 'Reached the target on a savings goal.', icon: 'star', tier: 'gold' },
  { code: 'rent_paid_via_payroll', title: 'Payroll Pro', description: 'Paid rent automatically via payroll deduction.', icon: 'briefcase', tier: 'silver' },
  { code: 'first_property_listed', title: 'Welcome, Landlord', description: 'Listed your first property on RentOS.', icon: 'business-outline', tier: 'bronze' },
  { code: 'profile_verified', title: 'Verified Member', description: 'Identity verified on RentOS.', icon: 'shield-checkmark-outline', tier: 'silver' },
  { code: 'loan_settled', title: 'Loan Settled', description: 'Fully repaid a financing contract.', icon: 'checkmark-done-circle', tier: 'gold' },
]

export default function AchievementsScreen() {
  const c = useThemeColors()

  const { data: achievementsData, isLoading: loadingA, refetch: refetchA, isRefetching: refA } = useQuery({
    queryKey: ['achievements', 'mine'],
    queryFn: () => api.get<{ items: Achievement[] }>('/achievements/mine'),
  })
  const { data: streak, isLoading: loadingS, refetch: refetchS, isRefetching: refS } = useQuery({
    queryKey: ['achievements', 'streak'],
    queryFn: () => api.get<PaymentStreak>('/achievements/streak'),
  })
  const { data: leaderboardData, isLoading: loadingL, refetch: refetchL, isRefetching: refL } = useQuery({
    queryKey: ['achievements', 'leaderboard'],
    queryFn: () => api.get<{ items: StreakLeaderboardEntry[] }>('/achievements/leaderboard'),
  })

  const earnedMap = useMemo(() => {
    const m = new Map<string, { earnedAt?: string }>()
    for (const a of achievementsData?.items ?? []) m.set(a.code, { earnedAt: a.earnedAt })
    return m
  }, [achievementsData])

  const sortedCatalog = useMemo(
    () => [...ACHIEVEMENT_CATALOG].sort(
      (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
    ),
    [],
  )

  const earnedCount = earnedMap.size
  const totalCount = ACHIEVEMENT_CATALOG.length
  const currentStreak = streak?.currentStreak ?? 0
  const longestStreak = streak?.longestStreak ?? 0

  const leaderboard = leaderboardData?.items ?? []

  const isLoading = loadingA || loadingS || loadingL
  const isRefetching = refA || refS || refL
  const refetchAll = () => {
    refetchA()
    refetchS()
    refetchL()
  }

  if (isLoading) {
    return (
      <View style={[s.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  const streakHint = currentStreak === 0
    ? 'Make your first on-time payment to start your streak.'
    : currentStreak < 3
      ? 'Keep paying on time to unlock the 3-month badge!'
      : currentStreak < 12
        ? "You're doing great. Don't break the chain!"
        : 'Legendary consistency — keep it up!'

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} tintColor={c.primary} />}
    >
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[s.heading, { color: c.text }]}>Achievements</Text>
          <Text style={[s.sub, { color: c.muted }]}>
            Track your streaks, unlock badges, and lead the board.
          </Text>
        </View>
        <View style={[s.unlockBadge, { backgroundColor: c.accent + '20' }]}>
          <Text style={[s.unlockText, { color: c.accent }]}>{earnedCount} / {totalCount}</Text>
        </View>
      </View>

      {/* Streak card */}
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={s.cardTitleRow}>
          <Ionicons name="trending-up" size={16} color="#f97316" />
          <Text style={[s.cardTitle, { color: c.text }]}>Your Payment Streak</Text>
        </View>
        <View style={s.streakBody}>
          <View style={[s.ring, { borderColor: c.primary }]}>
            <Text style={[s.ringValue, { color: c.text }]}>{currentStreak}</Text>
            <Text style={[s.ringLabel, { color: c.muted }]}>months</Text>
          </View>
          <View style={s.streakStats}>
            <View style={[s.streakStatBox, { backgroundColor: c.surface }]}>
              <Text style={[s.streakStatLabel, { color: c.muted }]}>Current</Text>
              <Text style={[s.streakStatValue, { color: c.text }]}>{currentStreak}</Text>
            </View>
            <View style={[s.streakStatBox, { backgroundColor: c.surface }]}>
              <Text style={[s.streakStatLabel, { color: c.muted }]}>Longest</Text>
              <Text style={[s.streakStatValue, { color: c.text }]}>{longestStreak}</Text>
            </View>
          </View>
        </View>
        <Text style={[s.streakHint, { color: c.muted }]}>{streakHint}</Text>
      </View>

      {/* Leaderboard */}
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={s.cardTitleRow}>
          <Ionicons name="trophy" size={16} color="#eab308" />
          <Text style={[s.cardTitle, { color: c.text }]}>Streak Leaderboard</Text>
        </View>
        {leaderboard.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
            <Ionicons name="trophy-outline" size={28} color={c.muted} />
            <Text style={[s.muted, { color: c.muted, marginTop: 6 }]}>No streak data yet. Be the first!</Text>
          </View>
        ) : (
          leaderboard.slice(0, 10).map((entry, i) => (
            <View key={entry.userId} style={[s.leaderboardRow, { backgroundColor: c.surface }]}>
              <View style={[s.rankBadge, { backgroundColor: rankColor(i, c.border) }]}>
                <Text style={[s.rankText, { color: i < 3 ? '#1e293b' : c.muted }]}>{i + 1}</Text>
              </View>
              <Text style={[s.lbName, { color: c.text }]} numberOfLines={1}>{entry.displayName}</Text>
              <View style={[s.tierBadge, { backgroundColor: TIER_COLORS[entry.tier] + '25' }]}>
                <Text style={[s.tierBadgeText, { color: TIER_COLORS[entry.tier] }]}>{entry.tier}</Text>
              </View>
              <Text style={[s.lbStreak, { color: c.text }]}>{entry.longestStreak} mo</Text>
            </View>
          ))
        )}
      </View>

      {/* Badges grid */}
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.cardTitle, { color: c.text, marginBottom: spacing.sm }]}>All Badges</Text>
        <View style={s.badgeGrid}>
          {sortedCatalog.map((def) => {
            const earned = earnedMap.get(def.code)
            const tierColor = TIER_COLORS[def.tier]
            return (
              <View
                key={def.code}
                style={[
                  s.badge,
                  {
                    backgroundColor: earned ? tierColor + '15' : c.surface,
                    borderColor: earned ? tierColor : c.border,
                    opacity: earned ? 1 : 0.5,
                  },
                ]}
              >
                <View style={[s.badgeIcon, { backgroundColor: earned ? tierColor + '30' : c.border + '40' }]}>
                  <Ionicons
                    name={earned ? def.icon : 'lock-closed-outline'}
                    size={20}
                    color={earned ? tierColor : c.muted}
                  />
                </View>
                <Text style={[s.badgeTitle, { color: c.text }]} numberOfLines={1}>{def.title}</Text>
                <Text style={[s.badgeDesc, { color: c.muted }]} numberOfLines={2}>{def.description}</Text>
                <Text style={[s.badgeTier, { color: tierColor }]}>{def.tier}</Text>
              </View>
            )
          })}
        </View>
      </View>
    </ScrollView>
  )
}

function rankColor(i: number, fallback: string): string {
  if (i === 0) return '#fbbf24'
  if (i === 1) return '#cbd5e1'
  if (i === 2) return '#d97706'
  return fallback
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  heading: { fontSize: 22, fontFamily: 'Manrope_800ExtraBold' },
  sub: { fontSize: 12, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  unlockBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  unlockText: { fontSize: 12, fontFamily: 'Manrope_700Bold' },

  card: { borderRadius: 14, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold' },

  streakBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, justifyContent: 'center', marginVertical: spacing.sm },
  ring: { width: 96, height: 96, borderRadius: 48, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 28, fontFamily: 'Manrope_800ExtraBold' },
  ringLabel: { fontSize: 10, fontFamily: 'Manrope_500Medium' },
  streakStats: { gap: 6 },
  streakStatBox: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, minWidth: 90, alignItems: 'center' },
  streakStatLabel: { fontSize: 10, fontFamily: 'Manrope_500Medium', textTransform: 'uppercase' },
  streakStatValue: { fontSize: 18, fontFamily: 'Manrope_800ExtraBold' },
  streakHint: { fontSize: 11, fontFamily: 'Manrope_400Regular', textAlign: 'center', marginTop: spacing.sm },

  leaderboardRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: 8, marginBottom: 6,
  },
  rankBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 11, fontFamily: 'Manrope_800ExtraBold' },
  lbName: { flex: 1, fontSize: 13, fontFamily: 'Manrope_700Bold' },
  tierBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tierBadgeText: { fontSize: 9, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },
  lbStreak: { fontSize: 12, fontFamily: 'Manrope_700Bold' },

  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    width: '47%', borderRadius: 12, borderWidth: 1.5, padding: 10, gap: 4,
  },
  badgeIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeTitle: { fontSize: 12, fontFamily: 'Manrope_700Bold', marginTop: 4 },
  badgeDesc: { fontSize: 10, fontFamily: 'Manrope_400Regular', lineHeight: 14 },
  badgeTier: { fontSize: 9, fontFamily: 'Manrope_700Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  muted: { fontSize: 12, fontFamily: 'Manrope_500Medium' },
})
