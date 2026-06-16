import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useThemeColors, useIsDark, spacing } from '../../lib/theme'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'

interface MenuSection {
  title: string
  items: { icon: string; label: string; onPress: () => void; badge?: string; color?: string }[]
}

export default function ProfileScreen() {
  const c = useThemeColors()
  const isDark = useIsDark()
  const { user, logout } = useAuthStore()
  const router = useRouter()
  const { mode, setMode } = useThemeStore()

  function handleLogout() {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          logout()
          router.replace('/auth/login')
        },
      },
    ])
  }

  const isTenant = user?.activeRole === 'tenant'
  const isLandlord = user?.activeRole === 'landlord' || user?.activeRole === 'property_manager'
  const isGovOrAdmin = user?.activeRole === 'government' || user?.activeRole === 'admin'

  const sections: MenuSection[] = [
    {
      title: 'Account',
      items: [
        { icon: 'person-outline', label: 'Edit Profile', onPress: () => router.push('/settings') },
        { icon: 'card-outline', label: 'Payments', onPress: () => router.push('/payments') },
        { icon: 'notifications-outline', label: 'Notifications', onPress: () => router.push('/notifications') },
        ...(isTenant ? [{ icon: 'person-circle-outline', label: 'Tenant Profile', onPress: () => router.push('/tenant-profile') }] : []),
        ...(isLandlord ? [{ icon: 'trophy-outline' as const, label: 'Subscription', onPress: () => router.push('/subscription' as string) }] : []),
      ],
    },
    {
      title: 'Property',
      items: [
        { icon: 'shield-checkmark-outline', label: 'Verify Identity', onPress: () => router.push('/tenant-profile'), badge: user?.isVerified ? undefined : 'Action needed', color: user?.isVerified ? undefined : c.warning },
        { icon: 'heart-outline', label: 'Saved Properties', onPress: () => router.push('/saved-properties') },
        ...(isLandlord ? [{ icon: 'people-outline' as const, label: 'My Tenants', onPress: () => router.push('/tenants' as string) }] : []),
        { icon: 'document-attach-outline', label: 'Applications', onPress: () => router.push('/applications') },
        { icon: 'document-text-outline', label: 'My Agreements', onPress: () => router.push('/agreements') },
        { icon: 'folder-outline', label: 'Documents', onPress: () => router.push('/documents') },
      ],
    },
    {
      title: 'Services',
      items: [
        { icon: 'construct-outline', label: 'Find Workers', onPress: () => router.push('/workers') },
        { icon: 'calendar-outline', label: 'My Bookings', onPress: () => router.push('/bookings') },
        { icon: 'hammer-outline', label: 'Become a Worker', onPress: () => router.push('/become-worker') },
      ],
    },
    {
      title: 'Insights',
      items: [
        { icon: 'analytics-outline', label: 'Credit Score', onPress: () => router.push('/credit-score') },
        { icon: 'bar-chart-outline', label: 'Analytics', onPress: () => router.push('/analytics') },
        { icon: 'scale-outline', label: 'Rental Laws', onPress: () => router.push('/legal') },
        { icon: 'sparkles-outline', label: 'AI Legal Assistant', onPress: () => router.push('/legal-assistant') },
        { icon: 'color-wand-outline', label: 'AI Writer', onPress: () => router.push('/ai-writer') },
        { icon: 'trending-up-outline', label: 'Pricing Engine', onPress: () => router.push('/pricing') },
        { icon: 'book-outline', label: 'Blog', onPress: () => router.push('/blog') },
      ],
    },
    ...(isGovOrAdmin ? [{
      title: 'Administration',
      items: [
        { icon: 'checkmark-done-circle-outline', label: 'Property Reviews', onPress: () => router.push('/gov-reviews') },
        { icon: 'stats-chart-outline', label: 'Government Panel', onPress: () => router.push('/gov-panel') },
        { icon: 'people-circle-outline', label: 'User Management', onPress: () => router.push('/users-admin') },
      ],
    }] : []),
    {
      title: 'Support',
      items: [
        { icon: 'lock-closed-outline', label: 'Profile Access', onPress: () => router.push('/profile-access') },
        { icon: 'alert-circle-outline', label: 'Disputes', onPress: () => router.push('/disputes') },
        { icon: 'help-circle-outline', label: 'Help & Support', onPress: () => router.push('/help') },
        { icon: 'information-circle-outline', label: 'About RentOS', onPress: () => router.push('/about') },
      ],
    },
  ]

  const themeOptions: { value: 'light' | 'dark' | 'system'; icon: string }[] = [
    { value: 'light', icon: 'sunny' },
    { value: 'dark', icon: 'moon' },
    { value: 'system', icon: 'phone-portrait-outline' },
  ]

  const gradientColors = isDark
    ? ['#1e293b', '#0f172a'] as const
    : ['#1e3a5f', '#2d5a8e'] as const

  return (
    <ScrollView style={[s.container, { backgroundColor: c.surface }]} showsVerticalScrollIndicator={false}>
      {/* Header with gradient */}
      <LinearGradient colors={gradientColors} style={s.headerGradient}>
        {/* Top bar */}
        <View style={s.topBar}>
          <View style={{ width: 36 }} />
          <Text style={s.topTitle}>Profile</Text>
          <TouchableOpacity
            style={s.settingsBtn}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="settings-outline" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Avatar + info */}
        <View style={s.profileInfo}>
          <View style={s.avatarRing}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>
                {(user?.firstName?.[0] ?? '').toUpperCase()}{(user?.lastName?.[0] ?? '').toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={s.name}>{user?.firstName} {user?.lastName}</Text>
          <Text style={s.email}>{user?.email}</Text>

          {/* Role + verified */}
          <View style={s.badgeRow}>
            <View style={s.roleBadge}>
              <Ionicons name="shield-checkmark" size={10} color="#ffffff" />
              <Text style={s.roleText}>{user?.activeRole?.replace('_', ' ')}</Text>
            </View>
            {user?.isVerified && (
              <View style={[s.verifiedBadge]}>
                <Ionicons name="checkmark-circle" size={10} color="#10b981" />
                <Text style={s.verifiedText}>Verified</Text>
              </View>
            )}
          </View>
        </View>

        {/* Quick stats */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Ionicons name="call-outline" size={14} color="rgba(255,255,255,0.6)" />
            <Text style={s.statValue}>{user?.phone ?? '-'}</Text>
          </View>
          <View style={[s.statDivider]} />
          <View style={s.statItem}>
            <Ionicons name="id-card-outline" size={14} color="rgba(255,255,255,0.6)" />
            <Text style={s.statValue}>{user?.id?.slice(0, 8)}...</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Role switcher */}
      {user && user.roles.length > 1 && (
        <View style={[s.roleSwitcher, { backgroundColor: c.white, borderColor: c.border }]}>
          <Text style={[s.roleSwitchLabel, { color: c.muted }]}>Switch role</Text>
          <View style={s.roleRow}>
            {user.roles.map((role) => {
              const active = user.activeRole === role
              return (
                <TouchableOpacity
                  key={role}
                  style={[
                    s.roleBtn,
                    { backgroundColor: active ? c.primary + '12' : c.surface, borderColor: active ? c.primary : c.border },
                  ]}
                  onPress={() => useAuthStore.getState().switchRole(role)}
                >
                  <View style={[s.roleDot, { backgroundColor: active ? c.primary : c.muted + '40' }]} />
                  <Text style={[s.roleBtnText, { color: active ? c.primary : c.muted }]}>
                    {role.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      )}

      {/* Menu sections */}
      {sections.map((section) => (
        <View key={section.title} style={s.section}>
          <Text style={[s.sectionTitle, { color: c.muted }]}>{section.title}</Text>
          <View style={[s.sectionCard, { backgroundColor: c.white }]}>
            {section.items.map((item, i) => (
              <TouchableOpacity
                key={item.label}
                style={[
                  s.menuItem,
                  i < section.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border + '60' },
                ]}
                onPress={item.onPress}
                activeOpacity={0.6}
              >
                <View style={[s.menuIcon, { backgroundColor: (item.color ?? c.primary) + '10' }]}>
                  <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={18} color={item.color ?? c.primary} />
                </View>
                <Text style={[s.menuLabel, { color: c.text }]}>{item.label}</Text>
                {item.badge && (
                  <View style={[s.menuBadge, { backgroundColor: (item.color ?? c.primary) + '15' }]}>
                    <Text style={[s.menuBadgeText, { color: item.color ?? c.primary }]}>{item.badge}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color={c.muted + '80'} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      {/* Theme toggle */}
      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: c.muted }]}>Appearance</Text>
        <View style={[s.sectionCard, { backgroundColor: c.white }]}>
          <View style={s.themeRow}>
            {themeOptions.map((opt) => {
              const active = mode === opt.value
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    s.themeBtn,
                    { backgroundColor: active ? c.primary + '12' : c.surface, borderColor: active ? c.primary : 'transparent' },
                  ]}
                  onPress={() => setMode(opt.value)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={opt.icon as keyof typeof Ionicons.glyphMap} size={20} color={active ? c.primary : c.muted} />
                  <Text style={[s.themeBtnText, { color: active ? c.primary : c.muted }]}>
                    {opt.value.charAt(0).toUpperCase() + opt.value.slice(1)}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </View>

      {/* Logout */}
      <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xl }}>
        <TouchableOpacity
          style={[s.logoutBtn, { backgroundColor: c.danger + '08', borderColor: c.danger + '20' }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={18} color={c.danger} />
          <Text style={[s.logoutText, { color: c.danger }]}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={[s.version, { color: c.muted + '80' }]}>RentOS v1.0.0</Text>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },

  // Header
  headerGradient: {
    paddingTop: 56,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  topTitle: {
    fontSize: 17,
    fontFamily: 'Manrope_700Bold',
    color: '#ffffff',
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Profile info
  profileInfo: { alignItems: 'center', paddingHorizontal: spacing.md },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#ffffff', fontSize: 26, fontFamily: 'Manrope_700Bold' },
  name: { fontSize: 22, fontFamily: 'Manrope_800ExtraBold', color: '#ffffff', marginTop: 12 },
  email: { fontSize: 13, fontFamily: 'Manrope_400Regular', color: 'rgba(255,255,255,0.55)', marginTop: 2 },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  roleText: { fontSize: 11, fontFamily: 'Manrope_600SemiBold', color: '#ffffff', textTransform: 'capitalize' },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  verifiedText: { fontSize: 11, fontFamily: 'Manrope_600SemiBold', color: '#10b981' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingTop: 16,
    marginHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' },
  statValue: { fontSize: 13, fontFamily: 'Manrope_500Medium', color: 'rgba(255,255,255,0.7)' },
  statDivider: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.12)' },

  // Role switcher
  roleSwitcher: {
    marginHorizontal: spacing.md,
    marginTop: -12,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  roleSwitchLabel: { fontSize: 11, fontFamily: 'Manrope_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  roleDot: { width: 6, height: 6, borderRadius: 3 },
  roleBtnText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize' },

  // Sections
  section: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: { borderRadius: 14, overflow: 'hidden' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: { flex: 1, fontSize: 14, fontFamily: 'Manrope_500Medium' },
  menuBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  menuBadgeText: { fontSize: 10, fontFamily: 'Manrope_600SemiBold' },

  // Theme
  themeRow: { flexDirection: 'row', gap: 8, padding: 10 },
  themeBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  themeBtnText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: spacing.md,
  },
  logoutText: { fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  version: { fontSize: 11, fontFamily: 'Manrope_400Regular', textAlign: 'center', marginTop: 12 },
})
