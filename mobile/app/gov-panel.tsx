import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Dimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { formatCompact } from '../lib/format'
import { api } from '../lib/api'

const screenW = Dimensions.get('window').width

interface PlatformAnalytics {
  totalUsers?: number
  totalProperties?: number
  paymentVolume?: number
  activeDisputes?: number
  violations?: number
  warnings?: number
  regionalData?: Record<string, number>
}

export default function GovPanelScreen() {
  const c = useThemeColors()
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    try {
      const data = await api.get<PlatformAnalytics>('/analytics/platform')
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
        <Ionicons name="stats-chart-outline" size={48} color={c.muted} />
        <Text style={[s.emptyTitle, { color: c.text }]}>No platform data</Text>
        <Text style={[s.emptyDesc, { color: c.muted }]}>Analytics will appear once there is platform activity.</Text>
      </View>
    )
  }

  const regional = analytics.regionalData ?? {}
  const regions = Object.entries(regional).sort(([, a], [, b]) => b - a)
  const maxRegional = Math.max(...regions.map(([, v]) => v), 1)

  return (
    <ScrollView
      style={[s.container, { backgroundColor: c.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
    >
      {/* KPI Strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.kpiStrip}>
        <KPICard icon="people" label="Total Users" value={String(analytics.totalUsers ?? 0)} color={c.primary} c={c} />
        <KPICard icon="business" label="Properties" value={String(analytics.totalProperties ?? 0)} color={c.accent} c={c} />
        <KPICard icon="cash" label="Payment Vol." value={formatCompact(Number(analytics.paymentVolume ?? 0))} color={c.secondary} c={c} />
        <KPICard icon="alert-circle" label="Disputes" value={String(analytics.activeDisputes ?? 0)} color={c.danger} c={c} />
      </ScrollView>

      {/* Compliance Overview */}
      <View style={[s.card, { backgroundColor: c.card }]}>
        <Text style={[s.cardTitle, { color: c.text }]}>Compliance Overview</Text>
        <View style={s.complianceRow}>
          <View style={[s.complianceItem, { backgroundColor: c.danger + '10' }]}>
            <View style={[s.complianceIcon, { backgroundColor: c.danger + '20' }]}>
              <Ionicons name="warning-outline" size={20} color={c.danger} />
            </View>
            <Text style={[s.complianceValue, { color: c.danger }]}>{analytics.violations ?? 0}</Text>
            <Text style={[s.complianceLabel, { color: c.muted }]}>Violations</Text>
          </View>
          <View style={[s.complianceItem, { backgroundColor: c.warning + '10' }]}>
            <View style={[s.complianceIcon, { backgroundColor: c.warning + '20' }]}>
              <Ionicons name="alert-outline" size={20} color={c.warning} />
            </View>
            <Text style={[s.complianceValue, { color: c.warning }]}>{analytics.warnings ?? 0}</Text>
            <Text style={[s.complianceLabel, { color: c.muted }]}>Warnings</Text>
          </View>
        </View>
      </View>

      {/* Regional Data */}
      <View style={[s.card, { backgroundColor: c.card }]}>
        <Text style={[s.cardTitle, { color: c.text }]}>Regional Breakdown</Text>
        {regions.length === 0 ? (
          <Text style={[s.noData, { color: c.muted }]}>No regional data available</Text>
        ) : (
          <View style={s.chartWrap}>
            {regions.map(([region, count]) => {
              const pct = maxRegional > 0 ? (count / maxRegional) * 100 : 0
              return (
                <View key={region} style={s.barRow}>
                  <Text style={[s.barLabel, { color: c.muted }]} numberOfLines={1}>{region}</Text>
                  <View style={[s.barTrack, { backgroundColor: c.surface }]}>
                    <View style={[s.barFill, { width: `${pct}%`, backgroundColor: c.primary }]} />
                  </View>
                  <Text style={[s.barAmt, { color: c.text }]}>{count}</Text>
                </View>
              )
            })}
          </View>
        )}
      </View>

      {/* Platform Summary */}
      <View style={[s.card, { backgroundColor: c.card }]}>
        <Text style={[s.cardTitle, { color: c.text }]}>Platform Health</Text>
        <View style={s.summaryRow}>
          <SummaryPill label="Users" value={String(analytics.totalUsers ?? 0)} color={c.primary} c={c} />
          <SummaryPill label="Properties" value={String(analytics.totalProperties ?? 0)} color={c.accent} c={c} />
          <SummaryPill label="Disputes" value={String(analytics.activeDisputes ?? 0)} color={c.danger} c={c} />
        </View>
      </View>

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

function SummaryPill({ label, value, color, c }: { label: string; value: string; color: string; c: ReturnType<typeof useThemeColors> }) {
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

  // Compliance
  complianceRow: { flexDirection: 'row', gap: spacing.sm },
  complianceItem: { flex: 1, borderRadius: 12, padding: spacing.md, alignItems: 'center', gap: 6 },
  complianceIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  complianceValue: { fontSize: 24, fontFamily: 'Manrope_800ExtraBold' },
  complianceLabel: { fontSize: 11, fontFamily: 'Manrope_500Medium' },

  // Chart
  chartWrap: { gap: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 70, fontSize: 10, fontFamily: 'Manrope_500Medium' },
  barTrack: { flex: 1, height: 18, borderRadius: 9, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 9 },
  barAmt: { width: 40, fontSize: 11, fontFamily: 'Manrope_600SemiBold', textAlign: 'right' },

  // Summary pills
  summaryRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { flex: 1, minWidth: 70, borderRadius: 10, padding: 12, alignItems: 'center', gap: 4 },
  pillValue: { fontSize: 18, fontFamily: 'Manrope_800ExtraBold' },
  pillLabel: { fontSize: 10, fontFamily: 'Manrope_400Regular' },
})
