import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, Modal, TextInput, type ViewStyle } from 'react-native'
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

  // Payment modal for paid packages
  const [payPkg, setPayPkg] = useState<Package | null>(null)
  const [payMethod, setPayMethod] = useState('mtn_momo')
  const [payPhone, setPayPhone] = useState('')
  const [paying, setPaying] = useState(false)

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

  async function handleSubscribe(pkg: Package) {
    if (pkg.price > 0) {
      // Paid plan — collect mobile-money details first
      setPayPkg(pkg)
      return
    }
    setSubscribing(pkg.id)
    try {
      await api.post('/subscriptions/subscribe', { packageId: pkg.id })
      Alert.alert('Success', 'Subscription activated!')
      load()
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to subscribe')
    } finally { setSubscribing(null) }
  }

  async function handlePayAndSubscribe() {
    if (!payPkg) return
    if (payMethod !== 'bank_transfer' && payPhone.trim().length < 9) {
      Alert.alert('Error', 'Please enter the mobile money number to charge'); return
    }
    setPaying(true)
    try {
      const res = await api.post<{ instructions?: string }>('/subscriptions/subscribe', {
        packageId: payPkg.id,
        method: payMethod,
        phone: payPhone.trim(),
      })
      setPayPkg(null)
      setPayPhone('')
      Alert.alert(
        'Payment initiated',
        res.instructions ?? 'Approve the payment on your phone — your plan activates once it is confirmed.',
      )
      setTimeout(() => void load(), 3500)
      setTimeout(() => void load(), 8000)
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to subscribe')
    } finally { setPaying(false) }
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
                <View style={[s.progressFill, { backgroundColor: c.primary, width: `${Math.min(100, (sub.propertyCount / sub.maxProperties) * 100)}%` as unknown as ViewStyle['width'] }]} />
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
                onPress={() => handleSubscribe(pkg)}
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

      {/* Payment modal for paid plans */}
      <Modal visible={!!payPkg} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>Pay for {payPkg?.name}</Text>
              <TouchableOpacity onPress={() => setPayPkg(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>

            <Text style={[s.fieldLabel, { color: c.text }]}>Payment Method</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
              {[
                { value: 'mtn_momo', label: 'MTN MoMo' },
                { value: 'telecel_cash', label: 'Telecel Cash' },
                { value: 'airteltigo_money', label: 'AirtelTigo' },
                { value: 'bank_transfer', label: 'Bank Transfer' },
              ].map((m) => (
                <TouchableOpacity
                  key={m.value}
                  style={[s.methodBtn, { backgroundColor: c.surface, borderColor: payMethod === m.value ? c.primary : c.border }]}
                  onPress={() => setPayMethod(m.value)}
                >
                  <Text style={{ fontSize: 12, color: payMethod === m.value ? c.primary : c.text, fontFamily: 'Manrope_600SemiBold' }}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {payMethod !== 'bank_transfer' && (
              <>
                <Text style={[s.fieldLabel, { color: c.text }]}>Mobile Money Number</Text>
                <TextInput
                  style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                  placeholder="0241234567"
                  placeholderTextColor={c.muted}
                  keyboardType="phone-pad"
                  value={payPhone}
                  onChangeText={setPayPhone}
                />
              </>
            )}

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: c.primary }, paying && s.submitBtnDisabled]}
              onPress={handlePayAndSubscribe}
              disabled={paying}
              activeOpacity={0.85}
            >
              {paying ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={s.submitBtnText}>Pay {payPkg ? formatCurrency(payPkg.price) : ''} & Subscribe</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginBottom: 6 },
  methodBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: spacing.md },
  submitBtn: { marginTop: spacing.md, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_700Bold' },
})
