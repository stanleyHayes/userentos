import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, TextInput, Modal, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
import { useAuthStore } from '../stores/authStore'
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
  ratingAvg?: number
  reviewCount?: number
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

interface Review {
  id: string
  authorName: string
  rating: number
  review?: string
  createdAt: string
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function LocalServicesScreen() {
  const c = useThemeColors()
  const user = useAuthStore((st) => st.user)
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

        <View style={[s.searchWrap, neuInset(c)]}>
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

        <View style={[s.searchWrap, neuInset(c)]}>
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
              <BusinessDetail
                entry={selected}
                isOwner={selected.business.ownerId === user?.id}
                c={c}
              />
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
      style={[s.card, neuCard(c)]}
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
        {business.reviewCount ? (
          <>
            <Ionicons name="star" size={12} color="#f59e0b" style={{ marginLeft: 6 }} />
            <Text style={[s.ratingValue, { color: c.text }]}>{(business.ratingAvg ?? 0).toFixed(1)}</Text>
            <Text style={[s.ratingCount, { color: c.muted }]}>({business.reviewCount})</Text>
          </>
        ) : null}
      </View>

      {business.description ? (
        <Text style={[s.desc, { color: c.muted }]} numberOfLines={2}>{business.description}</Text>
      ) : null}

      {preview.length > 0 && (
        <View style={[s.listingsBox, neuInset(c)]}>
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

function BusinessDetail({
  entry, isOwner, c,
}: {
  entry: BusinessEntry
  isOwner: boolean
  c: ReturnType<typeof useThemeColors>
}) {
  const qc = useQueryClient()
  const { business, listings } = entry

  const [inquiryTarget, setInquiryTarget] = useState<{ listingId?: string } | null>(null)
  const [reviewFormOpen, setReviewFormOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [savingReview, setSavingReview] = useState(false)

  const reviewsQuery = useQuery({
    queryKey: ['business-reviews', business.id],
    queryFn: () => api.get<{ items: Review[]; canReview: boolean }>(`/businesses/${business.id}/reviews`),
  })
  const reviews = reviewsQuery.data?.items ?? []

  async function submitReview() {
    if (rating < 1) {
      setReviewError('Tap a star to choose a rating')
      return
    }
    setSavingReview(true)
    setReviewError(null)
    try {
      await api.post(`/businesses/${business.id}/reviews`, {
        rating,
        review: reviewText.trim() || undefined,
      })
      qc.invalidateQueries({ queryKey: ['business-reviews', business.id] })
      qc.invalidateQueries({ queryKey: ['businesses'] })
      setReviewFormOpen(false)
      setRating(0)
      setReviewText('')
    } catch (e) {
      setReviewError((e as { message?: string }).message ?? 'Failed to save review')
    } finally {
      setSavingReview(false)
    }
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={s.modalBadgeRow}>
        <View style={[s.catBadge, { backgroundColor: c.primary + '15' }]}>
          <Text style={[s.catText, { color: c.primary }]}>{CATEGORY_LABELS[business.category]}</Text>
        </View>
        {business.isVerified && (
          <View style={[s.catBadge, { backgroundColor: '#10b98115' }]}>
            <Ionicons name="shield-checkmark" size={11} color="#10b981" />
            <Text style={[s.catText, { color: '#10b981' }]}>Verified</Text>
          </View>
        )}
        {business.reviewCount ? (
          <View style={[s.catBadge, { backgroundColor: '#f59e0b15' }]}>
            <Ionicons name="star" size={11} color="#f59e0b" />
            <Text style={[s.catText, { color: '#f59e0b' }]}>
              {(business.ratingAvg ?? 0).toFixed(1)} ({business.reviewCount})
            </Text>
          </View>
        ) : null}
      </View>

      <View style={s.modalMetaRow}>
        <Ionicons name="location-outline" size={13} color={c.muted} />
        <Text style={[s.modalMeta, { color: c.muted }]}>
          {business.address ? `${business.address}, ` : ''}{business.city}
        </Text>
      </View>

      {business.description ? (
        <Text style={[s.modalDesc, { color: c.text }]}>{business.description}</Text>
      ) : null}

      {!isOwner && (
        <TouchableOpacity
          style={[s.quoteBtn, { backgroundColor: c.primary }]}
          onPress={() => setInquiryTarget({})}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
          <Text style={s.quoteBtnText}>Request quote</Text>
        </TouchableOpacity>
      )}

      <Text style={[s.sectionLabel, { color: c.muted }]}>LISTINGS</Text>
      {listings.length === 0 ? (
        <Text style={[s.modalMeta, { color: c.muted }]}>No active listings right now.</Text>
      ) : (
        listings.map((l) => (
          <View key={l.id} style={[s.modalListing, neuInset(c)]}>
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
            {!isOwner && (
              <TouchableOpacity
                style={s.interestBtn}
                onPress={() => setInquiryTarget({ listingId: l.id })}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="chatbubble-outline" size={12} color={c.primary} />
                <Text style={[s.interestBtnText, { color: c.primary }]}>I'm interested</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}

      <Text style={[s.sectionLabel, { color: c.muted }]}>CONTACT</Text>
      <TouchableOpacity
        style={[s.contactRow, neuInset(c)]}
        onPress={() => Linking.openURL(`tel:${business.phone}`)}
        activeOpacity={0.7}
      >
        <Ionicons name="call-outline" size={16} color={c.primary} />
        <Text style={[s.contactText, { color: c.primary }]}>{business.phone}</Text>
      </TouchableOpacity>
      {business.email ? (
        <TouchableOpacity
          style={[s.contactRow, neuInset(c)]}
          onPress={() => Linking.openURL(`mailto:${business.email}`)}
          activeOpacity={0.7}
        >
          <Ionicons name="mail-outline" size={16} color={c.primary} />
          <Text style={[s.contactText, { color: c.primary }]}>{business.email}</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={[s.sectionLabel, { color: c.muted }]}>REVIEWS</Text>
      {reviewsQuery.isLoading ? (
        <ActivityIndicator color={c.primary} style={{ marginVertical: spacing.sm }} />
      ) : reviews.length === 0 ? (
        <Text style={[s.modalMeta, { color: c.muted }]}>No reviews yet.</Text>
      ) : (
        reviews.map((r) => (
          <View key={r.id} style={[s.reviewCard, neuInset(c)]}>
            <View style={s.reviewHeader}>
              <Text style={[s.reviewAuthor, { color: c.text }]} numberOfLines={1}>{r.authorName}</Text>
              <StarRow rating={r.rating} />
              <Text style={[s.reviewDate, { color: c.muted }]}>{formatDate(r.createdAt)}</Text>
            </View>
            {r.review ? (
              <Text style={[s.reviewBody, { color: c.text }]}>{r.review}</Text>
            ) : null}
          </View>
        ))
      )}
      {!isOwner && (
        reviewFormOpen ? (
          <View style={[s.reviewCard, neuInset(c)]}>
            <View style={s.starPicker}>
              {[1, 2, 3, 4, 5].map((i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setRating(i)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name={i <= rating ? 'star' : 'star-outline'} size={26} color="#f59e0b" />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[s.inquiryInput, neuInset(c), { color: c.text }]}
              placeholder="Share your experience (optional)"
              placeholderTextColor={c.muted}
              multiline
              numberOfLines={3}
              value={reviewText}
              onChangeText={setReviewText}
            />
            {reviewError ? (
              <Text style={[s.formError, { color: c.danger }]}>{reviewError}</Text>
            ) : null}
            <TouchableOpacity
              style={[s.quoteBtn, { backgroundColor: c.primary, marginTop: 0 }, savingReview && { opacity: 0.6 }]}
              onPress={submitReview}
              disabled={savingReview}
              activeOpacity={0.85}
            >
              {savingReview ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.quoteBtnText}>Submit review</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.writeBtn, { borderColor: c.primary }]}
            onPress={() => setReviewFormOpen(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={14} color={c.primary} />
            <Text style={[s.writeBtnText, { color: c.primary }]}>Write a review</Text>
          </TouchableOpacity>
        )
      )}

      {inquiryTarget && (
        <InquiryModal
          businessId={business.id}
          businessName={business.name}
          listingId={inquiryTarget.listingId}
          onClose={() => setInquiryTarget(null)}
          c={c}
        />
      )}
    </ScrollView>
  )
}

function InquiryModal({
  businessId, businessName, listingId, onClose, c,
}: {
  businessId: string
  businessName: string
  listingId?: string
  onClose: () => void
  c: ReturnType<typeof useThemeColors>
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSending(true)
    setError(null)
    try {
      await api.post(`/businesses/${businessId}/inquiries`, {
        listingId,
        message: message.trim() || undefined,
      })
      setSent(true)
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Failed to send inquiry')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalContent, { backgroundColor: c.card }]}>
          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, { color: c.text }]} numberOfLines={1}>
              {sent ? 'Inquiry sent' : 'Request quote'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={c.text} />
            </TouchableOpacity>
          </View>
          {sent ? (
            <View style={s.sentWrap}>
              <Ionicons name="checkmark-circle" size={44} color="#10b981" />
              <Text style={[s.sentTitle, { color: c.text }]}>Inquiry sent to {businessName}</Text>
              <Text style={[s.sentSub, { color: c.muted }]}>The business will contact you.</Text>
              <TouchableOpacity
                style={[s.quoteBtn, { backgroundColor: c.primary, alignSelf: 'stretch' }]}
                onPress={onClose}
                activeOpacity={0.85}
              >
                <Text style={s.quoteBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[s.inquirySub, { color: c.muted }]}>
                Let {businessName} know what you need — they'll reach out directly.
              </Text>
              <TextInput
                style={[s.inquiryInput, neuInset(c), { color: c.text }]}
                placeholder="Message (optional)"
                placeholderTextColor={c.muted}
                multiline
                numberOfLines={3}
                value={message}
                onChangeText={setMessage}
              />
              {error ? (
                <Text style={[s.formError, { color: c.danger }]}>{error}</Text>
              ) : null}
              <TouchableOpacity
                style={[s.quoteBtn, { backgroundColor: c.primary, marginTop: 0 }, sending && { opacity: 0.6 }]}
                onPress={submit}
                disabled={sending}
                activeOpacity={0.85}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="paper-plane-outline" size={15} color="#fff" />
                    <Text style={s.quoteBtnText}>Send inquiry</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

function StarRow({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <View style={s.starRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= Math.round(rating) ? 'star' : 'star-outline'} size={size} color="#f59e0b" />
      ))}
    </View>
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
  searchWrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Manrope_400Regular' },
  filterScroll: { marginHorizontal: -spacing.lg },
  filterContent: { paddingHorizontal: spacing.lg, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  filterChipText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  loadingWrap: { alignItems: 'center', marginTop: 40, gap: spacing.sm },
  loadingText: { fontSize: 13, fontFamily: 'Manrope_400Regular' },
  empty: { alignItems: 'center', marginTop: 60, gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginTop: spacing.sm },
  clearBtnText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },

  card: { padding: spacing.md, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  name: { fontSize: 15, fontFamily: 'Manrope_700Bold', flexShrink: 1 },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  catText: { fontSize: 10, fontFamily: 'Manrope_700Bold' },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  city: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  desc: { fontSize: 12, fontFamily: 'Manrope_400Regular', lineHeight: 17 },
  listingsBox: { padding: 10, gap: 6, marginTop: 2 },
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
  modalListing: { padding: 10, gap: 4, marginBottom: 6 },
  listingDesc: { fontSize: 11, fontFamily: 'Manrope_400Regular', lineHeight: 16 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: 6 },
  contactText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },

  ratingValue: { fontSize: 12, fontFamily: 'Manrope_700Bold' },
  ratingCount: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  starRow: { flexDirection: 'row', gap: 2 },
  starPicker: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  quoteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, marginTop: spacing.sm },
  quoteBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_700Bold' },
  interestBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, alignSelf: 'flex-start' },
  interestBtnText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  reviewCard: { padding: 10, gap: 6, marginBottom: 6 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewAuthor: { fontSize: 12, fontFamily: 'Manrope_700Bold', flex: 1 },
  reviewDate: { fontSize: 10, fontFamily: 'Manrope_400Regular' },
  reviewBody: { fontSize: 12, fontFamily: 'Manrope_400Regular', lineHeight: 17 },
  writeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, marginTop: 4 },
  writeBtnText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  inquirySub: { fontSize: 13, fontFamily: 'Manrope_400Regular', lineHeight: 19, marginBottom: spacing.sm },
  inquiryInput: { paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, fontFamily: 'Manrope_400Regular', minHeight: 70, textAlignVertical: 'top', marginBottom: spacing.sm },
  formError: { fontSize: 12, fontFamily: 'Manrope_500Medium', marginBottom: spacing.sm },
  sentWrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  sentTitle: { fontSize: 15, fontFamily: 'Manrope_700Bold', textAlign: 'center' },
  sentSub: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
})
