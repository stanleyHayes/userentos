import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { formatCurrency } from '../lib/format'
import { api } from '../lib/api'
import { ListSkeleton } from '../components/Skeleton'

interface Property {
  id: string; _id?: string; title: string; type: string; status: string
  address: { street: string; city: string; region: string }
  rentAmount: number; bedrooms: number; bathrooms: number; images?: string[]
}

export default function SavedPropertiesScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    try {
      const favData = await api.get<{ propertyIds: string[] }>('/properties/favorites/me')
      const ids = favData.propertyIds ?? []
      if (ids.length === 0) { setProperties([]); return }
      const results = await Promise.all(
        ids.map((id) => api.get<Property>(`/properties/${id}`).catch(() => null))
      )
      setProperties(results.filter(Boolean) as Property[])
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  async function unfavorite(propertyId: string) {
    try {
      await api.post(`/properties/${propertyId}/favorite`, {})
      setProperties((prev) => prev.filter((p) => (p.id ?? p._id) !== propertyId))
    } catch { /* no-op */ }
  }

  const statusColors: Record<string, string> = {
    available: c.accent, occupied: c.primary, under_dispute: c.danger, maintenance_required: c.warning,
  }

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: c.surface }]}>
        <View style={{ padding: spacing.md }}><ListSkeleton count={4} /></View>
      </View>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>
      <FlatList
        data={properties}
        keyExtractor={(item) => item.id ?? item._id!}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="heart-outline" size={48} color={c.muted} />
            <Text style={[s.emptyTitle, { color: c.primaryDark }]}>No saved properties</Text>
            <Text style={[s.emptySubtitle, { color: c.muted }]}>Browse listings and tap the heart icon to save properties you like.</Text>
            <TouchableOpacity style={[s.browseBtn, { backgroundColor: c.primary }]} onPress={() => router.push('/(tabs)/properties')}>
              <Ionicons name="business-outline" size={16} color="#fff" />
              <Text style={s.browseBtnText}>Browse Properties</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const pid = item.id ?? item._id!
          const statusColor = statusColors[item.status] ?? c.muted
          return (
            <TouchableOpacity
              style={[s.card, { backgroundColor: c.white }]}
              activeOpacity={0.7}
              onPress={() => router.push(`/property/${pid}`)}
            >
              {item.images && item.images.length > 0 ? (
                <Image source={{ uri: item.images[0] }} style={s.cardImage} />
              ) : (
                <View style={[s.cardImagePlaceholder, { backgroundColor: c.surface }]}>
                  <Ionicons name="image-outline" size={28} color={c.muted} />
                </View>
              )}
              <View style={[s.statusBadge, { backgroundColor: statusColor + '20' }]}>
                <Text style={[s.statusBadgeText, { color: statusColor }]}>{item.status.replace('_', ' ')}</Text>
              </View>
              <TouchableOpacity
                style={[s.heartBtn, { backgroundColor: c.white + 'E6' }]}
                onPress={() => unfavorite(pid)}
              >
                <Ionicons name="heart" size={16} color={c.danger} />
              </TouchableOpacity>
              <View style={s.cardBody}>
                <Text style={[s.cardTitle, { color: c.primaryDark }]} numberOfLines={1}>{item.title}</Text>
                <View style={s.locationRow}>
                  <Ionicons name="location-outline" size={12} color={c.muted} />
                  <Text style={[s.locationText, { color: c.muted }]} numberOfLines={1}>{item.address?.city}, {item.address?.region}</Text>
                </View>
                <Text style={[s.price, { color: c.primary }]}>{formatCurrency(item.rentAmount)}<Text style={[s.priceUnit, { color: c.muted }]}>/mo</Text></Text>
                <View style={s.detailsRow}>
                  <View style={s.detailChip}>
                    <Ionicons name="bed-outline" size={12} color={c.muted} />
                    <Text style={[s.detailChipText, { color: c.muted }]}>{item.bedrooms} bed</Text>
                  </View>
                  <View style={s.detailChip}>
                    <Ionicons name="water-outline" size={12} color={c.muted} />
                    <Text style={[s.detailChipText, { color: c.muted }]}>{item.bathrooms} bath</Text>
                  </View>
                  <Text style={[s.typeLabel, { color: c.primary }]}>{item.type}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )
        }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingVertical: 80, gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
  browseBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginTop: spacing.sm },
  browseBtnText: { color: '#fff', fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  card: { borderRadius: 14, overflow: 'hidden' },
  cardImage: { width: '100%', height: 160 },
  cardImagePlaceholder: { width: '100%', height: 160, justifyContent: 'center', alignItems: 'center' },
  statusBadge: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },
  heartBtn: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  cardBody: { padding: 12, gap: 4 },
  cardTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  price: { fontSize: 16, fontFamily: 'Manrope_800ExtraBold', marginTop: 4 },
  priceUnit: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  detailsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  detailChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailChipText: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  typeLabel: { fontSize: 11, fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize', marginLeft: 'auto' },
})
