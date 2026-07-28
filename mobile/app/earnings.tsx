import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { Stack, useRouter } from 'expo-router'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard } from '../lib/neu'
import { api } from '../lib/api'

interface Earnings {
  totalEarned: number
  totalPaid: number
  pendingPayout: number
  completedJobs: number
  activeJobs: number
  rating: number
  reviewCount: number
  byType: { type: string; jobs: number; total: number }[]
  byMonth: { month: string; jobs: number; total: number }[]
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Last 6 month keys (YYYY-MM) ending at the current month, oldest first. */
function last6Months(): string[] {
  const keys: string[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(d.toISOString().slice(0, 7))
  }
  return keys
}

export default function EarningsScreen() {
  const c = useThemeColors()
  const router = useRouter()

  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ['worker-me'],
    queryFn: () => api.get<{ worker: unknown | null }>('/workers/me'),
  })
  const hasProfile = !!meData?.worker

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['worker-earnings'],
    queryFn: () => api.get<Earnings>('/workers/me/earnings'),
    enabled: hasProfile,
  })

  const months = last6Months()
  const byMonthMap = new Map((data?.byMonth ?? []).map((m) => [m.month, m]))
  const chartRows = months.map((key) => ({ key, ...(byMonthMap.get(key) ?? { jobs: 0, total: 0 }) }))
  const maxTotal = Math.max(1, ...chartRows.map((m) => m.total))

  const loading = meLoading || (hasProfile && isLoading)

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: 'Earnings' }} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
        contentContainerStyle={s.listContent}
      >
        {loading && !isRefetching ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
        ) : !hasProfile ? (
          <View style={s.empty}>
            <Ionicons name="wallet-outline" size={48} color={c.muted} />
            <Text style={[s.emptyTitle, { color: c.text }]}>No worker profile</Text>
            <Text style={[s.emptySubtitle, { color: c.muted }]}>
              Create a worker profile to start earning from service jobs
            </Text>
            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: c.primary }]}
              onPress={() => router.push('/become-worker' as never)}
            >
              <Text style={s.ctaBtnText}>Become a Worker</Text>
            </TouchableOpacity>
          </View>
        ) : data ? (
          <>
            {/* Stat cards */}
            <View style={s.statGrid}>
              <View style={[s.statCard, neuCard(c)]}>
                <Ionicons name="cash-outline" size={18} color={c.primary} />
                <Text style={[s.statValue, { color: c.text }]}>GH₵{data.totalEarned.toFixed(2)}</Text>
                <Text style={[s.statLabel, { color: c.muted }]}>Total Earned</Text>
              </View>
              <View style={[s.statCard, neuCard(c)]}>
                <Ionicons name="hourglass-outline" size={18} color="#f59e0b" />
                <Text style={[s.statValue, { color: c.text }]}>GH₵{data.pendingPayout.toFixed(2)}</Text>
                <Text style={[s.statLabel, { color: c.muted }]}>Pending Payout</Text>
              </View>
              <View style={[s.statCard, neuCard(c)]}>
                <Ionicons name="checkmark-done-outline" size={18} color="#10b981" />
                <Text style={[s.statValue, { color: c.text }]}>{data.completedJobs}</Text>
                <Text style={[s.statLabel, { color: c.muted }]}>Completed Jobs</Text>
              </View>
              <View style={[s.statCard, neuCard(c)]}>
                <Ionicons name="briefcase-outline" size={18} color="#06b6d4" />
                <Text style={[s.statValue, { color: c.text }]}>{data.activeJobs}</Text>
                <Text style={[s.statLabel, { color: c.muted }]}>Active Jobs</Text>
              </View>
            </View>

            {/* Rating */}
            <View style={[s.section, neuCard(c)]}>
              <Text style={[s.sectionTitle, { color: c.text }]}>Rating</Text>
              <View style={s.ratingRow}>
                <View style={s.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons
                      key={star}
                      name={star <= Math.round(data.rating) ? 'star' : 'star-outline'}
                      size={20}
                      color="#f59e0b"
                    />
                  ))}
                </View>
                <Text style={[s.ratingValue, { color: c.text }]}>{data.rating.toFixed(1)}</Text>
                <Text style={[s.ratingCount, { color: c.muted }]}>({data.reviewCount} reviews)</Text>
              </View>
            </View>

            {/* 6-month chart */}
            <View style={[s.section, neuCard(c)]}>
              <Text style={[s.sectionTitle, { color: c.text }]}>Last 6 Months</Text>
              <View style={s.chartRow}>
                {chartRows.map((m) => (
                  <View key={m.key} style={s.chartCol}>
                    <Text style={[s.chartTotal, { color: c.muted }]} numberOfLines={1}>
                      {m.total > 0 ? `₵${m.total >= 1000 ? `${(m.total / 1000).toFixed(1)}k` : m.total.toFixed(0)}` : ''}
                    </Text>
                    <View style={[s.chartBarTrack, { backgroundColor: c.surface }]}>
                      <View
                        style={[
                          s.chartBar,
                          { backgroundColor: c.primary, height: `${Math.max(m.total > 0 ? 4 : 0, (m.total / maxTotal) * 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={[s.chartLabel, { color: c.muted }]}>
                      {MONTH_NAMES[Number(m.key.slice(5, 7)) - 1]}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* By job type */}
            <View style={[s.section, neuCard(c)]}>
              <Text style={[s.sectionTitle, { color: c.text }]}>Earnings by Job Type</Text>
              {data.byType.length === 0 ? (
                <Text style={[s.emptySubtitle, { color: c.muted, marginTop: spacing.sm }]}>
                  No completed jobs yet
                </Text>
              ) : (
                data.byType.map((t, i) => (
                  <View
                    key={t.type}
                    style={[
                      s.typeRow,
                      i > 0 && { borderTopWidth: 1, borderTopColor: c.border },
                    ]}
                  >
                    <View style={s.typeInfo}>
                      <Text style={[s.typeName, { color: c.text }]}>
                        {t.type.charAt(0).toUpperCase() + t.type.slice(1)}
                      </Text>
                      <Text style={[s.typeJobs, { color: c.muted }]}>{t.jobs} job{t.jobs === 1 ? '' : 's'}</Text>
                    </View>
                    <Text style={[s.typeTotal, { color: c.primary }]}>GH₵{t.total.toFixed(2)}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statCard: { flexBasis: '47%', flexGrow: 1, padding: spacing.md, gap: 4 },
  statValue: { fontSize: 18, fontFamily: 'Manrope_800ExtraBold' },
  statLabel: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  section: { padding: spacing.md },
  sectionTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  starsRow: { flexDirection: 'row', gap: 2 },
  ratingValue: { fontSize: 16, fontFamily: 'Manrope_800ExtraBold' },
  ratingCount: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: spacing.md, height: 140 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartTotal: { fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
  chartBarTrack: { width: '100%', flex: 1, borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  chartBar: { width: '100%', borderRadius: 6 },
  chartLabel: { fontSize: 10, fontFamily: 'Manrope_500Medium' },
  typeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  typeInfo: { gap: 2 },
  typeName: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  typeJobs: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  typeTotal: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  empty: { alignItems: 'center', marginTop: 60, gap: spacing.sm, paddingHorizontal: spacing.lg },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
  ctaBtn: { marginTop: spacing.md, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  ctaBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_700Bold' },
})
