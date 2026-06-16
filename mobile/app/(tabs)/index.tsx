import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, StatusBar, Platform, Dimensions, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../../lib/theme'
import { formatCompact, formatCurrency, formatDate } from '../../lib/format'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { Logo } from '../../components/Logo'
import { DashboardSkeleton } from '../../components/Skeleton'

interface PropertyItem {
  id?: string
  _id?: string
  title?: string
  images?: string[]
  rentAmount?: number
  address?: { city?: string; region?: string }
  bedrooms?: number
  bathrooms?: number
}

interface AgreementItem {
  rentAmount?: number
  startDate?: string
  endDate?: string
  landlordName?: string
  status?: string
}

const STATUS_BAR_HEIGHT = Platform.OS === 'ios' ? 54 : StatusBar.currentHeight ?? 24
const screenW = Dimensions.get('window').width

export default function HomeScreen() {
  const c = useThemeColors()
  const user = useAuthStore((s) => s.user)
  const router = useRouter()
  const [analytics, setAnalytics] = useState<Record<string, number> | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  const [savedProperties, setSavedProperties] = useState<PropertyItem[]>([])
  const [recommendations, setRecommendations] = useState<PropertyItem[]>([])
  const [activeAgreement, setActiveAgreement] = useState<AgreementItem | null>(null)

  async function load() {
    try {
      const [data, favs, props, recs, agreementsRes] = await Promise.all([
        api.get<Record<string, number>>('/analytics/me'),
        api.get<{ propertyIds: string[] }>('/properties/favorites/me').catch(() => ({ propertyIds: [] })),
        api.get<{ items: PropertyItem[] }>('/properties').catch(() => ({ items: [] })),
        api.get<PropertyItem[]>('/properties/recommendations/for-me').catch(() => []),
        api.get<{ items: AgreementItem[] }>('/agreements').catch(() => ({ items: [] })),
      ])
      setAnalytics(data)
      const favIds: string[] = favs.propertyIds ?? []
      setSavedProperties(props.items.filter((p) => favIds.includes(p.id ?? p._id ?? '')))
      setRecommendations(Array.isArray(recs) ? recs.slice(0, 4) : [])
      const active = (agreementsRes.items ?? []).find((a) => a.status === 'active')
      setActiveAgreement(active ?? null)
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const isLandlord = user?.activeRole === 'landlord' || user?.activeRole === 'property_manager'

  if (loading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: c.background }]}>
        <StatusBar barStyle="light-content" />
        <DashboardSkeleton />
      </View>
    )
  }

  const stats = isLandlord
    ? [
        { icon: 'business-outline' as const, label: 'Properties', value: String(analytics?.totalProperties ?? 0), color: '#3b82f6' },
        { icon: 'people-outline' as const, label: 'Tenants', value: String(analytics?.activeTenants ?? 0), color: '#10b981' },
        { icon: 'cash-outline' as const, label: 'Revenue', value: formatCompact(analytics?.totalRevenue ?? 0), color: '#f59e0b' },
        { icon: 'alert-circle-outline' as const, label: 'Disputes', value: String(analytics?.openDisputes ?? 0), color: '#ef4444' },
      ]
    : [
        { icon: 'document-text-outline' as const, label: 'Agreements', value: String(analytics?.activeAgreements ?? 0), color: '#3b82f6' },
        { icon: 'card-outline' as const, label: 'Next Payment', value: formatCompact(analytics?.nextPaymentAmount ?? 0), color: '#f59e0b' },
        { icon: 'wallet-outline' as const, label: 'Saved', value: formatCompact(analytics?.totalSaved ?? 0), color: '#10b981' },
        { icon: 'cash-outline' as const, label: 'Wallet', value: formatCompact(analytics?.walletBalance ?? 0), color: '#8b5cf6' },
      ]

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" progressViewOffset={STATUS_BAR_HEIGHT + 120} />}
      >
        {/* Full-bleed header */}
        <View style={[s.header, { backgroundColor: '#0f1f33' }]}>
          {/* Top bar */}
          <View style={s.topBar}>
            <Logo size={28} theme="light" />
            <TouchableOpacity onPress={() => router.push('/settings')} style={s.settingsBtn}>
              <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>

          {/* Greeting */}
          <Text style={s.greeting}>Welcome back,</Text>
          <Text style={s.name}>{user?.firstName} {user?.lastName}</Text>
          <View style={s.roleBadge}>
            <Text style={s.roleText}>{user?.activeRole?.replace('_', ' ')}</Text>
          </View>
        </View>

        {/* Stats — overlapping the header */}
        <View style={s.statsWrap}>
          <View style={s.statsGrid}>
            {stats.map((stat) => (
              <View
                key={stat.label}
                style={[
                  s.stat,
                  {
                    backgroundColor: c.card,
                    borderLeftWidth: 3,
                    borderLeftColor: stat.color,
                    borderColor: c.border,
                  },
                ]}
              >
                <View style={[s.statIcon, { backgroundColor: stat.color + '18' }]}>
                  <Ionicons name={stat.icon} size={18} color={stat.color} />
                </View>
                <Text style={[s.statValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
                <Text style={[s.statLabel, { color: c.muted }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Residence Status */}
        {!isLandlord && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push(activeAgreement ? '/(tabs)/agreements' as string : '/(tabs)/properties' as string)}
            style={[
              s.residenceBanner,
              {
                backgroundColor: activeAgreement ? '#10b98110' : c.card,
                borderColor: activeAgreement ? '#10b98130' : c.border,
              },
            ]}
          >
            <View style={s.residenceTopRow}>
              <View style={[s.residenceIcon, { backgroundColor: activeAgreement ? '#10b98118' : c.surface }]}>
                <Ionicons
                  name={activeAgreement ? 'home' : 'home-outline'}
                  size={18}
                  color={activeAgreement ? '#10b981' : c.muted}
                />
              </View>
              <Text style={[s.residenceTitle, { color: c.text, flex: 1 }]} numberOfLines={1}>
                {activeAgreement ? 'Currently Residing' : 'No Active Lease'}
              </Text>
              {activeAgreement && (
                <View style={s.activeBadge}>
                  <Text style={s.activeBadgeText}>Active</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={14} color={c.muted} />
            </View>
            {activeAgreement ? (
              <View style={s.residenceDetails}>
                <View style={s.residenceDetailItem}>
                  <Text style={[s.residenceDetailLabel, { color: c.muted }]}>Rent</Text>
                  <Text style={[s.residenceDetailValue, { color: c.text }]}>{formatCurrency(activeAgreement.rentAmount ?? 0)}/mo</Text>
                </View>
                <View style={[s.residenceDivider, { backgroundColor: c.border }]} />
                <View style={s.residenceDetailItem}>
                  <Text style={[s.residenceDetailLabel, { color: c.muted }]}>Period</Text>
                  <Text style={[s.residenceDetailValue, { color: c.text }]}>{formatDate(activeAgreement.startDate ?? '').split(',')[0]} – {formatDate(activeAgreement.endDate ?? '').split(',')[0]}</Text>
                </View>
                {activeAgreement.landlordName && (
                  <>
                    <View style={[s.residenceDivider, { backgroundColor: c.border }]} />
                    <View style={s.residenceDetailItem}>
                      <Text style={[s.residenceDetailLabel, { color: c.muted }]}>Landlord</Text>
                      <Text style={[s.residenceDetailValue, { color: c.text }]} numberOfLines={1}>{activeAgreement.landlordName}</Text>
                    </View>
                  </>
                )}
              </View>
            ) : (
              <Text style={[s.residenceSub, { color: c.muted }]}>You're not under any rental agreement</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Savings progress */}
        {!isLandlord && analytics && (analytics.savingsTarget ?? 0) > 0 && (
          <View style={[s.card, { backgroundColor: c.card }]}>
            <View style={s.cardHeader}>
              <Text style={[s.cardTitle, { color: c.text }]}>Savings Progress</Text>
              <Text style={[s.cardPct, { color: c.accent }]}>{Math.min(100, analytics.savingsProgress ?? 0)}%</Text>
            </View>
            <View style={[s.progressBar, { backgroundColor: c.surface }]}>
              <View style={[s.progressFill, { width: `${Math.min(100, analytics.savingsProgress ?? 0)}%`, backgroundColor: c.accent }]} />
            </View>
            <Text style={[s.progressText, { color: c.muted }]}>
              {formatCompact(analytics.totalSaved ?? 0)} of {formatCompact(analytics.savingsTarget ?? 0)}
            </Text>
          </View>
        )}

        {/* Saved Properties */}
        {!isLandlord && savedProperties.length > 0 && (
          <View style={s.quickActions}>
            <View style={s.sectionHeader}>
              <Text style={[s.sectionTitle, { color: c.text }]}>Saved Properties</Text>
              <TouchableOpacity onPress={() => router.push('/saved-properties' as string)}>
                <Text style={[s.seeAll, { color: c.primary }]}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: spacing.md }}>
              {savedProperties.slice(0, 5).map((p) => (
                <TouchableOpacity key={p.id ?? p._id} style={[s.savedCard, { backgroundColor: c.card }]} activeOpacity={0.7} onPress={() => router.push(`/property/${p.id ?? p._id}` as string)}>
                  {(p.images?.length ?? 0) > 0 ? (
                    <Image source={{ uri: p.images?.[0] }} style={s.savedImage} />
                  ) : (
                    <View style={[s.savedImagePlaceholder, { backgroundColor: c.primary + '08' }]}>
                      <Ionicons name="business-outline" size={20} color={c.primary + '30'} />
                    </View>
                  )}
                  <View style={[s.savedHeart, { backgroundColor: c.white + 'E6' }]}>
                    <Ionicons name="heart" size={12} color="#ef4444" />
                  </View>
                  <View style={s.savedBody}>
                    <Text style={[s.savedTitle, { color: c.text }]} numberOfLines={1}>{p.title}</Text>
                    <View style={s.savedLocationRow}>
                      <Ionicons name="location-outline" size={10} color={c.muted} />
                      <Text style={[s.savedLocation, { color: c.muted }]} numberOfLines={1}>{p.address?.city}, {p.address?.region}</Text>
                    </View>
                    <View style={s.savedBottom}>
                      <Text style={[s.savedPrice, { color: c.primary }]}>{formatCompact(p.rentAmount ?? 0)}/mo</Text>
                      <View style={s.savedDetails}>
                        <Ionicons name="bed-outline" size={10} color={c.muted} />
                        <Text style={[s.savedDetailText, { color: c.muted }]}>{p.bedrooms ?? '-'}</Text>
                        <Ionicons name="water-outline" size={10} color={c.muted} />
                        <Text style={[s.savedDetailText, { color: c.muted }]}>{p.bathrooms ?? '-'}</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Recommended Properties */}
        {!isLandlord && recommendations.length > 0 && (
          <View style={s.quickActions}>
            <View style={s.sectionHeader}>
              <Text style={[s.sectionTitle, { color: c.text }]}>Recommended for You</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/properties' as string)}>
                <Text style={[s.seeAll, { color: c.primary }]}>Browse</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: spacing.md }}>
              {recommendations.map((p) => (
                <TouchableOpacity key={p.id ?? p._id} style={[s.savedCard, { backgroundColor: c.card }]} activeOpacity={0.7} onPress={() => router.push(`/property/${p.id ?? p._id}` as string)}>
                  {(p.images?.length ?? 0) > 0 ? (
                    <Image source={{ uri: p.images?.[0] }} style={s.savedImage} />
                  ) : (
                    <View style={[s.savedImagePlaceholder, { backgroundColor: '#f59e0b08' }]}>
                      <Ionicons name="sparkles-outline" size={20} color="#f59e0b30" />
                    </View>
                  )}
                  <View style={s.savedBody}>
                    <Text style={[s.savedTitle, { color: c.text }]} numberOfLines={1}>{p.title}</Text>
                    <View style={s.savedLocationRow}>
                      <Ionicons name="location-outline" size={10} color={c.muted} />
                      <Text style={[s.savedLocation, { color: c.muted }]} numberOfLines={1}>{p.address?.city}, {p.address?.region}</Text>
                    </View>
                    <View style={s.savedBottom}>
                      <Text style={[s.savedPrice, { color: c.primary }]}>{formatCompact(p.rentAmount ?? 0)}/mo</Text>
                      <View style={s.savedDetails}>
                        <Ionicons name="bed-outline" size={10} color={c.muted} />
                        <Text style={[s.savedDetailText, { color: c.muted }]}>{p.bedrooms ?? '-'}</Text>
                        <Ionicons name="water-outline" size={10} color={c.muted} />
                        <Text style={[s.savedDetailText, { color: c.muted }]}>{p.bathrooms ?? '-'}</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Quick Actions */}
        <View style={s.quickActions}>
          <Text style={[s.sectionTitle, { color: c.text }]}>Quick Actions</Text>
          <View style={s.actionGrid}>
            {[
              { icon: 'card-outline' as const, label: 'Pay Rent', route: '/(tabs)/payments', color: '#3b82f6' },
              { icon: 'wallet-outline' as const, label: 'Savings', route: '/(tabs)/savings', color: '#10b981' },
              { icon: 'business-outline' as const, label: 'Properties', route: '/(tabs)/properties', color: '#f59e0b' },
              { icon: 'chatbubbles-outline' as const, label: 'Messages', route: '/messages', color: '#8b5cf6' },
              { icon: 'construct-outline' as const, label: 'Workers', route: '/workers', color: '#06b6d4' },
              { icon: 'calendar-outline' as const, label: 'Bookings', route: '/bookings', color: '#8b5cf6' },
              { icon: 'color-wand-outline' as const, label: 'AI Writer', route: '/ai-writer', color: '#f59e0b' },
              { icon: 'trending-up-outline' as const, label: 'Pricing', route: '/pricing', color: '#10b981' },
            ].map((action) => (
              <TouchableOpacity key={action.label} style={s.actionBtn} onPress={() => router.push(action.route as string)}>
                <View style={[s.actionIcon, { backgroundColor: action.color + '12' }]}>
                  <Ionicons name={action.icon} size={22} color={action.color} />
                </View>
                <Text style={[s.actionLabel, { color: c.text }]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header — full bleed
  header: {
    paddingTop: STATUS_BAR_HEIGHT + 12,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl + 40,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  settingsBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  greeting: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: 'Manrope_400Regular' },
  name: { color: '#ffffff', fontSize: 26, fontFamily: 'Manrope_800ExtraBold', marginTop: 2 },
  roleBadge: { backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, alignSelf: 'flex-start', marginTop: spacing.sm },
  roleText: { color: '#ffffff', fontSize: 11, fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize' },

  // Stats — overlapping
  statsWrap: { marginTop: -36, paddingHorizontal: spacing.sm },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: (screenW - 40) / 2, borderRadius: 14, borderWidth: 1, padding: 12, gap: 4, overflow: 'hidden' },
  statIcon: { width: 32, height: 32, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  statValue: { fontSize: 16, fontFamily: 'Manrope_800ExtraBold' },
  statLabel: { fontSize: 10, fontFamily: 'Manrope_500Medium' },

  // Residence banner
  residenceBanner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  residenceTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  residenceIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  residenceTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  activeBadge: { backgroundColor: '#10b98118', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  activeBadgeText: { fontSize: 10, fontFamily: 'Manrope_600SemiBold', color: '#10b981' },
  residenceDetails: { flexDirection: 'row', alignItems: 'center', paddingLeft: 44 },
  residenceDetailItem: { gap: 1 },
  residenceDetailLabel: { fontSize: 9, fontFamily: 'Manrope_500Medium', textTransform: 'uppercase', letterSpacing: 0.5 },
  residenceDetailValue: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  residenceDivider: { width: 1, height: 24, marginHorizontal: 12, opacity: 0.3 },
  residenceSub: { fontSize: 12, fontFamily: 'Manrope_400Regular', paddingLeft: 44 },

  // Cards
  card: { marginHorizontal: spacing.md, borderRadius: 14, padding: spacing.md, marginTop: spacing.md, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  cardPct: { fontSize: 16, fontFamily: 'Manrope_800ExtraBold' },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressText: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 6 },

  // Quick actions
  quickActions: { padding: spacing.md },
  sectionTitle: { fontSize: 15, fontFamily: 'Manrope_700Bold', marginBottom: spacing.md },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { width: (screenW - 56) / 3, alignItems: 'center', gap: 6 },
  actionIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  actionLabel: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },

  // Saved properties
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  seeAll: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  savedCard: { width: 200, borderRadius: 14, overflow: 'hidden' as const },
  savedImage: { width: 200, height: 110, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  savedImagePlaceholder: { width: 200, height: 110, justifyContent: 'center', alignItems: 'center' },
  savedHeart: { position: 'absolute' as const, top: 8, right: 8, width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  savedBody: { padding: 10, gap: 3 },
  savedTitle: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  savedLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  savedLocation: { fontSize: 10, fontFamily: 'Manrope_400Regular', flex: 1 },
  savedBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  savedPrice: { fontSize: 13, fontFamily: 'Manrope_800ExtraBold' },
  savedDetails: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  savedDetailText: { fontSize: 10, fontFamily: 'Manrope_400Regular' },
})
