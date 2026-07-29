import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../lib/api'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
import { formatCompact } from '../lib/format'

interface Passport {
  user: { firstName: string; lastName: string; isVerified: boolean }
  creditScore?: { score?: number }
  rentalHistory?: unknown[]
  paymentSummary?: { totalPaid?: number; onTimeRate?: number }
}

export default function TenantPassportScreen() {
  const c = useThemeColors()
  const [passport, setPassport] = useState<Passport | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadPassport = useCallback(async (showError = false) => {
    try {
      setPassport(await api.get<Passport>('/tenant-passport/me/json'))
    } catch (error) {
      if (showError) Alert.alert('Passport unavailable', (error as Error).message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadPassport() }, [loadPassport])

  function refresh() {
    setRefreshing(true)
    loadPassport(true)
  }

  async function sharePassport() {
    try {
      const result = await api.post<{ url: string }>('/tenant-passport/share', {})
      await Share.share({ message: `View my verified RentOS Tenant Passport: ${result.url}` })
    } catch (error) { Alert.alert('Could not share', (error as Error).message) }
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={s.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.primary} />}
    >
      <View style={[s.hero, { backgroundColor: c.primaryDark }]}>
        <View style={s.heroMark}>
          <Ionicons name="finger-print-outline" size={26} color="#fbbf24" />
        </View>
        <Text style={s.eyebrow}>RENTAL IDENTITY</Text>
        <Text style={s.title}>Your record, ready to move.</Text>
        <Text style={s.sub}>Share a verified summary without exposing your full account or private documents.</Text>
      </View>

      {loading ? (
        <View style={[s.stateCard, neuCard(c)]}>
          <ActivityIndicator color={c.primary} />
          <Text style={[s.stateText, { color: c.muted }]}>Preparing your passport…</Text>
        </View>
      ) : !passport ? (
        <View style={[s.stateCard, neuCard(c)]}>
          <View style={[s.stateIcon, { backgroundColor: c.primary + '12' }]}>
            <Ionicons name="document-text-outline" size={24} color={c.primary} />
          </View>
          <Text style={[s.stateTitle, { color: c.text }]}>Passport unavailable</Text>
          <Text style={[s.stateText, { color: c.muted }]}>Pull down to retry, or complete your tenant profile first.</Text>
        </View>
      ) : (
        <>
          <View style={[s.passport, neuCard(c)]}>
            <View style={s.identityRow}>
              <View style={[s.monogram, { backgroundColor: c.primary }]}>
                <Text style={s.monogramText}>
                  {passport.user.firstName.slice(0, 1)}{passport.user.lastName.slice(0, 1)}
                </Text>
              </View>
              <View style={s.identityCopy}>
                <Text style={[s.name, { color: c.text }]} numberOfLines={2}>
                  {passport.user.firstName} {passport.user.lastName}
                </Text>
                <View style={s.statusRow}>
                  <View style={[s.statusDot, { backgroundColor: passport.user.isVerified ? c.accent : c.warning }]} />
                  <Text style={[s.statusText, { color: passport.user.isVerified ? c.accent : c.warning }]}>
                    {passport.user.isVerified ? 'Identity verified' : 'Verification pending'}
                  </Text>
                </View>
              </View>
              <Ionicons name="shield-checkmark-outline" size={28} color={passport.user.isVerified ? c.accent : c.muted} />
            </View>

            <View style={[s.divider, { backgroundColor: c.border }]} />

            <View style={s.metrics}>
              <Metric label="Credit score" value={String(passport.creditScore?.score ?? '—')} color={c.text} muted={c.muted} />
              <Metric label="Rental records" value={String(passport.rentalHistory?.length ?? 0)} color={c.text} muted={c.muted} />
              <Metric label="On-time" value={`${passport.paymentSummary?.onTimeRate ?? 0}%`} color={c.text} muted={c.muted} />
            </View>

            <View style={[s.paymentWell, neuInset(c)]}>
              <View style={[s.paymentIcon, { backgroundColor: c.accent + '15' }]}>
                <Ionicons name="checkmark-done-outline" size={18} color={c.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.paymentLabel, { color: c.muted }]}>Recorded rent payments</Text>
                <Text style={[s.paymentValue, { color: c.text }]}>
                  {formatCompact(passport.paymentSummary?.totalPaid ?? 0)}
                </Text>
              </View>
              <Text style={[s.privateLabel, { color: c.muted }]}>PRIVATE</Text>
            </View>
          </View>

          <View style={[s.trustNote, { backgroundColor: c.accent + '0D', borderColor: c.accent + '25' }]}>
            <Ionicons name="lock-closed-outline" size={17} color={c.accent} />
            <Text style={[s.trustText, { color: c.text }]}>
              Each link is permissioned. You stay in control of what a landlord can review.
            </Text>
          </View>

          <TouchableOpacity onPress={sharePassport} style={[s.button, { backgroundColor: c.primary }]} activeOpacity={0.82}>
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={s.buttonText}>Create secure share link</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  )
}

function Metric({ label, value, color, muted }: { label: string; value: string; color: string; muted: string }) {
  return <View style={s.metric}><Text style={[s.metricValue, { color }]}>{value}</Text><Text style={[s.metricLabel, { color: muted }]}>{label}</Text></View>
}
const s = StyleSheet.create({
  page: { flexGrow: 1, padding: spacing.md, paddingBottom: 44, gap: spacing.md },
  hero: { borderRadius: 18, padding: spacing.lg, paddingBottom: 28, overflow: 'hidden' },
  heroMark: { width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.09)', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  eyebrow: { color: '#fbbf24', fontSize: 10, letterSpacing: 1.7, fontFamily: 'Outfit_700Bold', marginBottom: 6 },
  title: { color: '#fff', fontSize: 28, lineHeight: 32, letterSpacing: -0.7, fontFamily: 'Outfit_800ExtraBold', maxWidth: 290 },
  sub: { color: 'rgba(255,255,255,0.68)', fontSize: 13, lineHeight: 19, fontFamily: 'Outfit_400Regular', marginTop: 10, maxWidth: 310 },
  stateCard: { minHeight: 210, padding: spacing.xl, justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  stateIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  stateTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold' },
  stateText: { fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Outfit_400Regular', maxWidth: 260 },
  passport: { padding: spacing.lg, borderRadius: 16, gap: spacing.lg },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  monogram: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  monogramText: { color: '#fff', fontSize: 17, letterSpacing: 0.5, fontFamily: 'Outfit_800ExtraBold' },
  identityCopy: { flex: 1 },
  name: { fontSize: 18, lineHeight: 22, letterSpacing: -0.25, fontFamily: 'Outfit_700Bold' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontFamily: 'Outfit_600SemiBold' },
  divider: { height: 1 },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, gap: 3 },
  metricValue: { fontSize: 20, letterSpacing: -0.4, fontFamily: 'Outfit_800ExtraBold' },
  metricLabel: { fontSize: 9, letterSpacing: 0.35, textTransform: 'uppercase', fontFamily: 'Outfit_600SemiBold' },
  paymentWell: { padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  paymentIcon: { width: 34, height: 34, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  paymentLabel: { fontSize: 10, fontFamily: 'Outfit_500Medium' },
  paymentValue: { fontSize: 15, fontFamily: 'Outfit_700Bold', marginTop: 1 },
  privateLabel: { fontSize: 8, letterSpacing: 1, fontFamily: 'Outfit_700Bold' },
  trustNote: { borderWidth: 1, borderRadius: 12, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  trustText: { flex: 1, fontSize: 11, lineHeight: 17, fontFamily: 'Outfit_500Medium' },
  button: { borderRadius: 12, minHeight: 52, paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  buttonText: { color: '#fff', fontFamily: 'Outfit_700Bold', fontSize: 13 },
})
