import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Image, TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'

interface Worker {
  id: string
  _id?: string
  name: string
  photo?: string
  trades: string[]
  location: string
  hourlyRate: number
  rating: number
  reviewCount: number
  completedJobs: number
  verificationLevel: string
  emergencyAvailable: boolean
  status: string
}

const TRADE_OPTIONS = ['all', 'plumbing', 'electrical', 'carpentry', 'painting', 'pest', 'cleaning', 'security', 'appliance']

export default function WorkersScreen() {
  const c = useThemeColors()
  const qc = useQueryClient()
  const router = useRouter()
  const [tradeFilter, setTradeFilter] = useState('all')
  const [search, setSearch] = useState('')

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['workers', tradeFilter],
    queryFn: () => api.get<{ items: Worker[] }>(`/workers?${tradeFilter !== 'all' ? `trade=${tradeFilter}&` : ''}limit=50`),
  })

  const items = data?.items ?? []
  const filtered = items.filter((w) =>
    search.trim() === '' || w.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      <View style={[s.header, { backgroundColor: c.primary }]}>
        <Text style={s.headerTitle}>Find a Worker</Text>
        <Text style={s.headerSubtitle}>Book skilled tradespeople near you</Text>
      </View>

      <View style={[s.searchWrap, { backgroundColor: c.card, borderColor: c.border }]}>
        <Ionicons name="search" size={18} color={c.muted} />
        <TextInput
          style={[s.searchInput, { color: c.text }]}
          placeholder="Search by name..."
          placeholderTextColor={c.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterContent}
      >
        {TRADE_OPTIONS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[
              s.filterChip,
              { backgroundColor: tradeFilter === t ? c.primary : c.card, borderColor: c.border },
            ]}
            onPress={() => setTradeFilter(t)}
          >
            <Text
              style={[
                s.filterChipText,
                { color: tradeFilter === t ? '#fff' : c.text },
              ]}
            >
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
        contentContainerStyle={s.listContent}
      >
        {isLoading && !isRefetching ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={48} color={c.muted} />
            <Text style={[s.emptyTitle, { color: c.text }]}>No workers found</Text>
            <Text style={[s.emptySubtitle, { color: c.muted }]}>Try adjusting your filters</Text>
          </View>
        ) : (
          filtered.map((w) => (
            <TouchableOpacity
              key={w.id ?? w._id}
              style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={() => router.push(`/worker/${w.id ?? w._id}` as string)}
              activeOpacity={0.7}
            >
              <Image
                source={{ uri: w.photo || 'https://via.placeholder.com/100' }}
                style={s.photo}
              />
              <View style={s.info}>
                <View style={s.nameRow}>
                  <Text style={[s.name, { color: c.text }]}>{w.name}</Text>
                  {w.verificationLevel === 'verified' && (
                    <Ionicons name="checkmark-circle" size={16} color="#3b82f6" />
                  )}
                  {w.emergencyAvailable && (
                    <View style={[s.emergencyBadge, { backgroundColor: '#ef444412' }]}>
                      <Text style={[s.emergencyText, { color: '#ef4444' }]}>24/7</Text>
                    </View>
                  )}
                </View>
                <Text style={[s.meta, { color: c.muted }]}>
                  {w.trades.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' · ')} · {w.location}
                </Text>
                <View style={s.statsRow}>
                  <Ionicons name="star" size={12} color="#f59e0b" />
                  <Text style={[s.statText, { color: c.text }]}>{w.rating.toFixed(1)}</Text>
                  <Text style={[s.statText, { color: c.muted }]}>({w.reviewCount})</Text>
                  <Text style={[s.divider, { color: c.border }]}>|</Text>
                  <Text style={[s.statText, { color: c.muted }]}>{w.completedJobs} jobs</Text>
                </View>
                <Text style={[s.rate, { color: c.primary }]}>GHS {w.hourlyRate}/hr</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 64, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg + 8, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTitle: { color: '#fff', fontSize: 22, fontFamily: 'Manrope_800ExtraBold' },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginTop: -18, borderRadius: 12, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Manrope_400Regular' },
  filterScroll: { marginTop: spacing.md },
  filterContent: { paddingHorizontal: spacing.lg, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  filterChipText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  listContent: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  card: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: spacing.md, gap: spacing.md },
  photo: { width: 64, height: 64, borderRadius: 12 },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  emergencyBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  emergencyText: { fontSize: 9, fontFamily: 'Manrope_700Bold' },
  meta: { fontSize: 12, fontFamily: 'Manrope_400Regular', marginTop: 1 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  statText: { fontSize: 12, fontFamily: 'Manrope_500Medium' },
  divider: { marginHorizontal: 4 },
  rate: { fontSize: 13, fontFamily: 'Manrope_700Bold', marginTop: 4 },
  empty: { alignItems: 'center', marginTop: 60, gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Manrope_400Regular' },
})
