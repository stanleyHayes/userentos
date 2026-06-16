import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Dimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { formatCompact } from '../lib/format'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

const screenW = Dimensions.get('window').width

export default function AnalyticsScreen() {
  const c = useThemeColors()
  const user = useAuthStore((s) => s.user)
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const isLandlord = user?.activeRole === 'landlord' || user?.activeRole === 'property_manager'

  async function load() {
    try {
      const data = await api.get<Record<string, unknown>>('/analytics/me')
      setAnalytics(data)
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  if (!analytics) {
    return (
      <View style={[s.centered, { backgroundColor: c.background }]}>
        <Ionicons name="bar-chart-outline" size={48} color={c.muted} />
        <Text style={[s.emptyTitle, { color: c.text }]}>No analytics data</Text>
        <Text style={[s.emptyDesc, { color: c.muted }]}>Analytics will appear once you have rental activity.</Text>
      </View>
    )
  }

  const a = analytics

  if (isLandlord) {
    const monthlyIncome = (a.monthlyIncome ?? {}) as Record<string, number>
    const months = Object.entries(monthlyIncome).sort(([a], [b]) => a.localeCompare(b)).slice(-6)
    const maxIncome = Math.max(...months.map(([, v]) => v), 1)

    return (
      <ScrollView style={[s.container, { backgroundColor: c.background }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>
        {/* KPI Strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.kpiStrip}>
          <KPICard icon="business" label="Properties" value={String(a.totalProperties ?? 0)} color={c.primary} c={c} />
          <KPICard icon="people" label="Tenants" value={String(a.activeTenants ?? 0)} color={c.accent} c={c} />
          <KPICard icon="cash" label="Revenue" value={formatCompact(Number(a.totalRevenue ?? 0))} color={c.secondary} c={c} />
          <KPICard icon="trending-up" label="Collection" value={`${a.collectionRate ?? 0}%`} color="#8b5cf6" c={c} />
        </ScrollView>

        {/* Monthly Revenue */}
        <View style={[s.card, { backgroundColor: c.card }]}>
          <Text style={[s.cardTitle, { color: c.text }]}>Monthly Revenue</Text>
          {months.length === 0 ? (
            <Text style={[s.noData, { color: c.muted }]}>No revenue data yet</Text>
          ) : (
            <View style={s.chartWrap}>
              {months.map(([month, amount]) => {
                const pct = maxIncome > 0 ? (amount / maxIncome) * 100 : 0
                return (
                  <View key={month} style={s.barRow}>
                    <Text style={[s.barMonth, { color: c.muted }]}>{month.slice(-5)}</Text>
                    <View style={[s.barTrack, { backgroundColor: c.surface }]}>
                      <View style={[s.barFill, { width: `${pct}%`, backgroundColor: c.primary }]} />
                    </View>
                    <Text style={[s.barAmt, { color: c.text }]} numberOfLines={1}>{formatCompact(amount)}</Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* Breakdown */}
        <View style={[s.card, { backgroundColor: c.card }]}>
          <Text style={[s.cardTitle, { color: c.text }]}>Portfolio</Text>
          <View style={s.breakdownRow}>
            <BreakdownPill label="Occupied" value={String(a.occupiedProperties ?? 0)} color={c.accent} c={c} />
            <BreakdownPill label="Available" value={String(a.availableProperties ?? 0)} color={c.primary} c={c} />
            <BreakdownPill label="Agreements" value={String(a.activeAgreements ?? 0)} color={c.secondary} c={c} />
            <BreakdownPill label="Disputes" value={String(a.openDisputes ?? 0)} color={c.danger} c={c} />
          </View>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    )
  }

  // Tenant
  const savingsPct = Math.min(100, Number(a.savingsProgress ?? 0))

  return (
    <ScrollView style={[s.container, { backgroundColor: c.background }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>
      {/* KPI Strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.kpiStrip}>
        <KPICard icon="cash" label="Total Paid" value={formatCompact(Number(a.totalPaid ?? 0))} color={c.primary} c={c} />
        <KPICard icon="receipt" label="Payments" value={String(a.paymentCount ?? 0)} color={c.accent} c={c} />
        <KPICard icon="wallet" label="Saved" value={formatCompact(Number(a.totalSaved ?? 0))} color={c.secondary} c={c} />
        <KPICard icon="trending-up" label="Progress" value={`${savingsPct}%`} color="#8b5cf6" c={c} />
      </ScrollView>

      {/* Savings Breakdown */}
      <View style={[s.card, { backgroundColor: c.card }]}>
        <Text style={[s.cardTitle, { color: c.text }]}>Savings Overview</Text>
        <View style={s.breakdownRow}>
          <BreakdownPill label="Saved" value={formatCompact(Number(a.totalSaved ?? 0))} color={c.accent} c={c} />
          <BreakdownPill label="Target" value={formatCompact(Number(a.savingsTarget ?? 0))} color={c.primary} c={c} />
          <BreakdownPill label="Plans" value={String(a.activePlans ?? 0)} color={c.secondary} c={c} />
        </View>
      </View>

      {/* Progress */}
      {Number(a.savingsTarget ?? 0) > 0 && (
        <View style={[s.card, { backgroundColor: c.card }]}>
          <View style={s.progressHeader}>
            <Text style={[s.cardTitle, { color: c.text, marginBottom: 0 }]}>Savings Progress</Text>
            <Text style={[s.progressPct, { color: c.accent }]}>{savingsPct}%</Text>
          </View>
          <View style={[s.progressTrack, { backgroundColor: c.surface }]}>
            <View style={[s.progressFill, { width: `${savingsPct}%`, backgroundColor: c.accent }]} />
          </View>
          <Text style={[s.progressLabel, { color: c.muted }]}>
            {formatCompact(Number(a.totalSaved ?? 0))} of {formatCompact(Number(a.savingsTarget ?? 0))}
          </Text>
        </View>
      )}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  )
}

function KPICard({ icon, label, value, color, c }: { icon: string; label: string; value: string; color: string; c: ReturnType<typeof useThemeColors> }) {
  return (
    <View
      style={[
        s.kpi,
        {
          backgroundColor: color + '08',
          borderLeftWidth: 3,
          borderLeftColor: color,
          borderColor: color + '15',
          shadowColor: color,
          shadowOpacity: 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        },
      ]}
    >
      <View style={[s.kpiIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={color} />
      </View>
      <Text style={[s.kpiValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[s.kpiLabel, { color: c.muted }]}>{label}</Text>
    </View>
  )
}

function BreakdownPill({ label, value, color, c }: { label: string; value: string; color: string; c: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={[s.pill, { backgroundColor: c.surface }]}>
      <Text style={[s.pillValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[s.pillLabel, { color: c.muted }]}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  emptyDesc: { fontSize: 13, textAlign: 'center', fontFamily: 'Manrope_400Regular' },

  // KPI horizontal strip
  kpiStrip: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 10 },
  kpi: { width: (screenW - 56) / 2.5, borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  kpiValue: { fontSize: 18, fontFamily: 'Manrope_800ExtraBold' },
  kpiLabel: { fontSize: 11, fontFamily: 'Manrope_500Medium' },

  // Cards
  card: { marginHorizontal: spacing.md, borderRadius: 14, padding: spacing.md, marginTop: spacing.sm, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  cardTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold', marginBottom: spacing.md },
  noData: { fontSize: 13, textAlign: 'center', paddingVertical: spacing.md, fontFamily: 'Manrope_400Regular' },

  // Chart
  chartWrap: { gap: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barMonth: { width: 42, fontSize: 10, fontFamily: 'Manrope_500Medium' },
  barTrack: { flex: 1, height: 18, borderRadius: 9, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 9 },
  barAmt: { width: 65, fontSize: 10, fontFamily: 'Manrope_600SemiBold', textAlign: 'right' },

  // Breakdown
  breakdownRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { flex: 1, minWidth: 70, borderRadius: 10, padding: 12, alignItems: 'center', gap: 4 },
  pillValue: { fontSize: 18, fontFamily: 'Manrope_800ExtraBold' },
  pillLabel: { fontSize: 10, fontFamily: 'Manrope_400Regular' },

  // Progress
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  progressPct: { fontSize: 16, fontFamily: 'Manrope_800ExtraBold' },
  progressTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  progressLabel: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 6 },
})
