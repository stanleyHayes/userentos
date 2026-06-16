import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TextInput, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { DetailSkeleton } from '../components/Skeleton'

interface CreditScoreData {
  score: number
  factors: {
    paymentHistory: number
    savingsConsistency: number
    agreementCompliance: number
    disputeRecord: number
    accountAge: number
  }
  calculatedAt: string
}

const factorConfig = [
  { key: 'paymentHistory', label: 'Payment History', max: 40, icon: 'trending-up' as const, desc: 'Based on your on-time rent payments' },
  { key: 'savingsConsistency', label: 'Savings Consistency', max: 20, icon: 'wallet' as const, desc: 'Based on your RentGuard savings activity' },
  { key: 'agreementCompliance', label: 'Agreement Compliance', max: 20, icon: 'document-text' as const, desc: 'Based on contract adherence and no violations' },
  { key: 'disputeRecord', label: 'Dispute Record', max: 10, icon: 'shield-checkmark' as const, desc: 'Fewer disputes filed against you is better' },
  { key: 'accountAge', label: 'Account Age', max: 10, icon: 'time' as const, desc: 'Longer account history builds trust' },
]

const tips = [
  'Pay your rent on time every month',
  'Keep your RentGuard savings plans active and on track',
  'Ensure your rental agreements have no compliance violations',
  'Resolve any open disputes promptly',
  'Keep your account active over time',
]

function getScoreInfo(score: number) {
  if (score >= 80) return { label: 'Excellent', colorKey: 'accent' as const }
  if (score >= 60) return { label: 'Good', colorKey: 'primary' as const }
  if (score >= 40) return { label: 'Fair', colorKey: 'secondary' as const }
  return { label: 'Needs Work', colorKey: 'danger' as const }
}

export default function CreditScoreScreen() {
  const c = useThemeColors()
  const { user } = useAuthStore()
  const canLookup = user?.activeRole === 'landlord' || user?.activeRole === 'admin' || user?.activeRole === 'government'
  const [data, setData] = useState<CreditScoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lookupId, setLookupId] = useState('')
  const [lookupData, setLookupData] = useState<CreditScoreData | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')

  async function load() {
    try {
      const res = await api.get<CreditScoreData>('/credit/me')
      setData(res)
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: c.background }]}>
        <DetailSkeleton />
      </View>
    )
  }

  if (!data) {
    return (
      <View style={[s.centered, { backgroundColor: c.background }]}>
        <Ionicons name="analytics-outline" size={48} color={c.muted} />
        <Text style={[s.emptyTitle, { color: c.text }]}>No credit data available</Text>
        <Text style={[s.emptyDesc, { color: c.muted }]}>Your credit score will appear here once you have rental activity.</Text>
      </View>
    )
  }

  const info = getScoreInfo(data.score)
  const scoreColor = c[info.colorKey]
  const pct = data.score / 100

  return (
    <ScrollView
      style={[s.container, { backgroundColor: c.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
    >
      {/* Score Display */}
      <View style={[s.scoreCard, { backgroundColor: c.card }]}>
        <View style={s.scoreRow}>
          {/* Circle */}
          <View style={s.circleWrap}>
            <View style={[s.circleBg, { borderColor: c.border }]}>
              <View style={[s.circleProgress, { borderColor: scoreColor, borderTopColor: 'transparent', transform: [{ rotate: `${pct * 360}deg` }] }]} />
            </View>
            <View style={s.circleInner}>
              <Text style={[s.scoreValue, { color: scoreColor }]}>{data.score}</Text>
              <Text style={[s.scoreOutOf, { color: c.muted }]}>out of 100</Text>
            </View>
          </View>

          {/* Info */}
          <View style={s.scoreInfo}>
            <View style={[s.labelBadge, { backgroundColor: scoreColor + '20' }]}>
              <Text style={[s.labelText, { color: scoreColor }]}>{info.label}</Text>
            </View>
            <Text style={[s.scoreDesc, { color: c.muted }]}>
              Your rent credit score is calculated based on payment history, savings activity, compliance, and more.
            </Text>
            <Text style={[s.lastUpdated, { color: c.muted }]}>
              Last updated: {new Date(data.calculatedAt).toLocaleDateString('en-GH')}
            </Text>
          </View>
        </View>
      </View>

      {/* Factor Breakdown */}
      <View style={[s.sectionCard, { backgroundColor: c.card }]}>
        <Text style={[s.sectionTitle, { color: c.text }]}>Score Breakdown</Text>
        {factorConfig.map((factor) => {
          const value = data.factors[factor.key as keyof typeof data.factors]
          const factorPct = Math.round((value / factor.max) * 100)
          const barColor = factorPct >= 75 ? c.accent : factorPct >= 50 ? c.primary : factorPct >= 25 ? c.secondary : c.danger

          return (
            <View key={factor.key} style={s.factorItem}>
              <View style={s.factorHeader}>
                <View style={s.factorLeft}>
                  <Ionicons name={factor.icon} size={16} color={c.primary} />
                  <Text style={[s.factorName, { color: c.text }]}>{factor.label}</Text>
                </View>
                <Text style={[s.factorScore, { color: c.text }]}>{value}/{factor.max}</Text>
              </View>
              <View style={[s.barBg, { backgroundColor: c.surface }]}>
                <View style={[s.barFill, { width: `${factorPct}%`, backgroundColor: barColor }]} />
              </View>
              <Text style={[s.factorDesc, { color: c.muted }]}>{factor.desc}</Text>
            </View>
          )
        })}
      </View>

      {/* How to Improve */}
      <View style={[s.sectionCard, { backgroundColor: c.card }]}>
        <Text style={[s.sectionTitle, { color: c.text }]}>How to Improve Your Score</Text>
        {tips.map((tip, i) => (
          <View key={i} style={s.tipRow}>
            <View style={[s.tipNumber, { backgroundColor: c.accent + '15' }]}>
              <Text style={[s.tipNumberText, { color: c.accent }]}>{i + 1}</Text>
            </View>
            <Text style={[s.tipText, { color: c.muted }]}>{tip}</Text>
          </View>
        ))}
      </View>

      {/* Tenant Lookup — landlord/admin only */}
      {canLookup && (
        <View style={[s.sectionCard, { backgroundColor: c.card }]}>
          <Text style={[s.sectionTitle, { color: c.text }]}>Lookup Tenant Score</Text>
          <View style={s.lookupRow}>
            <TextInput
              style={[s.lookupInput, { borderColor: c.border, color: c.text, backgroundColor: c.surface }]}
              placeholder="Enter tenant user ID"
              placeholderTextColor={c.muted}
              value={lookupId}
              onChangeText={setLookupId}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[s.lookupBtn, { backgroundColor: c.primary, opacity: lookupId.trim() && !lookupLoading ? 1 : 0.5 }]}
              onPress={async () => {
                if (!lookupId.trim()) return
                setLookupLoading(true); setLookupError(''); setLookupData(null)
                try {
                  const res = await api.get<CreditScoreData>(`/credit/${lookupId.trim()}`)
                  setLookupData(res)
                } catch { setLookupError('Could not fetch score. User may not exist or access denied.') }
                finally { setLookupLoading(false) }
              }}
              disabled={!lookupId.trim() || lookupLoading}
            >
              {lookupLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
          {lookupError ? <Text style={{ color: c.danger, fontSize: 12, fontFamily: 'Manrope_500Medium', marginTop: 8 }}>{lookupError}</Text> : null}
          {lookupData && (
            <View style={s.lookupResult}>
              <View style={s.lookupScoreRow}>
                <Text style={[s.lookupScore, { color: getScoreInfo(lookupData.score).colorKey === 'accent' ? c.accent : getScoreInfo(lookupData.score).colorKey === 'primary' ? c.primary : getScoreInfo(lookupData.score).colorKey === 'secondary' ? c.secondary : c.danger }]}>{lookupData.score}</Text>
                <View style={[s.labelBadge, { backgroundColor: (getScoreInfo(lookupData.score).colorKey === 'accent' ? c.accent : c.primary) + '20' }]}>
                  <Text style={[s.labelText, { color: getScoreInfo(lookupData.score).colorKey === 'accent' ? c.accent : c.primary }]}>{getScoreInfo(lookupData.score).label}</Text>
                </View>
              </View>
              {factorConfig.map((f) => {
                const v = lookupData.factors[f.key as keyof typeof lookupData.factors]
                const p = Math.round((v / f.max) * 100)
                return (
                  <View key={f.key} style={s.lookupFactor}>
                    <Text style={[s.lookupFactorLabel, { color: c.muted }]}>{f.label}</Text>
                    <View style={[s.barBg, { backgroundColor: c.surface, flex: 1 }]}>
                      <View style={[s.barFill, { width: `${p}%`, backgroundColor: p >= 75 ? c.accent : p >= 50 ? c.primary : p >= 25 ? c.secondary : c.danger }]} />
                    </View>
                    <Text style={[s.lookupFactorValue, { color: c.text }]}>{v}/{f.max}</Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      )}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  emptyDesc: { fontSize: 13, textAlign: 'center', fontFamily: 'Manrope_400Regular' },

  // Score card
  scoreCard: { margin: spacing.md, borderRadius: 16, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  circleWrap: { width: 100, height: 100, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  circleBg: { position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 8 },
  circleProgress: { position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 8 },
  circleInner: { alignItems: 'center' },
  scoreValue: { fontSize: 32, fontFamily: 'Manrope_800ExtraBold' },
  scoreOutOf: { fontSize: 10, fontFamily: 'Manrope_400Regular', marginTop: -2 },
  scoreInfo: { flex: 1, gap: 8 },
  labelBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  labelText: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  scoreDesc: { fontSize: 12, fontFamily: 'Manrope_400Regular', lineHeight: 18 },
  lastUpdated: { fontSize: 10, fontFamily: 'Manrope_400Regular' },

  // Sections
  sectionCard: { marginHorizontal: spacing.md, marginTop: spacing.sm, borderRadius: 16, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  sectionTitle: { fontSize: 15, fontFamily: 'Manrope_700Bold', marginBottom: spacing.md },

  // Factors
  factorItem: { marginBottom: spacing.md },
  factorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  factorLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factorName: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  factorScore: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  barBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  factorDesc: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 4 },

  // Tips
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  tipNumber: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  tipNumberText: { fontSize: 12, fontFamily: 'Manrope_700Bold' },
  tipText: { flex: 1, fontSize: 13, fontFamily: 'Manrope_400Regular', lineHeight: 19 },

  // Lookup
  lookupRow: { flexDirection: 'row', gap: spacing.sm },
  lookupInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, fontFamily: 'Manrope_400Regular' },
  lookupBtn: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  lookupResult: { marginTop: spacing.md, gap: spacing.sm },
  lookupScoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lookupScore: { fontSize: 28, fontFamily: 'Manrope_800ExtraBold' },
  lookupFactor: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lookupFactorLabel: { width: 90, fontSize: 10, fontFamily: 'Manrope_400Regular' },
  lookupFactorValue: { width: 32, fontSize: 11, fontFamily: 'Manrope_700Bold', textAlign: 'right' },
})
