import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Stack } from 'expo-router'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard } from '../lib/neu'
import { formatCurrency } from '../lib/format'
import { api } from '../lib/api'

interface VacancyItem {
  id: string; title: string; city: string | null
  status: 'occupied' | 'vacant'; daysListed: number; rentAmount: number | null
}

interface VacancySummary {
  total: number; occupied: number; vacant: number
  occupancyRate: number; avgDaysVacant: number; vacantRentValue: number
}

export default function LandlordVacancyScreen() {
  const c = useThemeColors()
  const [items, setItems] = useState<VacancyItem[]>([])
  const [summary, setSummary] = useState<VacancySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    try {
      const data = await api.get<{ items: VacancyItem[]; summary: VacancySummary }>('/landlord/vacancy')
      setItems(data.items ?? [])
      setSummary(data.summary ?? null)
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  // Vacant first — those are the ones costing money.
  const sorted = [...items].sort((a, b) => {
    if (a.status === b.status) return b.daysListed - a.daysListed
    return a.status === 'vacant' ? -1 : 1
  })

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: c.surface }]}>
        <Stack.Screen options={{ title: 'Vacancy' }} />
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <Stack.Screen options={{ title: 'Vacancy' }} />
      <ScrollView
        style={[s.container, { backgroundColor: c.surface }]}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        {/* Stat cards */}
        <View style={s.statRow}>
          <View style={[s.statCard, neuCard(c)]}>
            <Ionicons name="pie-chart-outline" size={18} color={c.accent} />
            <Text style={[s.statValue, { color: c.primaryDark }]}>{summary?.occupancyRate ?? 0}%</Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Occupancy</Text>
          </View>
          <View style={[s.statCard, neuCard(c)]}>
            <Ionicons name="home-outline" size={18} color={c.warning} />
            <Text style={[s.statValue, { color: c.primaryDark }]}>{summary?.vacant ?? 0}</Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Vacant units</Text>
          </View>
        </View>
        <View style={s.statRow}>
          <View style={[s.statCard, neuCard(c)]}>
            <Ionicons name="time-outline" size={18} color={c.primary} />
            <Text style={[s.statValue, { color: c.primaryDark }]}>{summary?.avgDaysVacant ?? 0}</Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Avg days vacant</Text>
          </View>
          <View style={[s.statCard, neuCard(c)]}>
            <Ionicons name="cash-outline" size={18} color={c.danger} />
            <Text style={[s.statValue, { color: c.primaryDark }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(summary?.vacantRentValue ?? 0)}
            </Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Uncollected rent/mo</Text>
          </View>
        </View>

        {/* Property list, vacant first */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Properties</Text>
          {sorted.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="business-outline" size={48} color={c.muted} />
              <Text style={[s.emptyText, { color: c.muted }]}>No properties on your account yet</Text>
            </View>
          ) : (
            sorted.map((p) => {
              const vacant = p.status === 'vacant'
              const badgeColor = vacant ? c.warning : c.accent
              return (
                <View key={p.id} style={[s.row, neuCard(c)]}>
                  <View style={[s.rowIcon, { backgroundColor: badgeColor + '15' }]}>
                    <Ionicons name={vacant ? 'home-outline' : 'home'} size={18} color={badgeColor} />
                  </View>
                  <View style={s.rowBody}>
                    <Text style={[s.rowTitle, { color: c.primaryDark }]} numberOfLines={1}>{p.title}</Text>
                    <View style={s.rowMeta}>
                      {!!p.city && (
                        <>
                          <Ionicons name="location-outline" size={12} color={c.muted} />
                          <Text style={[s.rowCity, { color: c.muted }]}>{p.city}</Text>
                        </>
                      )}
                      {vacant && (
                        <Text style={[s.rowDays, { color: c.warning }]}>{p.daysListed}d listed</Text>
                      )}
                    </View>
                  </View>
                  <View style={s.rowRight}>
                    <View style={[s.badge, { backgroundColor: badgeColor + '15', borderColor: badgeColor + '30' }]}>
                      <View style={[s.badgeDot, { backgroundColor: badgeColor }]} />
                      <Text style={[s.badgeText, { color: badgeColor }]}>{p.status}</Text>
                    </View>
                    {p.rentAmount != null && (
                      <Text style={[s.rowRent, { color: c.muted }]}>{formatCurrency(p.rentAmount)}/mo</Text>
                    )}
                  </View>
                </View>
              )
            })
          )}
        </View>
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.md, paddingBottom: 40 },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statCard: { flex: 1, padding: spacing.md, gap: 4 },
  statValue: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  section: { marginTop: spacing.sm },
  sectionTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.md, marginBottom: spacing.sm },
  rowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  rowCity: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  rowDays: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },
  rowRent: { fontSize: 11, fontFamily: 'Manrope_500Medium' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  emptyText: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
})
