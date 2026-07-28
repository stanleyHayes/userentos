import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert, Switch, Linking,
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

interface MyBusinessResponse {
  business: Business | null
  listings: Listing[]
}

type InquiryStatus = 'new' | 'contacted' | 'won' | 'lost'

interface Inquiry {
  id: string
  businessId: string
  listingId?: string
  listingTitle?: string
  requesterName: string
  requesterPhone: string
  requesterEmail?: string
  message?: string
  status: InquiryStatus
  createdAt: string
}

interface Analytics {
  profileViews: number
  listingViews: number
  totalInquiries: number
  newInquiries: number
  wonInquiries: number
  conversionRate: number
  inquiriesByDay: { date: string; count: number }[]
}

interface Review {
  id: string
  authorName: string
  rating: number
  review?: string
  createdAt: string
}

const STATUS_LABELS: Record<InquiryStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  won: 'Won',
  lost: 'Lost',
}

const STATUS_COLORS: Record<InquiryStatus, string> = {
  new: '#3b82f6',
  contacted: '#f59e0b',
  won: '#10b981',
  lost: '#ef4444',
}

const TAB_LABELS = { listings: 'Listings', inquiries: 'Inquiries', reviews: 'Reviews' } as const
type Tab = keyof typeof TAB_LABELS

const CATEGORY_LABELS: Record<Category, string> = {
  furniture: 'Furniture & Home',
  appliances: 'Appliances',
  internet: 'Internet',
  moving: 'Moving',
  cleaning: 'Cleaning',
  other: 'Other',
}

const TYPE_LABELS: Record<ListingType, string> = {
  product: 'Product',
  service: 'Service',
  discount: 'Discount',
}

const TYPE_COLORS: Record<ListingType, string> = {
  product: '#3b82f6',
  service: '#10b981',
  discount: '#f59e0b',
}

function formatPrice(n: number): string {
  return `GH₵${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function MyBusinessScreen() {
  const c = useThemeColors()
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['my-business'],
    queryFn: () => api.get<MyBusinessResponse>('/businesses/me'),
  })

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: 'My Business' }} />
      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : data?.business ? (
        <Dashboard data={data as { business: Business; listings: Listing[] }} isRefetching={isRefetching} refetch={refetch} />
      ) : (
        <SetupForm />
      )}
    </View>
  )
}

function SetupForm() {
  const c = useThemeColors()
  const qc = useQueryClient()
  const user = useAuthStore((st) => st.user)

  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('furniture')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (name.trim().length < 2) {
      Alert.alert('Invalid name', 'Business name must be at least 2 characters')
      return
    }
    if (city.trim() === '') {
      Alert.alert('City required', 'Please enter the city your business operates in')
      return
    }
    if (phone.trim().length < 7) {
      Alert.alert('Invalid phone', 'Please enter a valid phone number (min 7 digits)')
      return
    }
    setSaving(true)
    try {
      await api.post('/businesses/me', {
        name: name.trim(),
        category,
        city: city.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        description: description.trim() || undefined,
      })
      qc.invalidateQueries({ queryKey: ['my-business'] })
      Alert.alert('Saved', 'Your business profile is live. Add your first listing!')
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to save business')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled">
      <View style={[s.setupHero, { backgroundColor: c.primary + '10', borderColor: c.primary + '30' }]}>
        <Ionicons name="storefront-outline" size={28} color={c.primary} />
        <Text style={[s.setupTitle, { color: c.text }]}>Set up your business</Text>
        <Text style={[s.setupSub, { color: c.muted }]}>
          Create your profile to reach tenants looking for furniture, internet, moving and more.
        </Text>
      </View>

      <Text style={[s.label, { color: c.text }]}>Business Name *</Text>
      <TextInput
        style={[s.input, neuInset(c), { color: c.text }]}
        placeholder="e.g. Accra Home Furnishers"
        placeholderTextColor={c.muted}
        value={name}
        onChangeText={setName}
      />

      <Text style={[s.label, { color: c.text }]}>Category *</Text>
      <View style={s.chipWrap}>
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[s.chip, { backgroundColor: category === cat ? c.primary : c.card, borderColor: category === cat ? c.primary : c.border }]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[s.chipText, { color: category === cat ? '#fff' : c.text }]}>{CATEGORY_LABELS[cat]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.label, { color: c.text }]}>City *</Text>
      <TextInput
        style={[s.input, neuInset(c), { color: c.text }]}
        placeholder="e.g. Accra"
        placeholderTextColor={c.muted}
        value={city}
        onChangeText={setCity}
      />

      <Text style={[s.label, { color: c.text }]}>Phone *</Text>
      <TextInput
        style={[s.input, neuInset(c), { color: c.text }]}
        placeholder="0241234567"
        placeholderTextColor={c.muted}
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />

      <Text style={[s.label, { color: c.text }]}>Email</Text>
      <TextInput
        style={[s.input, neuInset(c), { color: c.text }]}
        placeholder="you@business.com"
        placeholderTextColor={c.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      <Text style={[s.label, { color: c.text }]}>Description</Text>
      <TextInput
        style={[s.input, s.textArea, neuInset(c), { color: c.text }]}
        placeholder="Tell tenants what you offer..."
        placeholderTextColor={c.muted}
        multiline
        numberOfLines={4}
        value={description}
        onChangeText={setDescription}
      />

      <TouchableOpacity
        style={[s.submitBtn, { backgroundColor: c.primary }, saving && { opacity: 0.6 }]}
        onPress={save}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={16} color="#fff" />
            <Text style={s.submitText}>Create Business Profile</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  )
}

function Dashboard({
  data, isRefetching, refetch,
}: {
  data: { business: Business; listings: Listing[] }
  isRefetching: boolean
  refetch: () => void
}) {
  const c = useThemeColors()
  const qc = useQueryClient()
  const { business, listings } = data

  const [tab, setTab] = useState<Tab>('listings')
  const [addVisible, setAddVisible] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const analyticsQuery = useQuery({
    queryKey: ['my-analytics'],
    queryFn: () => api.get<Analytics>('/businesses/me/analytics'),
  })
  const inquiriesQuery = useQuery({
    queryKey: ['my-inquiries'],
    queryFn: () => api.get<{ items: Inquiry[] }>('/businesses/me/inquiries'),
  })
  const reviewsQuery = useQuery({
    queryKey: ['my-business-reviews', business.id],
    queryFn: () => api.get<{ items: Review[]; canReview: boolean }>(`/businesses/${business.id}/reviews`),
  })

  const analytics = analyticsQuery.data
  const inquiries = inquiriesQuery.data?.items ?? []
  const reviews = reviewsQuery.data?.items ?? []

  function refreshAll() {
    refetch()
    analyticsQuery.refetch()
    inquiriesQuery.refetch()
    reviewsQuery.refetch()
  }

  function advanceStatus(inquiry: Inquiry, status: InquiryStatus) {
    Alert.alert(
      `Mark as ${STATUS_LABELS[status].toLowerCase()}?`,
      `Update the inquiry from ${inquiry.requesterName} to "${STATUS_LABELS[status]}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setBusyId(inquiry.id)
            try {
              await api.patch(`/businesses/me/inquiries/${inquiry.id}`, { status })
              qc.invalidateQueries({ queryKey: ['my-inquiries'] })
              qc.invalidateQueries({ queryKey: ['my-analytics'] })
            } catch (e) {
              Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to update inquiry')
            } finally {
              setBusyId(null)
            }
          },
        },
      ],
    )
  }

  const activeListings = listings.filter((l) => l.isActive)
  const activeDiscounts = activeListings.filter((l) => l.type === 'discount').length
  const activeProductsServices = activeListings.filter((l) => l.type !== 'discount').length

  async function toggleActive(listing: Listing, value: boolean) {
    setBusyId(listing.id)
    try {
      await api.patch(`/businesses/me/listings/${listing.id}`, { isActive: value })
      qc.invalidateQueries({ queryKey: ['my-business'] })
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to update listing')
    } finally {
      setBusyId(null)
    }
  }

  function confirmDelete(listing: Listing) {
    Alert.alert(
      'Delete listing',
      `Remove "${listing.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyId(listing.id)
            try {
              await api.delete(`/businesses/me/listings/${listing.id}`)
              qc.invalidateQueries({ queryKey: ['my-business'] })
            } catch (e) {
              Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to delete listing')
            } finally {
              setBusyId(null)
            }
          },
        },
      ],
    )
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.listContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching || inquiriesQuery.isRefetching || analyticsQuery.isRefetching}
          onRefresh={refreshAll}
          tintColor={c.primary}
        />
      }
    >
      {/* Header card */}
      <View style={[s.card, neuCard(c)]}>
        <View style={s.cardHeader}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.bizName, { color: c.text }]} numberOfLines={1}>{business.name}</Text>
            <View style={s.badgeRow}>
              <View style={[s.catBadge, { backgroundColor: c.primary + '15' }]}>
                <Text style={[s.catText, { color: c.primary }]}>{CATEGORY_LABELS[business.category]}</Text>
              </View>
              <View style={[s.catBadge, { backgroundColor: (business.isVerified ? '#10b981' : '#f59e0b') + '15' }]}>
                <Ionicons
                  name={business.isVerified ? 'shield-checkmark' : 'time-outline'}
                  size={11}
                  color={business.isVerified ? '#10b981' : '#f59e0b'}
                />
                <Text style={[s.catText, { color: business.isVerified ? '#10b981' : '#f59e0b' }]}>
                  {business.isVerified ? 'Verified' : 'Pending verification'}
                </Text>
              </View>
              {business.reviewCount ? (
                <View style={[s.catBadge, { backgroundColor: '#f59e0b15' }]}>
                  <Ionicons name="star" size={11} color="#f59e0b" />
                  <Text style={[s.catText, { color: '#f59e0b' }]}>
                    {(business.ratingAvg ?? 0).toFixed(1)} ({business.reviewCount})
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={s.cityRow}>
              <Ionicons name="location-outline" size={12} color={c.muted} />
              <Text style={[s.cityText, { color: c.muted }]}>{business.city}</Text>
            </View>
          </View>
        </View>

        {/* Stats row */}
        <View style={s.statRow}>
          <View style={[s.statBox, neuInset(c)]}>
            <Text style={[s.statBoxValue, { color: c.text }]}>{listings.length}</Text>
            <Text style={[s.statBoxLabel, { color: c.muted }]}>Listings</Text>
          </View>
          <View style={[s.statBox, neuInset(c)]}>
            <Text style={[s.statBoxValue, { color: c.text }]}>{activeProductsServices}</Text>
            <Text style={[s.statBoxLabel, { color: c.muted }]}>Products & Services</Text>
          </View>
          <View style={[s.statBox, neuInset(c)]}>
            <Text style={[s.statBoxValue, { color: '#f59e0b' }]}>{activeDiscounts}</Text>
            <Text style={[s.statBoxLabel, { color: c.muted }]}>Discounts</Text>
          </View>
        </View>

        {/* Analytics row */}
        {analytics && (
          <View style={s.statRow}>
            <View style={[s.statBox, neuInset(c)]}>
              <Text style={[s.statBoxValue, { color: c.text }]}>{analytics.profileViews}</Text>
              <Text style={[s.statBoxLabel, { color: c.muted }]}>Profile views</Text>
            </View>
            <View style={[s.statBox, neuInset(c)]}>
              <Text style={[s.statBoxValue, { color: c.text }]}>{analytics.totalInquiries}</Text>
              <Text style={[s.statBoxLabel, { color: c.muted }]}>Inquiries</Text>
            </View>
            <View style={[s.statBox, neuInset(c)]}>
              <Text style={[s.statBoxValue, { color: '#3b82f6' }]}>{analytics.newInquiries}</Text>
              <Text style={[s.statBoxLabel, { color: c.muted }]}>New</Text>
            </View>
            <View style={[s.statBox, neuInset(c)]}>
              <Text style={[s.statBoxValue, { color: '#10b981' }]}>{analytics.conversionRate}%</Text>
              <Text style={[s.statBoxLabel, { color: c.muted }]}>Conversion</Text>
            </View>
          </View>
        )}
        {analytics && <InquiryTrend data={analytics.inquiriesByDay} c={c} />}

        <TouchableOpacity
          style={[s.addBtn, { backgroundColor: c.primary }]}
          onPress={() => setAddVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle" size={16} color="#fff" />
          <Text style={s.addBtnText}>Add Listing</Text>
        </TouchableOpacity>
      </View>

      {/* Segment control */}
      <View style={[s.segment, neuInset(c)]}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.segmentBtn, tab === t && { backgroundColor: c.card }]}
            onPress={() => setTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[s.segmentText, { color: tab === t ? c.text : c.muted }]}>
              {TAB_LABELS[t]}
              {t === 'inquiries' && analytics && analytics.newInquiries > 0 ? ` (${analytics.newInquiries})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'listings' && (
        <>
          <Text style={[s.sectionLabel, { color: c.muted }]}>YOUR LISTINGS</Text>
          {listings.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="pricetags-outline" size={48} color={c.muted} />
              <Text style={[s.emptyTitle, { color: c.text }]}>No listings yet</Text>
              <Text style={[s.emptySub, { color: c.muted }]}>Add products, services or discounts so tenants can find you.</Text>
            </View>
          ) : (
            listings.map((l) => (
              <View key={l.id} style={[s.card, neuCard(c)]}>
                <View style={s.cardHeader}>
                  <View style={[s.catBadge, { backgroundColor: TYPE_COLORS[l.type] + '15' }]}>
                    <Text style={[s.catText, { color: TYPE_COLORS[l.type] }]}>{TYPE_LABELS[l.type]}</Text>
                  </View>
                  <View style={s.listingActions}>
                    <Switch
                      value={l.isActive}
                      onValueChange={(v) => toggleActive(l, v)}
                      disabled={busyId === l.id}
                      trackColor={{ false: c.border, true: c.accent }}
                      thumbColor="#fff"
                    />
                    <TouchableOpacity
                      onPress={() => confirmDelete(l)}
                      disabled={busyId === l.id}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="trash-outline" size={18} color={busyId === l.id ? c.muted : c.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={[s.listingTitle, { color: c.text }]}>{l.title}</Text>
                {l.description ? (
                  <Text style={[s.listingDesc, { color: c.muted }]} numberOfLines={2}>{l.description}</Text>
                ) : null}
                <View style={s.listingMeta}>
                  {l.price != null && (
                    <Text style={[s.listingPrice, { color: c.text }]}>{formatPrice(l.price)}</Text>
                  )}
                  {l.type === 'discount' && l.promoText ? (
                    <Text style={s.promoText}>{l.promoText}</Text>
                  ) : null}
                  {!l.isActive && (
                    <Text style={[s.inactiveText, { color: c.muted }]}>Inactive — hidden from tenants</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </>
      )}

      {tab === 'inquiries' && (
        <>
          <Text style={[s.sectionLabel, { color: c.muted }]}>INQUIRIES</Text>
          {inquiriesQuery.isLoading ? (
            <ActivityIndicator color={c.primary} style={{ marginVertical: spacing.lg }} />
          ) : inquiries.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={c.muted} />
              <Text style={[s.emptyTitle, { color: c.text }]}>No inquiries yet</Text>
              <Text style={[s.emptySub, { color: c.muted }]}>When tenants request a quote, their messages land here.</Text>
            </View>
          ) : (
            inquiries.map((inq) => (
              <InquiryCard
                key={inq.id}
                inquiry={inq}
                busy={busyId === inq.id}
                onAdvance={advanceStatus}
                c={c}
              />
            ))
          )}
        </>
      )}

      {tab === 'reviews' && (
        <>
          <Text style={[s.sectionLabel, { color: c.muted }]}>REVIEWS</Text>
          {reviewsQuery.isLoading ? (
            <ActivityIndicator color={c.primary} style={{ marginVertical: spacing.lg }} />
          ) : reviews.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="star-outline" size={48} color={c.muted} />
              <Text style={[s.emptyTitle, { color: c.text }]}>No reviews yet</Text>
              <Text style={[s.emptySub, { color: c.muted }]}>Reviews from verified customers will appear here.</Text>
            </View>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={[s.card, neuCard(c)]}>
                <View style={s.reviewHeader}>
                  <Text style={[s.reviewAuthor, { color: c.text }]} numberOfLines={1}>{r.authorName}</Text>
                  <View style={s.starRow}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Ionicons key={i} name={i <= Math.round(r.rating) ? 'star' : 'star-outline'} size={12} color="#f59e0b" />
                    ))}
                  </View>
                  <Text style={[s.reviewDate, { color: c.muted }]}>{formatDate(r.createdAt)}</Text>
                </View>
                {r.review ? (
                  <Text style={[s.listingDesc, { color: c.muted }]}>{r.review}</Text>
                ) : null}
              </View>
            ))
          )}
        </>
      )}

      <AddListingModal visible={addVisible} onClose={() => setAddVisible(false)} />
    </ScrollView>
  )
}

function InquiryCard({
  inquiry, busy, onAdvance, c,
}: {
  inquiry: Inquiry
  busy: boolean
  onAdvance: (inquiry: Inquiry, status: InquiryStatus) => void
  c: ReturnType<typeof useThemeColors>
}) {
  const actions: { status: InquiryStatus; label: string; color: string }[] =
    inquiry.status === 'new'
      ? [{ status: 'contacted', label: 'Mark contacted', color: STATUS_COLORS.contacted }]
      : inquiry.status === 'contacted'
        ? [
            { status: 'won', label: 'Mark won', color: STATUS_COLORS.won },
            { status: 'lost', label: 'Mark lost', color: STATUS_COLORS.lost },
          ]
        : []

  return (
    <View style={[s.card, neuCard(c)]}>
      <View style={s.cardHeader}>
        <Text style={[s.listingTitle, { color: c.text, flex: 1 }]} numberOfLines={1}>{inquiry.requesterName}</Text>
        <View style={[s.catBadge, { backgroundColor: STATUS_COLORS[inquiry.status] + '15' }]}>
          <Text style={[s.catText, { color: STATUS_COLORS[inquiry.status] }]}>
            {STATUS_LABELS[inquiry.status]}
          </Text>
        </View>
      </View>

      {inquiry.listingTitle ? (
        <View style={s.inquiryMetaRow}>
          <Ionicons name="pricetag-outline" size={12} color={c.muted} />
          <Text style={[s.inquiryMeta, { color: c.muted }]} numberOfLines={1}>{inquiry.listingTitle}</Text>
        </View>
      ) : null}

      {inquiry.message ? (
        <Text style={[s.listingDesc, { color: c.muted }]}>{inquiry.message}</Text>
      ) : null}

      <TouchableOpacity
        style={s.inquiryMetaRow}
        onPress={() => Linking.openURL(`tel:${inquiry.requesterPhone}`)}
        activeOpacity={0.7}
      >
        <Ionicons name="call-outline" size={13} color={c.primary} />
        <Text style={[s.inquiryPhone, { color: c.primary }]}>{inquiry.requesterPhone}</Text>
        <Text style={[s.inquiryDate, { color: c.muted }]}>{formatDate(inquiry.createdAt)}</Text>
      </TouchableOpacity>

      {actions.length > 0 && (
        <View style={s.inquiryActions}>
          {actions.map((a) => (
            <TouchableOpacity
              key={a.status}
              style={[s.inquiryActionBtn, { borderColor: a.color }, busy && { opacity: 0.5 }]}
              onPress={() => onAdvance(inquiry, a.status)}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Text style={[s.inquiryActionText, { color: a.color }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

function InquiryTrend({
  data, c,
}: {
  data: { date: string; count: number }[]
  c: ReturnType<typeof useThemeColors>
}) {
  // Always render the last 30 days, zero-filling days with no inquiries.
  const counts = new Map(data.map((d) => [d.date, d.count]))
  const days: number[] = []
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    days.push(counts.get(key) ?? 0)
  }
  const max = Math.max(...days, 1)

  return (
    <View style={[s.trendBox, neuInset(c)]}>
      <Text style={[s.statBoxLabel, { color: c.muted }]}>Inquiries — last 30 days</Text>
      <View style={s.trendRow}>
        {days.map((count, i) => (
          <View
            key={i}
            style={[
              s.trendBar,
              {
                height: Math.max(3, Math.round((count / max) * 28)),
                backgroundColor: count > 0 ? c.primary : c.border,
              },
            ]}
          />
        ))}
      </View>
    </View>
  )
}

function AddListingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useThemeColors()
  const qc = useQueryClient()

  const [title, setTitle] = useState('')
  const [type, setType] = useState<ListingType>('product')
  const [price, setPrice] = useState('')
  const [promoText, setPromoText] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  function reset() {
    setTitle('')
    setType('product')
    setPrice('')
    setPromoText('')
    setDescription('')
  }

  async function save() {
    if (title.trim().length < 2) {
      Alert.alert('Invalid title', 'Listing title must be at least 2 characters')
      return
    }
    const parsedPrice = price.trim() === '' ? undefined : Number(price)
    if (parsedPrice != null && (Number.isNaN(parsedPrice) || parsedPrice < 0)) {
      Alert.alert('Invalid price', 'Please enter a valid price')
      return
    }
    setSaving(true)
    try {
      await api.post('/businesses/me/listings', {
        title: title.trim(),
        type,
        price: parsedPrice,
        promoText: type === 'discount' ? promoText.trim() || undefined : undefined,
        description: description.trim() || undefined,
      })
      qc.invalidateQueries({ queryKey: ['my-business'] })
      reset()
      onClose()
      Alert.alert('Added', 'Your listing is live.')
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to add listing')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalContent, { backgroundColor: c.card }]}>
          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, { color: c.text }]}>Add Listing</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={c.text} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[s.label, { color: c.text }]}>Title *</Text>
            <TextInput
              style={[s.input, neuInset(c), { color: c.text }]}
              placeholder="e.g. 2-bedroom furniture package"
              placeholderTextColor={c.muted}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={[s.label, { color: c.text }]}>Type *</Text>
            <View style={s.chipWrap}>
              {(Object.keys(TYPE_LABELS) as ListingType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[s.chip, { backgroundColor: type === t ? c.primary : c.surface, borderColor: type === t ? c.primary : c.border }]}
                  onPress={() => setType(t)}
                >
                  <Text style={[s.chipText, { color: type === t ? '#fff' : c.text }]}>{TYPE_LABELS[t]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {type !== 'discount' && (
              <>
                <Text style={[s.label, { color: c.text }]}>Price (GH₵)</Text>
                <TextInput
                  style={[s.input, neuInset(c), { color: c.text }]}
                  placeholder="0.00"
                  placeholderTextColor={c.muted}
                  keyboardType="decimal-pad"
                  value={price}
                  onChangeText={setPrice}
                />
              </>
            )}

            {type === 'discount' && (
              <>
                <Text style={[s.label, { color: c.text }]}>Promo Text</Text>
                <TextInput
                  style={[s.input, neuInset(c), { color: c.text }]}
                  placeholder="e.g. 20% off first month"
                  placeholderTextColor={c.muted}
                  value={promoText}
                  onChangeText={setPromoText}
                />
              </>
            )}

            <Text style={[s.label, { color: c.text }]}>Description</Text>
            <TextInput
              style={[s.input, s.textArea, neuInset(c), { color: c.text }]}
              placeholder="Describe this listing..."
              placeholderTextColor={c.muted}
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
            />

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: c.primary }, saving && { opacity: 0.6 }]}
              onPress={save}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.submitText}>Publish Listing</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: spacing.md, paddingBottom: spacing.xl },

  setupHero: { borderRadius: 14, borderWidth: 1, padding: spacing.lg, alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  setupTitle: { fontSize: 18, fontFamily: 'Manrope_800ExtraBold' },
  setupSub: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center', lineHeight: 19 },
  formContent: { padding: spacing.md, paddingBottom: 40 },

  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.md, marginBottom: spacing.xs },
  input: { paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, fontFamily: 'Manrope_500Medium' },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12, marginTop: spacing.lg, marginBottom: spacing.md },
  submitText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },

  card: { padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  bizName: { fontSize: 17, fontFamily: 'Manrope_800ExtraBold' },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  catText: { fontSize: 10, fontFamily: 'Manrope_700Bold' },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cityText: { fontSize: 12, fontFamily: 'Manrope_400Regular' },

  statRow: { flexDirection: 'row', gap: 6 },
  statBox: { flex: 1, padding: 10, gap: 2, alignItems: 'center' },
  statBoxValue: { fontSize: 16, fontFamily: 'Manrope_800ExtraBold' },
  statBoxLabel: { fontSize: 9, fontFamily: 'Manrope_500Medium', textTransform: 'uppercase', textAlign: 'center' },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10 },
  addBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_600SemiBold' },

  sectionLabel: { fontSize: 9, fontFamily: 'Manrope_700Bold', letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.xs },
  empty: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  emptyTitle: { fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  emptySub: { fontSize: 12, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },

  listingActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  listingTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  listingDesc: { fontSize: 12, fontFamily: 'Manrope_400Regular', lineHeight: 17 },
  listingMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  listingPrice: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  promoText: { fontSize: 12, fontFamily: 'Manrope_700Bold', color: '#f59e0b' },
  inactiveText: { fontSize: 11, fontFamily: 'Manrope_500Medium', fontStyle: 'italic' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold', flex: 1, marginRight: spacing.md },

  segment: { flexDirection: 'row', padding: 4, gap: 4, marginBottom: spacing.md },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  segmentText: { fontSize: 12, fontFamily: 'Manrope_700Bold' },

  trendBox: { padding: 10, gap: 6 },
  trendRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 28 },
  trendBar: { flex: 1, borderRadius: 2 },

  inquiryMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inquiryMeta: { fontSize: 12, fontFamily: 'Manrope_500Medium', flex: 1 },
  inquiryPhone: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', flex: 1 },
  inquiryDate: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  inquiryActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  inquiryActionBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1.5 },
  inquiryActionText: { fontSize: 12, fontFamily: 'Manrope_700Bold' },

  starRow: { flexDirection: 'row', gap: 2 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewAuthor: { fontSize: 13, fontFamily: 'Manrope_700Bold', flex: 1 },
  reviewDate: { fontSize: 10, fontFamily: 'Manrope_400Regular' },
})
