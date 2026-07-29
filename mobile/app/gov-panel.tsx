import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Dimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
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

interface HousingDemand {
  regions: { region: string; listings: number; avgRent: number; minRent: number; maxRent: number; vacancyRate: number }[]
  rentTrend: { month: string; newListings: number; avgRent: number }[]
  summary: {
    totalListings: number
    overallVacancyRate: number
    activeAgreements: number
    totalApplications: number
    applicationsPerListing: number
  }
}

function monthShort(ym: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return months[Number(ym.split('-')[1]) - 1] ?? ym
}

export default function GovPanelScreen() {
  const c = useThemeColors()
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null)
  const [housing, setHousing] = useState<HousingDemand | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    try {
      const [platform, demand] = await Promise.all([
        api.get<PlatformAnalytics>('/analytics/platform'),
        // Housing demand is supplementary — don't blank the screen if it fails
        api.get<HousingDemand>('/analytics/housing-demand').catch(() => null),
      ])
      setAnalytics(platform)
      setHousing(demand)
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

  const vacancyColor = (rate: number) => (rate < 20 ? c.accent : rate <= 50 ? c.warning : c.danger)
  const demandRegions = housing?.regions ?? []
  const maxListings = Math.max(...demandRegions.map((r) => r.listings), 1)
  const trend = (housing?.rentTrend ?? []).slice(-6)
  const maxTrend = Math.max(...trend.map((t) => t.newListings), 1)

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
      <View style={[s.card, neuCard(c)]}>
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
      <View style={[s.card, neuCard(c)]}>
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

      {/* Housing Demand */}
      {housing && (
        <View style={[s.card, neuCard(c)]}>
          <Text style={[s.cardTitle, { color: c.text }]}>Housing Demand</Text>

          <View style={s.summaryRow}>
            <SummaryPill label="Listings" value={String(housing.summary.totalListings)} color={c.primary} c={c} />
            <SummaryPill label="Vacancy" value={`${housing.summary.overallVacancyRate}%`} color={vacancyColor(housing.summary.overallVacancyRate)} c={c} />
            <SummaryPill label="Agreements" value={String(housing.summary.activeAgreements)} color={c.accent} c={c} />
            <SummaryPill label="Apps / Listing" value={String(housing.summary.applicationsPerListing)} color={c.secondary} c={c} />
          </View>

          {demandRegions.length > 0 && (
            <View style={s.demandList}>
              {demandRegions.map((r) => {
                const vc = vacancyColor(r.vacancyRate)
                const pct = (r.listings / maxListings) * 100
                return (
                  <View key={r.region} style={s.demandRow}>
                    <View style={s.demandRowTop}>
                      <Text style={[s.demandRegion, { color: c.text }]} numberOfLines={1}>{r.region}</Text>
                      <Text style={[s.demandMeta, { color: c.muted }]} numberOfLines={1}>
                        {r.listings} · {formatCompact(r.avgRent)} avg
                      </Text>
                      <View style={[s.demandBadge, { backgroundColor: vc + '15' }]}>
                        <View style={[s.demandDot, { backgroundColor: vc }]} />
                        <Text style={[s.demandBadgeText, { color: vc }]}>{r.vacancyRate}% vacant</Text>
                      </View>
                    </View>
                    <View style={[s.barTrack, { backgroundColor: c.surface }]}>
                      <View style={[s.barFill, { width: `${pct}%`, backgroundColor: c.primary }]} />
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          {trend.length > 0 && (
            <>
              <Text style={[s.trendLabel, { color: c.muted }]}>New listings — last {trend.length} months</Text>
              <View style={s.trendRow}>
                {trend.map((m) => {
                  const pct = Math.max((m.newListings / maxTrend) * 100, 4)
                  return (
                    <View key={m.month} style={s.trendCol}>
                      <Text style={[s.trendVal, { color: c.text }]}>{m.newListings}</Text>
                      <View style={[s.trendTrack, { backgroundColor: c.surface }]}>
                        <View style={[s.trendBar, { height: `${pct}%`, backgroundColor: c.secondary }]} />
                      </View>
                      <Text style={[s.trendMonth, { color: c.muted }]}>{monthShort(m.month)}</Text>
                    </View>
                  )
                })}
              </View>
            </>
          )}
        </View>
      )}

      {/* Platform Summary */}
      <View style={[s.card, neuCard(c)]}>
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
    <View style={[s.pill, neuInset(c)]}>
      <Text style={[s.pillValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={[s.pillLabel, { color: c.muted }]}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
  emptyDesc: { fontSize: 13, textAlign: 'center', fontFamily: 'Outfit_400Regular' },

  // KPI horizontal strip
  kpiStrip: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 10 },
  kpi: { width: (screenW - 56) / 2.5, borderRadius: 12, borderWidth: 1, padding: 14, gap: 6 },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  kpiValue: { fontSize: 18, fontFamily: 'Outfit_800ExtraBold' },
  kpiLabel: { fontSize: 11, fontFamily: 'Outfit_500Medium' },

  // Cards
  card: { marginHorizontal: spacing.md, padding: spacing.md, marginTop: spacing.sm },
  cardTitle: { fontSize: 14, fontFamily: 'Outfit_700Bold', marginBottom: spacing.md },
  noData: { fontSize: 13, textAlign: 'center', paddingVertical: spacing.md, fontFamily: 'Outfit_400Regular' },

  // Compliance
  complianceRow: { flexDirection: 'row', gap: spacing.sm },
  complianceItem: { flex: 1, borderRadius: 12, padding: spacing.md, alignItems: 'center', gap: 6 },
  complianceIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  complianceValue: { fontSize: 24, fontFamily: 'Outfit_800ExtraBold' },
  complianceLabel: { fontSize: 11, fontFamily: 'Outfit_500Medium' },

  // Chart
  chartWrap: { gap: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 70, fontSize: 10, fontFamily: 'Outfit_500Medium' },
  barTrack: { flex: 1, height: 18, borderRadius: 9, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 9 },
  barAmt: { width: 40, fontSize: 11, fontFamily: 'Outfit_600SemiBold', textAlign: 'right' },

  // Housing demand
  demandList: { gap: 10, marginTop: spacing.md },
  demandRow: { gap: 6 },
  demandRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  demandRegion: { flex: 1, fontSize: 12, fontFamily: 'Outfit_600SemiBold' },
  demandMeta: { fontSize: 10, fontFamily: 'Outfit_500Medium' },
  demandBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  demandDot: { width: 5, height: 5, borderRadius: 3 },
  demandBadgeText: { fontSize: 10, fontFamily: 'Outfit_700Bold' },
  trendLabel: { fontSize: 11, fontFamily: 'Outfit_600SemiBold', marginTop: spacing.md, marginBottom: spacing.sm },
  trendRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  trendCol: { flex: 1, alignItems: 'center', gap: 4 },
  trendVal: { fontSize: 10, fontFamily: 'Outfit_700Bold' },
  trendTrack: { width: '100%', height: 48, borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  trendBar: { width: '100%', borderRadius: 6 },
  trendMonth: { fontSize: 9, fontFamily: 'Outfit_500Medium' },

  // Summary pills
  summaryRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { flex: 1, minWidth: 70, padding: 12, alignItems: 'center', gap: 4 },
  pillValue: { fontSize: 18, fontFamily: 'Outfit_800ExtraBold' },
  pillLabel: { fontSize: 10, fontFamily: 'Outfit_400Regular' },
})
