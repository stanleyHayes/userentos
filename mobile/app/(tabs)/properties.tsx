import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useThemeColors, spacing } from '../../lib/theme'
import { formatCurrency } from '../../lib/format'
import { api } from '../../lib/api'
import { PropertyGridSkeleton } from '../../components/Skeleton'
import { useAuthStore } from '../../stores/authStore'

interface Property {
  id: string; title: string; description: string; type: string
  status: string; address: { street: string; city: string; region: string }
  rentAmount: number; amenities: string[]; images?: string[]
}

const statusFilters = [
  { value: '', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
]

export default function PropertiesScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const [properties, setProperties] = useState<Property[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const statusColors: Record<string, string> = {
    available: c.accent,
    occupied: c.primary,
    under_dispute: c.danger,
    maintenance_required: c.warning,
  }

  const load = useCallback(async (searchQuery?: string, status?: string) => {
    try {
      const params = new URLSearchParams()
      const q = searchQuery ?? search
      const st = status ?? statusFilter
      if (q.trim()) params.append('search', q.trim())
      if (st) params.append('status', st)
      const queryStr = params.toString()
      const data = await api.get<{ items: Property[] }>(`/properties${queryStr ? `?${queryStr}` : ''}`)
      setProperties(data.items)
    } catch { /* no-op */ } finally {
      setLoading(false)
      setSearching(false)
    }
  }, [search, statusFilter])

  useEffect(() => { load() }, [])
  useEffect(() => { return () => { if (debounceRef.current) clearTimeout(debounceRef.current) } }, [])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  function handleSearch(text: string) {
    setSearch(text)
    setSearching(true)
    // Debounce API calls — wait 400ms after user stops typing
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      load(text, statusFilter)
    }, 400)
  }

  function handleStatusFilter(status: string) {
    setStatusFilter(status)
    setSearching(true)
    load(search, status)
  }

  function renderProperty({ item }: { item: Property }) {
    const statusColor = statusColors[item.status] ?? c.muted
    return (
      <TouchableOpacity style={[s.card, { backgroundColor: c.white }]} activeOpacity={0.7} onPress={() => router.push(`/property/${item.id}`)}>
        {item.images && item.images.length > 0 ? (
          <Image source={{ uri: item.images[0] }} style={s.cardImage} resizeMode="cover" />
        ) : (
          <View style={[s.cardImage, { backgroundColor: c.surface }]}>
            <Text style={[s.cardImageText, { color: c.primary + '30' }]}>{item.type[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={s.cardBody}>
          <View style={s.cardHeader}>
            <Text style={[s.cardTitle, { color: c.primaryDark }]} numberOfLines={1}>{item.title}</Text>
            <View style={[s.badge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[s.badgeText, { color: statusColor }]}>{item.status.replace('_', ' ')}</Text>
            </View>
          </View>
          <View style={s.location}>
            <Ionicons name="location-outline" size={12} color={c.muted} />
            <Text style={[s.locationText, { color: c.muted }]}>{item.address.street}, {item.address.city}</Text>
          </View>
          <Text style={[s.description, { color: c.textLight }]} numberOfLines={2}>{item.description}</Text>
          <View style={s.cardFooter}>
            <Text style={[s.price, { color: c.primary }]}>{formatCurrency(item.rentAmount)}<Text style={[s.priceUnit, { color: c.muted }]}>/mo</Text></Text>
            <Text style={[s.typeLabel, { color: c.muted, backgroundColor: c.surface }]}>{item.type}</Text>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>
      {/* Search Bar */}
      <View style={[s.searchContainer, { backgroundColor: c.white, borderBottomColor: c.border }]}>
        <View style={[s.searchBar, { backgroundColor: c.surface }]}>
          <Ionicons name="search" size={18} color={c.muted} />
          <TextInput
            style={[s.searchInput, { color: c.text }]}
            placeholder="Search properties..."
            placeholderTextColor={c.muted}
            value={search}
            onChangeText={handleSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator size="small" color={c.primary} />}
          {search.length > 0 && !searching && (
            <TouchableOpacity onPress={() => handleSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={c.muted} />
            </TouchableOpacity>
          )}
        </View>
        <View style={s.filterRow}>
          {statusFilters.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[s.filterBtn, { backgroundColor: c.surface, borderColor: c.border }, statusFilter === f.value && { backgroundColor: c.primary + '12', borderColor: c.primary }]}
              onPress={() => handleStatusFilter(f.value)}
              activeOpacity={0.7}
            >
              <Text style={[s.filterText, { color: c.muted }, statusFilter === f.value && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        renderItem={renderProperty}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListEmptyComponent={
          loading ? (
            <View style={{ padding: spacing.md }}>
              <PropertyGridSkeleton count={4} />
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="business-outline" size={48} color={c.muted} />
              <Text style={[s.emptyText, { color: c.muted }]}>No properties found</Text>
            </View>
          )
        }
      />

      {/* FAB for landlords */}
      {(() => {
        const role = useAuthStore.getState().user?.activeRole
        if (role === 'landlord' || role === 'property_manager' || role === 'admin') {
          return (
            <TouchableOpacity
              style={[s.fab, { backgroundColor: c.primary }]}
              onPress={() => router.push('/add-property')}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
          )
        }
        return null
      })()}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: spacing.md, height: 44, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Manrope_500Medium' },
  filterRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 12, fontFamily: 'Manrope_500Medium' },
  list: { padding: spacing.md, gap: spacing.md },
  card: { borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardImage: { height: 120, justifyContent: 'center', alignItems: 'center' },
  cardImageText: { fontSize: 40, fontFamily: 'Manrope_700Bold' },
  cardBody: { padding: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 15, fontFamily: 'Manrope_700Bold', flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  locationText: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  description: { fontSize: 13, lineHeight: 18, marginBottom: 8, fontFamily: 'Manrope_400Regular' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  priceUnit: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  typeLabel: { fontSize: 11, fontFamily: 'Manrope_400Regular', textTransform: 'capitalize', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
})
