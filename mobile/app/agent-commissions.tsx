import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert,
} from 'react-native'
import { Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
import { formatCurrency, formatDate } from '../lib/format'
import { api } from '../lib/api'

interface Commission {
  id: string
  description: string
  amount: number
  status: 'pending' | 'paid'
  propertyId?: string
  leadId?: string
  agreementId?: string
  createdAt: string
  paidAt?: string
}

interface CommissionsResponse {
  items: Commission[]
  summary: { pending: number; paid: number; count: number }
}

const STATUS_COLORS: Record<Commission['status'], string> = {
  pending: '#f59e0b',
  paid: '#10b981',
}

export default function AgentCommissionsScreen() {
  const c = useThemeColors()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['agent-commissions'],
    queryFn: () => api.get<CommissionsResponse>('/agent/commissions'),
  })

  const items = data?.items ?? []
  const summary = data?.summary ?? { pending: 0, paid: 0, count: 0 }

  async function record() {
    const amt = Number(amount)
    if (description.trim().length < 2) {
      Alert.alert('Invalid description', 'Please enter a description (min 2 characters)')
      return
    }
    if (!amt || amt <= 0) {
      Alert.alert('Invalid amount', 'Please enter a positive amount')
      return
    }
    setSaving(true)
    try {
      await api.post('/agent/commissions', { description: description.trim(), amount: amt })
      qc.invalidateQueries({ queryKey: ['agent-commissions'] })
      Alert.alert('Recorded', 'Commission recorded successfully')
      setShowModal(false)
      setDescription('')
      setAmount('')
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to record commission')
    } finally {
      setSaving(false)
    }
  }

  function confirmMarkPaid(item: Commission) {
    Alert.alert(
      'Mark Paid',
      `Mark "${item.description}" (${formatCurrency(item.amount)}) as paid?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark Paid', onPress: () => markPaid(item.id) },
      ],
    )
  }

  async function markPaid(id: string) {
    setPayingId(id)
    try {
      await api.patch(`/agent/commissions/${id}/paid`, {})
      qc.invalidateQueries({ queryKey: ['agent-commissions'] })
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to mark paid')
    } finally {
      setPayingId(null)
    }
  }

  if (isLoading) {
    return (
      <View style={[s.center, { backgroundColor: c.background }]}>
        <Stack.Screen options={{ title: 'Commissions' }} />
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: 'Commissions' }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={c.primary} />}
      >
        {/* Summary */}
        <View style={s.statRow}>
          <View style={[s.statBox, neuCard(c)]}>
            <Ionicons name="time-outline" size={16} color={c.warning} />
            <Text style={[s.statValue, { color: c.warning }]}>{formatCurrency(summary.pending)}</Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Pending</Text>
          </View>
          <View style={[s.statBox, neuCard(c)]}>
            <Ionicons name="checkmark-circle-outline" size={16} color={c.accent} />
            <Text style={[s.statValue, { color: c.accent }]}>{formatCurrency(summary.paid)}</Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Paid</Text>
          </View>
          <View style={[s.statBox, neuCard(c)]}>
            <Ionicons name="briefcase-outline" size={16} color={c.primary} />
            <Text style={[s.statValue, { color: c.text }]}>{summary.count}</Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Deals</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[s.addBtn, { backgroundColor: c.primary }]}
          onPress={() => setShowModal(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Record Commission</Text>
        </TouchableOpacity>

        {items.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="cash-outline" size={48} color={c.muted} />
            <Text style={[s.emptyText, { color: c.muted }]}>No commissions yet</Text>
            <Text style={[s.emptySub, { color: c.muted }]}>
              Record your earnings per closed deal to track pending and paid payouts.
            </Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.id} style={[s.card, neuCard(c)]}>
              <View style={s.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={2}>{item.description}</Text>
                  <Text style={[s.cardSub, { color: c.muted }]}>
                    {formatDate(item.createdAt)}
                    {item.status === 'paid' && item.paidAt ? ` · Paid ${formatDate(item.paidAt)}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[s.amount, { color: c.text }]}>{formatCurrency(item.amount)}</Text>
                  <View style={[s.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
                    <Text style={[s.statusText, { color: STATUS_COLORS[item.status] }]}>{item.status}</Text>
                  </View>
                </View>
              </View>

              {item.status === 'pending' && (
                payingId === item.id ? (
                  <ActivityIndicator size="small" color={c.accent} />
                ) : (
                  <TouchableOpacity
                    style={[s.paidBtn, { borderColor: c.accent }]}
                    onPress={() => confirmMarkPaid(item)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="checkmark-circle-outline" size={14} color={c.accent} />
                    <Text style={[s.paidBtnText, { color: c.accent }]}>Mark Paid</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Record Commission Modal */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>Record Commission</Text>
              <TouchableOpacity onPress={() => setShowModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.label, { color: c.text }]}>Description *</Text>
              <TextInput
                style={[s.input, neuInset(c), { color: c.text }]}
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. 2-bed Osu rental — Kofi Mensah"
                placeholderTextColor={c.muted}
                maxLength={200}
              />

              <Text style={[s.label, { color: c.text }]}>Amount (GHS) *</Text>
              <TextInput
                style={[s.input, neuInset(c), { color: c.text }]}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={c.muted}
              />

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.primary }, saving && { opacity: 0.6 }]}
                onPress={record}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Record Commission</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  emptySub: { fontSize: 12, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },

  statRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  statBox: { flex: 1, padding: spacing.sm, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 13, fontFamily: 'Manrope_800ExtraBold', textAlign: 'center' },
  statLabel: { fontSize: 10, fontFamily: 'Manrope_500Medium', textTransform: 'uppercase' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 10, marginBottom: spacing.md,
  },
  addBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_700Bold' },

  card: { padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  cardSub: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  amount: { fontSize: 14, fontFamily: 'Manrope_800ExtraBold' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },

  paidBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, paddingVertical: 9, borderRadius: 10,
  },
  paidBtnText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold', flex: 1, marginRight: spacing.md },
  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.md, marginBottom: spacing.xs },
  input: { paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, fontFamily: 'Manrope_500Medium' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12, marginTop: spacing.lg, marginBottom: spacing.md,
  },
  submitText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
})
