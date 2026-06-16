import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useThemeColors, spacing } from '../lib/theme'
import { formatCurrency, formatCompact } from '../lib/format'
import { api } from '../lib/api'

interface FinancingOffer {
  id: string
  name: string
  description: string
  productType: string
  annualInterestRate: number
  processingFeePct: number
  minAmount: number
  maxAmount: number
  minTenureMonths: number
  maxTenureMonths: number
  minCreditScore: number
  requiresEmployment: boolean
  requiresPayrollDeduction: boolean
  active: boolean
}

interface OffersResponse { items: FinancingOffer[] }

export default function FinancingScreen() {
  const c = useThemeColors()
  const qc = useQueryClient()

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['financing-offers'],
    queryFn: () => api.get<OffersResponse>('/financing/offers'),
  })

  const offers = data?.items?.filter((o) => o.active) ?? []

  const [selected, setSelected] = useState<FinancingOffer | null>(null)
  const [amount, setAmount] = useState('')
  const [tenure, setTenure] = useState('')
  const [purpose, setPurpose] = useState('')
  const [usePayroll, setUsePayroll] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function openApply(offer: FinancingOffer) {
    setSelected(offer)
    setAmount(String(offer.minAmount))
    setTenure(String(offer.minTenureMonths))
    setPurpose('')
    setUsePayroll(offer.requiresPayrollDeduction)
  }

  function close() {
    setSelected(null)
    setAmount('')
    setTenure('')
    setPurpose('')
    setUsePayroll(false)
  }

  async function submit() {
    if (!selected) return
    const amountNum = Number(amount)
    const tenureNum = Number(tenure)
    if (!amountNum || amountNum < selected.minAmount || amountNum > selected.maxAmount) {
      Alert.alert('Invalid amount', `Must be between ${formatCurrency(selected.minAmount)} and ${formatCurrency(selected.maxAmount)}`)
      return
    }
    if (!tenureNum || tenureNum < selected.minTenureMonths || tenureNum > selected.maxTenureMonths) {
      Alert.alert('Invalid tenure', `Must be between ${selected.minTenureMonths} and ${selected.maxTenureMonths} months`)
      return
    }
    if (purpose.trim().length < 5) {
      Alert.alert('Invalid purpose', 'Please describe what you will use this for (min 5 chars)')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/financing/applications', {
        offerId: selected.id,
        amountRequested: amountNum,
        tenureMonths: tenureNum,
        purpose: purpose.trim(),
        willUsePayrollDeduction: usePayroll,
      })
      qc.invalidateQueries({ queryKey: ['financing-applications'] })
      Alert.alert('Submitted', 'Your application has been submitted')
      close()
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to submit application')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <View style={[s.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={c.primary} />}
      >
        <View style={[s.banner, { backgroundColor: c.primary + '08', borderColor: c.primary + '20' }]}>
          <Ionicons name="information-circle" size={18} color={c.primary} />
          <Text style={[s.bannerText, { color: c.text }]}>
            Get rent advance, deposit loans, and rent-to-own — repay monthly.
          </Text>
        </View>

        {offers.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="cash-outline" size={48} color={c.muted} />
            <Text style={[s.emptyText, { color: c.muted }]}>No active offers</Text>
            <Text style={[s.emptySub, { color: c.muted }]}>Check back later for new financing options.</Text>
          </View>
        ) : (
          offers.map((o) => (
            <View key={o.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={s.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>{o.name}</Text>
                  <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>
                    {o.productType.replace(/_/g, ' ')}
                  </Text>
                </View>
                <View style={[s.aprBadge, { backgroundColor: c.accent + '20' }]}>
                  <Text style={[s.aprText, { color: c.accent }]}>{o.annualInterestRate}% APR</Text>
                </View>
              </View>

              <Text style={[s.desc, { color: c.muted }]} numberOfLines={3}>{o.description}</Text>

              <View style={s.rows}>
                <Row label="Amount" value={`${formatCompact(o.minAmount)} – ${formatCompact(o.maxAmount)}`} c={c} />
                <Row label="Tenure" value={`${o.minTenureMonths}–${o.maxTenureMonths} mo`} c={c} />
                <Row label="Processing fee" value={`${o.processingFeePct}%`} c={c} />
                <Row label="Min credit" value={String(o.minCreditScore)} c={c} />
              </View>

              <View style={s.tagRow}>
                {o.requiresEmployment && (
                  <View style={[s.tag, { backgroundColor: c.surface }]}>
                    <Text style={[s.tagText, { color: c.muted }]}>Employment required</Text>
                  </View>
                )}
                {o.requiresPayrollDeduction && (
                  <View style={[s.tag, { backgroundColor: c.warning + '20' }]}>
                    <Ionicons name="sparkles" size={10} color={c.warning} />
                    <Text style={[s.tagText, { color: c.warning }]}>Payroll deduction</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[s.applyBtn, { backgroundColor: c.primary }]}
                onPress={() => openApply(o)}
                activeOpacity={0.85}
              >
                <Ionicons name="cash-outline" size={16} color="#fff" />
                <Text style={s.applyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={close}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]} numberOfLines={1}>
                Apply — {selected?.name}
              </Text>
              <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {selected && (
                <View style={[s.summaryBox, { backgroundColor: c.surface }]}>
                  <Text style={[s.summaryRow, { color: c.muted }]}>
                    Allowed amount: <Text style={[s.summaryBold, { color: c.text }]}>
                      {formatCurrency(selected.minAmount)} – {formatCurrency(selected.maxAmount)}
                    </Text>
                  </Text>
                  <Text style={[s.summaryRow, { color: c.muted }]}>
                    Tenure: <Text style={[s.summaryBold, { color: c.text }]}>
                      {selected.minTenureMonths}–{selected.maxTenureMonths} months
                    </Text>
                  </Text>
                  <Text style={[s.summaryRow, { color: c.muted }]}>
                    APR: <Text style={[s.summaryBold, { color: c.text }]}>{selected.annualInterestRate}%</Text>
                    {' '}- Processing: <Text style={[s.summaryBold, { color: c.text }]}>{selected.processingFeePct}%</Text>
                  </Text>
                </View>
              )}

              <Text style={[s.label, { color: c.text }]}>Amount requested (GHS)</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={c.muted}
              />

              <Text style={[s.label, { color: c.text }]}>Tenure (months)</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                keyboardType="numeric"
                value={tenure}
                onChangeText={setTenure}
                placeholder="0"
                placeholderTextColor={c.muted}
              />

              <Text style={[s.label, { color: c.text }]}>Purpose</Text>
              <TextInput
                style={[s.input, s.textArea, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                multiline
                numberOfLines={3}
                value={purpose}
                onChangeText={setPurpose}
                placeholder="What will you use this for?"
                placeholderTextColor={c.muted}
              />

              <TouchableOpacity
                style={s.checkboxRow}
                onPress={() => setUsePayroll(!usePayroll)}
                activeOpacity={0.7}
              >
                <View style={[
                  s.checkbox,
                  { borderColor: c.border, backgroundColor: usePayroll ? c.primary : 'transparent' },
                ]}>
                  {usePayroll && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[s.checkboxLabel, { color: c.text }]}>Repay via payroll deduction</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.primary }, submitting && s.submitDisabled]}
                onPress={submit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={s.submitText}>Submit Application</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function Row({ label, value, c }: { label: string; value: string; c: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, { color: c.muted }]}>{label}</Text>
      <Text style={[s.rowValue, { color: c.text }]}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  banner: {
    flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: 12,
    borderWidth: 1, marginBottom: spacing.md, alignItems: 'flex-start',
  },
  bannerText: { flex: 1, fontSize: 12, fontFamily: 'Manrope_500Medium' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  emptySub: { fontSize: 12, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },
  card: {
    borderRadius: 14, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  cardTitle: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  cardSub: { fontSize: 11, fontFamily: 'Manrope_500Medium', marginTop: 2, textTransform: 'capitalize' },
  aprBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  aprText: { fontSize: 11, fontFamily: 'Manrope_700Bold' },
  desc: { fontSize: 12, fontFamily: 'Manrope_400Regular', marginBottom: spacing.sm, lineHeight: 18 },
  rows: { gap: 4, marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  rowValue: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 10, fontFamily: 'Manrope_600SemiBold' },
  applyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 10, marginTop: 4,
  },
  applyBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_600SemiBold' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 17, fontFamily: 'Manrope_700Bold', flex: 1, marginRight: spacing.md },
  summaryBox: { padding: spacing.sm, borderRadius: 10, marginBottom: spacing.md, gap: 4 },
  summaryRow: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  summaryBold: { fontFamily: 'Manrope_700Bold' },
  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.sm, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, fontFamily: 'Manrope_500Medium' },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  checkbox: { width: 22, height: 22, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checkboxLabel: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, marginTop: spacing.lg, marginBottom: spacing.md,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
})
