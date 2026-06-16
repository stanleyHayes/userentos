import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useThemeColors, spacing } from '../lib/theme'
import { formatCurrency, formatDate } from '../lib/format'
import { api } from '../lib/api'

type AllocationType = 'rent' | 'savings' | 'loan_repayment' | 'wallet_topup'
type AmountType = 'fixed' | 'percentage'
type MandateStatus = 'pending' | 'active' | 'paused' | 'revoked' | 'expired'

interface Mandate {
  id: string
  allocationType: AllocationType
  targetEntityId?: string
  targetLabel?: string
  amountType: AmountType
  amount: number
  startDate: string
  signedAt: string
  noticePeriodDays: number
  status: MandateStatus
}

const STATUS_COLORS: Record<MandateStatus, string> = {
  pending: '#f59e0b',
  active: '#10b981',
  paused: '#6b7280',
  revoked: '#ef4444',
  expired: '#6b7280',
}

const ALLOCATION_LABELS: Record<AllocationType, string> = {
  rent: 'Rent — pay landlord directly',
  savings: 'Savings — auto-grow your RentGuard',
  loan_repayment: 'Loan repayment',
  wallet_topup: 'Wallet topup',
}

export default function FinancingMandatesScreen() {
  const c = useThemeColors()
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['mandates', 'mine'],
    queryFn: () => api.get<{ items: Mandate[] }>('/employers/mandates/mine'),
  })

  const mandates = data?.items ?? []

  const [open, setOpen] = useState(false)
  const [allocationType, setAllocationType] = useState<AllocationType>('rent')
  const [targetEntityId, setTargetEntityId] = useState('')
  const [amountType, setAmountType] = useState<AmountType>('fixed')
  const [amount, setAmount] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [signature, setSignature] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  function reset() {
    setOpen(false)
    setAllocationType('rent')
    setTargetEntityId('')
    setAmountType('fixed')
    setAmount('')
    setStartDate(today)
    setSignature('')
  }

  async function submit() {
    const amountNum = Number(amount)
    if (!amountNum || amountNum <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount')
      return
    }
    if (signature.trim().length < 3) {
      Alert.alert('Invalid signature', 'Type your full name to sign')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/employers/mandates', {
        allocationType,
        targetEntityId: targetEntityId.trim() || undefined,
        amountType,
        amount: amountNum,
        startDate,
        noticePeriodDays: 7,
        signature: signature.trim(),
      })
      qc.invalidateQueries({ queryKey: ['mandates'] })
      Alert.alert('Mandate signed', 'Pending employer approval')
      reset()
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to create mandate')
    } finally {
      setSubmitting(false)
    }
  }

  async function revoke(id: string) {
    Alert.alert('Revoke mandate?', 'This will take effect on the next payroll cycle after the notice period.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          setRevokingId(id)
          try {
            await api.post(`/employers/mandates/${id}/revoke`, { reason: 'Revoked by employee' })
            qc.invalidateQueries({ queryKey: ['mandates'] })
          } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to revoke')
    } finally {
            setRevokingId(null)
          }
        },
      },
    ])
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
        <View style={[s.banner, { backgroundColor: c.accent + '08', borderColor: c.accent + '25' }]}>
          <Ionicons name="shield-checkmark" size={18} color={c.accent} />
          <Text style={[s.bannerText, { color: c.text }]}>
            Under Labour Act 2003 (Act 651), s. 70, deductions from your wages require your written consent.
            You can revoke any mandate at any time.
          </Text>
        </View>

        <TouchableOpacity
          style={[s.newBtn, { backgroundColor: c.primary }]}
          onPress={() => setOpen(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={s.newBtnText}>New Mandate</Text>
        </TouchableOpacity>

        {mandates.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="document-text-outline" size={48} color={c.muted} />
            <Text style={[s.emptyText, { color: c.muted }]}>No mandates yet</Text>
            <Text style={[s.emptySub, { color: c.muted }]}>
              Create one to enable salary-linked payments.
            </Text>
          </View>
        ) : (
          mandates.map((m) => (
            <View key={m.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={s.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, { color: c.text }]}>
                    {m.allocationType.replace(/_/g, ' ')}
                  </Text>
                  {m.targetLabel ? (
                    <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>{m.targetLabel}</Text>
                  ) : null}
                </View>
                <View style={[s.statusBadge, { backgroundColor: STATUS_COLORS[m.status] + '20' }]}>
                  <Text style={[s.statusText, { color: STATUS_COLORS[m.status] }]}>{m.status}</Text>
                </View>
              </View>

              <View style={s.statGrid}>
                <Stat label="Amount" value={m.amountType === 'fixed' ? formatCurrency(m.amount) : `${m.amount}%`} c={c} />
                <Stat label="Start date" value={formatDate(m.startDate).split(',')[0]} c={c} />
                <Stat label="Signed" value={formatDate(m.signedAt).split(',')[0]} c={c} />
                <Stat label="Notice" value={`${m.noticePeriodDays} days`} c={c} />
              </View>

              {m.status === 'active' && (
                <TouchableOpacity
                  style={[s.revokeBtn, { borderColor: c.danger }]}
                  onPress={() => revoke(m.id)}
                  disabled={revokingId === m.id}
                  activeOpacity={0.85}
                >
                  {revokingId === m.id ? (
                    <ActivityIndicator color={c.danger} size="small" />
                  ) : (
                    <>
                      <Ionicons name="shield-outline" size={14} color={c.danger} />
                      <Text style={[s.revokeText, { color: c.danger }]}>Revoke</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {m.status === 'pending' && (
                <Text style={[s.pendingText, { color: c.warning }]}>
                  <Ionicons name="alert-circle" size={12} color={c.warning} /> Awaiting employer approval
                </Text>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={open} animationType="slide" transparent onRequestClose={reset}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>Sign Mandate</Text>
              <TouchableOpacity onPress={reset} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.label, { color: c.text }]}>Allocation type</Text>
              <View style={s.optionGroup}>
                {(['rent', 'savings', 'loan_repayment', 'wallet_topup'] as AllocationType[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      s.optionBtn,
                      { borderColor: c.border, backgroundColor: c.surface },
                      allocationType === t && { borderColor: c.primary, backgroundColor: c.primary + '10' },
                    ]}
                    onPress={() => { setAllocationType(t); setTargetEntityId('') }}
                  >
                    <Text style={[
                      s.optionText,
                      { color: c.text },
                      allocationType === t && { color: c.primary, fontFamily: 'Manrope_700Bold' },
                    ]}>
                      {ALLOCATION_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {allocationType !== 'wallet_topup' && (
                <>
                  <Text style={[s.label, { color: c.text }]}>Target entity ID (optional)</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                    value={targetEntityId}
                    onChangeText={setTargetEntityId}
                    placeholder="agreement / savings / contract id"
                    placeholderTextColor={c.muted}
                  />
                </>
              )}

              <Text style={[s.label, { color: c.text }]}>Amount type</Text>
              <View style={s.amountTypeRow}>
                {(['fixed', 'percentage'] as AmountType[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      s.amountTypeBtn,
                      { borderColor: c.border, backgroundColor: c.surface },
                      amountType === t && { borderColor: c.primary, backgroundColor: c.primary + '10' },
                    ]}
                    onPress={() => setAmountType(t)}
                  >
                    <Text style={[
                      s.optionText,
                      { color: c.text },
                      amountType === t && { color: c.primary, fontFamily: 'Manrope_700Bold' },
                    ]}>
                      {t === 'fixed' ? 'Fixed (GHS)' : 'Percentage (%)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.label, { color: c.text }]}>
                {amountType === 'fixed' ? 'Amount (GHS)' : 'Percentage (%)'}
              </Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={c.muted}
              />

              <Text style={[s.label, { color: c.text }]}>Start date (YYYY-MM-DD)</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={c.muted}
              />

              <Text style={[s.label, { color: c.text }]}>Type your full name to sign</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                value={signature}
                onChangeText={setSignature}
                placeholder="Full name"
                placeholderTextColor={c.muted}
              />

              <Text style={[s.disclaimer, { color: c.muted }]}>
                By signing you authorize your employer to deduct this amount each pay period and disburse it
                to the selected target. You may revoke this mandate at any time.
              </Text>

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.primary }, submitting && { opacity: 0.6 }]}
                onPress={submit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Sign Mandate</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function Stat({ label, value, c }: { label: string; value: string; c: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statLabel, { color: c.muted }]}>{label}</Text>
      <Text style={[s.statValue, { color: c.text }]}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  banner: {
    flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: 12,
    borderWidth: 1, marginBottom: spacing.md, alignItems: 'flex-start',
  },
  bannerText: { flex: 1, fontSize: 12, fontFamily: 'Manrope_400Regular', lineHeight: 17 },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, marginBottom: spacing.md,
  },
  newBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  emptySub: { fontSize: 12, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },
  card: { borderRadius: 14, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  cardTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },
  cardSub: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  stat: { width: '47%', gap: 2 },
  statLabel: { fontSize: 9, fontFamily: 'Manrope_500Medium', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  revokeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, paddingVertical: 9, borderRadius: 8, marginTop: spacing.xs,
  },
  revokeText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  pendingText: { fontSize: 11, fontFamily: 'Manrope_500Medium', marginTop: spacing.xs },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.sm, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, fontFamily: 'Manrope_500Medium' },
  optionGroup: { gap: 6 },
  optionBtn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, paddingHorizontal: spacing.md },
  optionText: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
  amountTypeRow: { flexDirection: 'row', gap: spacing.sm },
  amountTypeBtn: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  disclaimer: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: spacing.md, lineHeight: 16 },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12, marginTop: spacing.lg, marginBottom: spacing.md,
  },
  submitText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
})
