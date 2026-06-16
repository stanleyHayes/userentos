import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../../lib/theme'
import { formatCurrency, formatDate } from '../../lib/format'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { ListSkeleton } from '../../components/Skeleton'

interface Payment {
  id: string; amount: number; method: string; status: string
  reference: string; paidAt?: string; createdAt: string
}

interface Agreement {
  id: string; property?: { title: string }; rentAmount: number; status: string
}

const paymentMethods = [
  { value: 'mtn_momo', label: 'MTN MoMo', icon: 'phone-portrait-outline' as const },
  { value: 'telecel', label: 'Telecel', icon: 'phone-portrait-outline' as const },
  { value: 'airteltigo', label: 'AirtelTigo', icon: 'phone-portrait-outline' as const },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: 'business-outline' as const },
]

export default function PaymentsScreen() {
  const c = useThemeColors()
  const { user } = useAuthStore()
  const [payments, setPayments] = useState<Payment[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  const statusColors: Record<string, string> = {
    completed: c.accent,
    pending: c.warning,
    processing: c.primary,
    failed: c.danger,
  }

  // Make Payment modal state
  const [showModal, setShowModal] = useState(false)
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [selectedAgreement, setSelectedAgreement] = useState('')
  const [amount, setAmount] = useState('')
  const [selectedMethod, setSelectedMethod] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadingAgreements, setLoadingAgreements] = useState(false)

  async function load() {
    try {
      const data = await api.get<{ items: Payment[] }>('/payments')
      setPayments(data.items)
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  async function openModal() {
    setShowModal(true)
    setLoadingAgreements(true)
    try {
      const data = await api.get<{ items: Agreement[] }>('/agreements')
      setAgreements(data.items.filter((a) => a.status === 'active'))
    } catch {
      Alert.alert('Error', 'Failed to load agreements')
    } finally { setLoadingAgreements(false) }
  }

  function resetModal() {
    setShowModal(false)
    setSelectedAgreement('')
    setAmount('')
    setSelectedMethod('')
  }

  async function handleSubmitPayment() {
    if (!selectedAgreement) { Alert.alert('Error', 'Please select an agreement'); return }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { Alert.alert('Error', 'Please enter a valid amount'); return }
    if (!selectedMethod) { Alert.alert('Error', 'Please select a payment method'); return }

    setSubmitting(true)
    try {
      await api.post('/payments', {
        agreementId: selectedAgreement,
        amount: Number(amount),
        method: selectedMethod,
      })
      resetModal()
      Alert.alert('Success', 'Payment submitted successfully')
      await load()
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', _err.message || 'Failed to submit payment')
    } finally { setSubmitting(false) }
  }

  const totalPaid = payments.filter((p) => p.status === 'completed').reduce((s, p) => s + p.amount, 0)
  const isTenant = user?.activeRole === 'tenant'

  function renderPayment({ item }: { item: Payment }) {
    const statusColor = statusColors[item.status] ?? c.muted
    return (
      <View style={[s.item, { backgroundColor: c.white }]}>
        <View style={[s.itemIcon, { backgroundColor: statusColor + '15' }]}>
          <Ionicons name={item.status === 'completed' ? 'checkmark-circle' : 'time'} size={20} color={statusColor} />
        </View>
        <View style={s.itemBody}>
          <Text style={[s.itemRef, { color: c.primaryDark }]}>{item.reference}</Text>
          <Text style={[s.itemDate, { color: c.muted }]}>
            {item.paidAt ? formatDate(item.paidAt) : formatDate(item.createdAt)} - {item.method.replace('_', ' ')}
          </Text>
        </View>
        <View style={s.itemRight}>
          <Text style={[s.itemAmount, { color: c.primaryDark }]}>{formatCurrency(item.amount)}</Text>
          <View style={[s.badge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[s.badgeText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: c.surface }]}>
        <ListSkeleton count={6} />
      </View>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>
      <View style={[s.summaryCard, { backgroundColor: c.white }]}>
        <View style={s.summaryItem}>
          <Text style={[s.summaryLabel, { color: c.muted }]}>Total Paid</Text>
          <Text style={[s.summaryValue, { color: c.primaryDark }]}>{formatCurrency(totalPaid)}</Text>
        </View>
        <View style={[s.divider, { backgroundColor: c.border }]} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryLabel, { color: c.muted }]}>Transactions</Text>
          <Text style={[s.summaryValue, { color: c.primaryDark }]}>{payments.length}</Text>
        </View>
      </View>

      <FlatList
        data={payments}
        keyExtractor={(item) => item.id}
        renderItem={renderPayment}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="card-outline" size={48} color={c.muted} />
            <Text style={[s.emptyText, { color: c.muted }]}>No payments yet</Text>
          </View>
        }
      />

      {/* FAB - Make Payment (tenants only) */}
      {isTenant && (
        <TouchableOpacity style={[s.fab, { backgroundColor: c.primary }]} activeOpacity={0.85} onPress={openModal}>
          <Ionicons name="add" size={28} color="#ffffff" />
        </TouchableOpacity>
      )}

      {/* Make Payment Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>Make Payment</Text>
              <TouchableOpacity onPress={resetModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Agreement Selector */}
              <Text style={[s.fieldLabel, { color: c.text }]}>Agreement</Text>
              {loadingAgreements ? (
                <ActivityIndicator color={c.primary} style={{ marginVertical: spacing.md }} />
              ) : agreements.length === 0 ? (
                <Text style={[s.noDataText, { color: c.muted }]}>No active agreements found</Text>
              ) : (
                <View style={s.optionsGroup}>
                  {agreements.map((ag) => (
                    <TouchableOpacity
                      key={ag.id}
                      style={[s.optionBtn, { backgroundColor: c.surface, borderColor: c.border }, selectedAgreement === ag.id && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
                      onPress={() => {
                        setSelectedAgreement(ag.id)
                        if (ag.rentAmount) setAmount(String(ag.rentAmount))
                      }}
                    >
                      <Text style={[s.optionText, { color: c.text }, selectedAgreement === ag.id && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>
                        {ag.property?.title ?? `Agreement #${ag.id.slice(0, 8)}`}
                      </Text>
                      {ag.rentAmount > 0 && (
                        <Text style={[s.optionSub, { color: c.muted }, selectedAgreement === ag.id && { color: c.primary }]}>
                          {formatCurrency(ag.rentAmount)}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Amount Input */}
              <Text style={[s.fieldLabel, { color: c.text }]}>Amount (GHS)</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                placeholder="0.00"
                placeholderTextColor={c.muted}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />

              {/* Payment Method Picker */}
              <Text style={[s.fieldLabel, { color: c.text }]}>Payment Method</Text>
              <View style={s.optionsGroup}>
                {paymentMethods.map((method) => (
                  <TouchableOpacity
                    key={method.value}
                    style={[s.optionBtn, { backgroundColor: c.surface, borderColor: c.border }, selectedMethod === method.value && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
                    onPress={() => setSelectedMethod(method.value)}
                  >
                    <View style={s.methodRow}>
                      <Ionicons
                        name={method.icon}
                        size={18}
                        color={selectedMethod === method.value ? c.primary : c.muted}
                      />
                      <Text style={[s.optionText, { color: c.text }, selectedMethod === method.value && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>
                        {method.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.primary }, submitting && s.submitBtnDisabled]}
                onPress={handleSubmitPayment}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#ffffff" />
                    <Text style={s.submitBtnText}>Submit Payment</Text>
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

const s = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summaryCard: { flexDirection: 'row', margin: spacing.md, borderRadius: 12, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  summaryValue: { fontSize: 20, fontFamily: 'Manrope_700Bold', marginTop: 4 },
  divider: { width: 1 },
  list: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: 100 },
  item: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  itemIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  itemBody: { flex: 1 },
  itemRef: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  itemDate: { fontSize: 11, marginTop: 2, textTransform: 'capitalize', fontFamily: 'Manrope_400Regular' },
  itemRight: { alignItems: 'flex-end', gap: 4 },
  itemAmount: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 9, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },

  // FAB
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginBottom: spacing.sm, marginTop: spacing.md },
  noDataText: { fontSize: 13, textAlign: 'center', paddingVertical: spacing.md, fontFamily: 'Manrope_400Regular' },
  input: { borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16, borderWidth: 1, fontFamily: 'Manrope_500Medium' },
  optionsGroup: { gap: spacing.sm },
  optionBtn: { borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 14, borderWidth: 1.5 },
  optionText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
  optionSub: { fontSize: 12, marginTop: 2, fontFamily: 'Manrope_400Regular' },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 16, marginTop: spacing.lg, marginBottom: spacing.md },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: '#ffffff' },
})
