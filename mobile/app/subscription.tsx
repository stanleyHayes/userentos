import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'

interface Package {
  id: string; name: string; price: number; maxProperties: number
  features: string[]; isPopular?: boolean
}

interface Subscription {
  package: Package | null
  subscriptionStartDate: string | null
  subscriptionEndDate: string | null
  propertyCount: number
  maxProperties: number
  canAddProperty: boolean
}

function formatCurrency(n: number) {
  return `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`
}

export default function SubscriptionScreen() {
  const c = useThemeColors()
  const [packages, setPackages] = useState<Package[]>([])
  const [sub, setSub] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<string | null>(null)

  async function load() {
    try {
      const [pkgRes, subRes] = await Promise.all([
        api.get<{ items: Package[] }>('/subscriptions/packages'),
        api.get<Subscription>('/subscriptions/my-subscription'),
      ])
      setPackages(pkgRes.items ?? [])
      setSub(subRes)
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleSubscribe(packageId: string) {
    setSubscribing(packageId)
    try {
      await api.post('/subscriptions/subscribe', { packageId })
      Alert.alert('Success', 'Subscription activated!')
      load()
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to subscribe')
    } finally { setSubscribing(null) }
  }

  if (loading) {
    return <View style={[s.center, { backgroundColor: c.surface }]}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <ScrollView
      style={[s.container, { backgroundColor: c.surface }]}
      contentContainerStyle={s.scroll}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      {/* Current Plan */}
      {sub?.package && (
        <View style={[s.currentPlan, { backgroundColor: c.primary + '10', borderColor: c.primary + '30' }]}>
          <View style={s.currentPlanRow}>
            <View style={[s.crownBadge, { backgroundColor: c.primary + '20' }]}>
              <Ionicons name="trophy" size={20} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.currentPlanName, { color: c.primaryDark }]}>Current: {sub.package.name}</Text>
              <Text style={[s.currentPlanMeta, { color: c.muted }]}>
                {sub.propertyCount} of {sub.maxProperties === -1 ? 'unlimited' : sub.maxProperties} properties
                {sub.subscriptionEndDate ? ` · Renews ${new Date(sub.subscriptionEndDate).toLocaleDateString()}` : ''}
              </Text>
            </View>
          </View>
          {sub.maxProperties !== -1 && (
            <View style={s.progressBar}>
              <View style={[s.progressTrack, { backgroundColor: c.white }]}>
                <View style={[s.progressFill, { backgroundColor: c.primary, width: `\${Math.min(100, (sub.propertyCount / sub.maxProperties) * 100)}%` as unknown as ViewStyle['width'] }]} />
              </View>
            </View>
          )}
        </View>
      )}

      {/* Package Cards */}
      {packages.map((pkg) => {
        const isCurrent = pkg.id === sub?.package?.id
        return (
          <View key={pkg.id} style={[s.card, { backgroundColor: c.white, borderColor: isCurrent ? c.primary : c.border }]}>
            {pkg.isPopular && (
              <View style={[s.popularBadge, { backgroundColor: c.secondary }]}>
                <Text style={s.popularText}>Popular</Text>
              </View>
            )}
            <Text style={[s.pkgName, { color: c.primaryDark }]}>{pkg.name}</Text>
            <Text style={[s.pkgPrice, { color: c.primary }]}>
              {pkg.price === 0 ? 'Free' : formatCurrency(pkg.price)}
              {pkg.price > 0 && <Text style={[s.pkgPeriod, { color: c.muted }]}>/month</Text>}
            </Text>
            <Text style={[s.pkgLimit, { color: c.muted }]}>
              {pkg.maxProperties === -1 ? 'Unlimited properties' : `Up to ${pkg.maxProperties} properties`}
            </Text>

            <View style={s.features}>
              {pkg.features.map((f, i) => (
                <View key={i} style={s.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={c.accent} />
                  <Text style={[s.featureText, { color: c.text }]}>{f}</Text>
                </View>
              ))}
            </View>

            {isCurrent ? (
              <View style={[s.currentBtn, { borderColor: c.primary }]}>
                <Ionicons name="checkmark" size={16} color={c.primary} />
                <Text style={[s.currentBtnText, { color: c.primary }]}>Current Plan</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.subscribeBtn, { backgroundColor: c.primary }]}
                onPress={() => handleSubscribe(pkg.id)}
                disabled={subscribing === pkg.id}
                activeOpacity={0.85}
              >
                {subscribing === pkg.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="arrow-up-circle" size={16} color="#fff" />
                    <Text style={s.subscribeBtnText}>{sub?.package ? 'Upgrade' : 'Subscribe'}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )
      })}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.md, paddingBottom: 40 },
  currentPlan: { borderRadius: 12, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  currentPlanRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  crownBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  currentPlanName: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  currentPlanMeta: { fontSize: 12, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  progressBar: { marginTop: 12 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  card: { borderRadius: 14, borderWidth: 1.5, padding: spacing.lg, marginBottom: spacing.md, position: 'relative', overflow: 'hidden' },
  popularBadge: { position: 'absolute', top: 12, right: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  popularText: { color: '#fff', fontSize: 10, fontFamily: 'Manrope_700Bold' },
  pkgName: { fontSize: 18, fontFamily: 'Manrope_800ExtraBold', marginBottom: 4 },
  pkgPrice: { fontSize: 28, fontFamily: 'Manrope_800ExtraBold' },
  pkgPeriod: { fontSize: 14, fontFamily: 'Manrope_400Regular' },
  pkgLimit: { fontSize: 13, fontFamily: 'Manrope_500Medium', marginTop: 4, marginBottom: spacing.md },
  features: { gap: 8, marginBottom: spacing.lg },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: 13, fontFamily: 'Manrope_500Medium', flex: 1 },
  currentBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 2, borderRadius: 12, paddingVertical: 14 },
  currentBtnText: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  subscribeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 14 },
  subscribeBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_700Bold' },
})
