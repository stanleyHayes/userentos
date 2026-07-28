import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, TextInput, Modal, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'

type Category = 'furniture' | 'appliances' | 'internet' | 'moving' | 'cleaning' | 'other'
type ListingType = 'product' | 'service' | 'discount'

interface Business {
  id: string
  ownerId: string
  name: string
  category: Category
  description?: string
  phone: string
  email?: string
  city: string
  address?: string
  isVerified: boolean
  createdAt: string
}

interface Listing {
  id: string
  businessId: string
  title: string
  description?: string
  type: ListingType
  price?: number
  promoText?: string
  isActive: boolean
  createdAt: string
}

interface BusinessEntry {
  business: Business
  listings: Listing[]
}

const CATEGORY_LABELS: Record<Category, string> = {
  furniture: 'Furniture & Home',
  appliances: 'Appliances',
  internet: 'Internet',
  moving: 'Moving',
  cleaning: 'Cleaning',
  other: 'Other',
}

const TYPE_ICONS: Record<ListingType, keyof typeof Ionicons.glyphMap> = {
  product: 'cube-outline',
  service: 'construct-outline',
  discount: 'pricetag-outline',
}

function formatPrice(n: number): string {
  return `GH₵${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function LocalServicesScreen() {
  const c = useThemeColors()
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [city, setCity] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selected, setSelected] = useState<BusinessEntry | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400)
    return () => clearTimeout(t)
  }, [search])

  const params = { category, city: city.trim(), search: debouncedSearch }

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['businesses', params],
    queryFn: () => {
      const parts: string[] = []
      if (category !== 'all') parts.push(`category=${encodeURIComponent(category)}`)
      if (params.city) parts.push(`city=${encodeURIComponent(params.city)}`)
      if (params.search) parts.push(`search=${encodeURIComponent(params.search)}`)
      const qs = parts.length ? `?${parts.join('&')}` : ''
      return api.get<{ items: BusinessEntry[] }>(`/businesses${qs}`)
    },
  })

  const items = data?.items ?? []
  const hasFilters = category !== 'all' || params.city !== '' || search.trim() !== ''

  function clearFilters() {
    setCategory('all')
    setCity('')
    setSearch('')
    setDebouncedSearch('')
  }

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: 'Local Services' }} />

      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
        contentContainerStyle={s.listContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[s.subcopy, { color: c.muted }]}>Furniture, internet, moving & more near you</Text>

        <View style={[s.searchWrap, { backgroundColor: c.card, borderColor: c.border }]}>
          <Ionicons name="search" size={18} color={c.muted} />
          <TextInput
            style={[s.searchInput, { color: c.text }]}
            placeholder="Search businesses..."
            placeholderTextColor={c.muted}
            value={search}
            onChangeText={setSearch}
          />
          {search !== '' && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color={c.muted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={[s.searchWrap, { backgroundColor: c.card, borderColor: c.border }]}>
          <Ionicons name="location-outline" size={18} color={c.muted} />
          <TextInput
            style={[s.searchInput, { color: c.text }]}
            placeholder="Filter by city (e.g. Accra)"
            placeholderTextColor={c.muted}
            value={city}
            onChangeText={setCity}
          />
          {city !== '' && (
            <TouchableOpacity onPress={() => setCity('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color={c.muted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterScroll}
          contentContainerStyle={s.filterContent}
        >
          <FilterChip label="All" active={category === 'all'} onPress={() => setCategory('all')} c={c} />
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
            <FilterChip
              key={cat}
              label={CATEGORY_LABELS[cat]}
              active={category === cat}
              onPress={() => setCategory(cat)}
              c={c}
            />
          ))}
        </ScrollView>

        {isLoading && !isRefetching ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={c.primary} />
            <Text style={[s.loadingText, { color: c.muted }]}>Finding local businesses...</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="storefront-outline" size={48} color={c.muted} />
            <Text style={[s.emptyTitle, { color: c.text }]}>No businesses found</Text>
            <Text style={[s.emptySubtitle, { color: c.muted }]}>
              {hasFilters ? 'Try adjusting your filters or search' : 'Check back soon — businesses are joining regularly.'}
            </Text>
            {hasFilters && (
              <TouchableOpacity style={[s.clearBtn, { borderColor: c.primary }]} onPress={clearFilters} activeOpacity={0.85}>
                <Ionicons name="refresh" size={14} color={c.primary} />
                <Text style={[s.clearBtnText, { color: c.primary }]}>Clear filters</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          items.map((entry) => (
            <BusinessCard key={entry.business.id} entry={entry} onPress={() => setSelected(entry)} c={c} />
          ))
        )}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]} numberOfLines={1}>
                {selected?.business.name ?? ''}
              </Text>
              <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.modalBadgeRow}>
                  <View style={[s.catBadge, { backgroundColor: c.primary + '15' }]}>
                    <Text style={[s.catText, { color: c.primary }]}>{CATEGORY_LABELS[selected.business.category]}</Text>
                  </View>
                  {selected.business.isVerified && (
                    <View style={[s.catBadge, { backgroundColor: '#10b98115' }]}>
                      <Ionicons name="shield-checkmark" size={11} color="#10b981" />
                      <Text style={[s.catText, { color: '#10b981' }]}>Verified</Text>
                    </View>
                  )}
                </View>

                <View style={s.modalMetaRow}>
                  <Ionicons name="location-outline" size={13} color={c.muted} />
                  <Text style={[s.modalMeta, { color: c.muted }]}>
                    {selected.business.address ? `${selected.business.address}, ` : ''}{selected.business.city}
                  </Text>
                </View>

                {selected.business.description ? (
                  <Text style={[s.modalDesc, { color: c.text }]}>{selected.business.description}</Text>
                ) : null}

                <Text style={[s.sectionLabel, { color: c.muted }]}>LISTINGS</Text>
                {selected.listings.length === 0 ? (
                  <Text style={[s.modalMeta, { color: c.muted }]}>No active listings right now.</Text>
                ) : (
                  selected.listings.map((l) => (
                    <View key={l.id} style={[s.modalListing, { backgroundColor: c.surface, borderColor: c.border }]}>
                      <View style={s.listingRow}>
                        <Ionicons name={TYPE_ICONS[l.type]} size={15} color={c.primary} />
                        <Text style={[s.listingTitle, { color: c.text }]} numberOfLines={1}>{l.title}</Text>
                        {l.type === 'discount' && l.promoText ? (
                          <Text style={s.promoText} numberOfLines={1}>{l.promoText}</Text>
                        ) : l.price != null ? (
                          <Text style={[s.listingPrice, { color: c.text }]}>{formatPrice(l.price)}</Text>
                        ) : null}
                      </View>
                      {l.description ? (
                        <Text style={[s.listingDesc, { color: c.muted }]}>{l.description}</Text>
                      ) : null}
                    </View>
                  ))
                )}

                <Text style={[s.sectionLabel, { color: c.muted }]}>CONTACT</Text>
                <TouchableOpacity
                  style={[s.contactRow, { backgroundColor: c.surface, borderColor: c.border }]}
                  onPress={() => Linking.openURL(`tel:${selected.business.phone}`)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="call-outline" size={16} color={c.primary} />
                  <Text style={[s.contactText, { color: c.primary }]}>{selected.business.phone}</Text>
                </TouchableOpacity>
                {selected.business.email ? (
                  <TouchableOpacity
                    style={[s.contactRow, { backgroundColor: c.surface, borderColor: c.border }]}
                    onPress={() => Linking.openURL(`mailto:${selected.business.email}`)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="mail-outline" size={16} color={c.primary} />
                    <Text style={[s.contactText, { color: c.primary }]}>{selected.business.email}</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

function BusinessCard({
  entry, onPress, c,
}: {
  entry: BusinessEntry
  onPress: () => void
  c: ReturnType<typeof useThemeColors>
}) {
  const { business, listings } = entry
  const preview = listings.slice(0, 3)
  const overflow = listings.length - preview.length

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={s.cardHeader}>
        <View style={s.nameRow}>
          <Text style={[s.name, { color: c.text }]} numberOfLines={1}>{business.name}</Text>
          {business.isVerified && (
            <Ionicons name="shield-checkmark" size={16} color="#10b981" />
          )}
        </View>
        <View style={[s.catBadge, { backgroundColor: c.primary + '15' }]}>
          <Text style={[s.catText, { color: c.primary }]}>{CATEGORY_LABELS[business.category]}</Text>
        </View>
      </View>

      <View style={s.cityRow}>
        <Ionicons name="location-outline" size={12} color={c.muted} />
        <Text style={[s.city, { color: c.muted }]}>{business.city}</Text>
      </View>

      {business.description ? (
        <Text style={[s.desc, { color: c.muted }]} numberOfLines={2}>{business.description}</Text>
      ) : null}

      {preview.length > 0 && (
        <View style={[s.listingsBox, { backgroundColor: c.surface }]}>
          {preview.map((l) => (
            <View key={l.id} style={s.listingRow}>
              <Ionicons name={TYPE_ICONS[l.type]} size={14} color={c.primary} />
              <Text style={[s.listingTitle, { color: c.text }]} numberOfLines={1}>{l.title}</Text>
              {l.type === 'discount' && l.promoText ? (
                <Text style={s.promoText} numberOfLines={1}>{l.promoText}</Text>
              ) : l.price != null ? (
                <Text style={[s.listingPrice, { color: c.text }]}>{formatPrice(l.price)}</Text>
              ) : null}
            </View>
          ))}
          {overflow > 0 && (
            <Text style={[s.moreText, { color: c.primary }]}>+{overflow} more</Text>
          )}
        </View>
      )}

      <View style={s.phoneRow}>
        <Ionicons name="call-outline" size={13} color={c.muted} />
        <Text style={[s.phone, { color: c.muted }]}>{business.phone}</Text>
        <Ionicons name="chevron-forward" size={14} color={c.muted} style={{ marginLeft: 'auto' }} />
      </View>
    </TouchableOpacity>
  )
}

function FilterChip({
  label, active, onPress, c,
}: {
  label: string
  active: boolean
  onPress: () => void
  c: ReturnType<typeof useThemeColors>
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.filterChip, { backgroundColor: active ? c.primary : c.card, borderColor: active ? c.primary : c.border }]}
    >
      <Text style={[s.filterChipText, { color: active ? '#fff' : c.text }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  subcopy: { fontSize: 13, fontFamily: 'Manrope_400Regular' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Manrope_400Regular' },
  filterScroll: { marginHorizontal: -spacing.lg },
  filterContent: { paddingHorizontal: spacing.lg, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  filterChipText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  loadingWrap: { alignItems: 'center', marginTop: 40, gap: spacing.sm },
  loadingText: { fontSize: 13, fontFamily: 'Manrope_400Regular' },
  empty: { alignItems: 'center', marginTop: 60, gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginTop: spacing.sm },
  clearBtnText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },

  card: { borderRadius: 14, borderWidth: 1, padding: spacing.md, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  name: { fontSize: 15, fontFamily: 'Manrope_700Bold', flexShrink: 1 },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  catText: { fontSize: 10, fontFamily: 'Manrope_700Bold' },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  city: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  desc: { fontSize: 12, fontFamily: 'Manrope_400Regular', lineHeight: 17 },
  listingsBox: { borderRadius: 8, padding: 10, gap: 6, marginTop: 2 },
  listingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listingTitle: { fontSize: 12, fontFamily: 'Manrope_500Medium', flex: 1 },
  listingPrice: { fontSize: 12, fontFamily: 'Manrope_700Bold' },
  promoText: { fontSize: 11, fontFamily: 'Manrope_700Bold', color: '#f59e0b' },
  moreText: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  phone: { fontSize: 12, fontFamily: 'Manrope_500Medium' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold', flex: 1, marginRight: spacing.md },
  modalBadgeRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.sm },
  modalMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm },
  modalMeta: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  modalDesc: { fontSize: 13, fontFamily: 'Manrope_400Regular', lineHeight: 19, marginBottom: spacing.sm },
  sectionLabel: { fontSize: 9, fontFamily: 'Manrope_700Bold', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.sm },
  modalListing: { borderRadius: 8, borderWidth: 1, padding: 10, gap: 4, marginBottom: 6 },
  listingDesc: { fontSize: 11, fontFamily: 'Manrope_400Regular', lineHeight: 16 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, borderWidth: 1, padding: 12, marginBottom: 6 },
  contactText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
})
