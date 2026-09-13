import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../../lib/theme'
import { neuCard, neuInset } from '../../lib/neu'
import { formatCurrency, formatDate } from '../../lib/format'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { ListSkeleton } from '../../components/Skeleton'
import { RentReceiptModal } from '../../components/RentReceiptModal'

interface Payment {
  id: string; amount: number; method: string; status: string
  reference: string; paidAt?: string; createdAt: string
  tenantId?: string; landlordId?: string
}

interface Agreement {
  id: string; property?: { title: string }; rentAmount: number; status: string
}

interface PaymentMethod { id: string; label: string }

export default function PaymentsScreen() {
  const c = useThemeColors()
  const { user } = useAuthStore()
  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [payments, setPayments] = useState<Payment[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [receiptPaymentId, setReceiptPaymentId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState<number | null>(null)
  const [totalPaid, setTotalPaid] = useState<number | null>(null)
  const [pageLoading, setPageLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [retryPage, setRetryPage] = useState(1)
  const loadVersion = useRef(0)

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
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [methodsError, setMethodsError] = useState('')
  const [selectedMethod, setSelectedMethod] = useState('')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [loadingAgreements, setLoadingAgreements] = useState(false)

  async function load(requestedPage = 1) {
    const version = ++loadVersion.current
    setPageLoading(true)
    setLoadError('')
    try {
      const data = await api.get<{ items: Payment[]; total?: number; totalPages?: number; summary?: { totalPaid: number } }>(`/payments?page=${requestedPage}&pageSize=20`)
      if (version !== loadVersion.current) return
      setPayments(data.items)
      setPage(requestedPage)
      setTotalPages(data.totalPages ?? 1)
      setTotal(data.total ?? null)
      setTotalPaid(data.summary?.totalPaid ?? null)
    } catch {
      if (version === loadVersion.current) { setRetryPage(requestedPage); setLoadError('Could not load payment history. Please try again.') }
    } finally { if (version === loadVersion.current) { setLoading(false); setPageLoading(false) } }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  async function openModal() {
    setShowModal(true)
    setLoadingAgreements(true)
    setPaymentMethods([])
    setSelectedMethod('')
    setMethodsError('')
    try {
      const [data, available] = await Promise.all([
        api.get<{ items: Agreement[] }>('/agreements'),
        api.get<{ methods: PaymentMethod[] }>('/payments/methods'),
      ])
      setPaymentMethods(available.methods)
      if (!available.methods.length) setMethodsError('No payment methods are available right now. Please try again later.')
      setAgreements(data.items.filter((a) => a.status === 'active'))
    } catch {
      setMethodsError('Could not load payment options. Close this form and try again.')
    } finally { setLoadingAgreements(false) }
  }

  function resetModal() {
    setShowModal(false)
    setSelectedAgreement('')
    setAmount('')
    setPeriodStart('')
    setPeriodEnd('')
    setSelectedMethod('')
  }

  async function handleSubmitPayment() {
    if (!selectedAgreement) { Alert.alert('Error', 'Please select an agreement'); return }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { Alert.alert('Error', 'Please enter a valid amount'); return }
    if (!paymentMethods.some(method => method.id === selectedMethod)) { Alert.alert('Error', 'Please select a payment method'); return }
    if (selectedMethod !== 'bank_transfer' && phone.trim().length < 9) {
      Alert.alert('Error', 'Please enter the mobile money number to charge'); return
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodEnd < periodStart) { Alert.alert('Error', 'Enter the rent period as YYYY-MM-DD, with the end on or after the start.'); return }
    setSubmitting(true)
    try {
      const result = await api.post<{ instructions?: string }>('/payments', {
        agreementId: selectedAgreement,
        rentPeriod: { startDate: periodStart, endDate: periodEnd },
        amount: Number(amount),
        method: selectedMethod,
        phone: phone.trim() || undefined,
      })
      setPaymentInstructions(result.instructions || 'Your payment is pending confirmation. Check your payment history for its status.')
      resetModal()
      Alert.alert('Payment initiated', result.instructions || 'Your payment is pending confirmation. Check your payment history for its status.')
      await load()
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', _err.message || 'Failed to submit payment')
    } finally { setSubmitting(false) }
  }

  const isTenant = user?.activeRole === 'tenant'

  function renderPayment({ item }: { item: Payment }) {
    const statusColor = statusColors[item.status] ?? c.muted
    return (
      <View style={[s.item, neuCard(c)]}>
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
          {!!user?.id && ['completed', 'refunded'].includes(item.status) && (user.id === item.tenantId || user.id === item.landlordId) && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`View receipt ${item.reference}`} onPress={() => setReceiptPaymentId(item.id)} style={{ paddingVertical: spacing.sm }}><Text style={{ color: c.primary }}>View receipt</Text></TouchableOpacity>}
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
      <View style={[s.summaryCard, neuCard(c)]}>
        <View style={s.summaryItem}>
          <Text style={[s.summaryLabel, { color: c.muted }]}>Total Paid</Text>
          <Text style={[s.summaryValue, { color: c.primaryDark }]}>{totalPaid === null ? '—' : formatCurrency(totalPaid)}</Text>
        </View>
        <View style={[s.divider, { backgroundColor: c.border }]} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryLabel, { color: c.muted }]}>Transactions</Text>
          <Text style={[s.summaryValue, { color: c.primaryDark }]}>{total ?? '—'}</Text>
        </View>
      </View>

      {!!loadError && <View style={{ padding: spacing.md }}><Text accessibilityRole="alert" style={{ color: c.danger }}>{loadError}</Text><TouchableOpacity accessibilityRole="button" onPress={() => void load(retryPage)}><Text style={{ color: c.primary, paddingVertical: spacing.sm }}>Retry payment history</Text></TouchableOpacity></View>}
      <FlatList
        data={payments}
        keyExtractor={(item) => item.id}
        renderItem={renderPayment}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListEmptyComponent={loadError ? null :
          <View style={s.empty}>
            <Ionicons name="card-outline" size={48} color={c.muted} />
            <Text style={[s.emptyText, { color: c.muted }]}>No payments yet</Text>
          </View>
        }
      />
      {totalPages > 1 && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', padding: spacing.md }}>
        <TouchableOpacity accessibilityRole="button" disabled={pageLoading || page === 1} onPress={() => void load(page - 1)}><Text style={{ color: page === 1 ? c.muted : c.primary }}>Previous payments</Text></TouchableOpacity>
        <Text style={{ color: c.text }}>{pageLoading ? 'Loading…' : `${page} / ${totalPages}`}</Text>
        <TouchableOpacity accessibilityRole="button" disabled={pageLoading || page >= totalPages} onPress={() => void load(page + 1)}><Text style={{ color: page >= totalPages ? c.muted : c.primary }}>Next payments</Text></TouchableOpacity>
      </View>}

      {!!paymentInstructions && <View style={{ padding: spacing.md, backgroundColor: c.card }}>
        <Text style={{ color: c.text, fontFamily: 'Outfit_600SemiBold' }}>Payment instructions</Text>
        <Text selectable style={{ color: c.text, marginTop: 6 }}>{paymentInstructions}</Text>
      </View>}

      {/* FAB - Make Payment (tenants only) */}
      {isTenant && (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Make payment" style={[s.fab, { backgroundColor: c.primary, bottom: totalPages > 1 ? 80 : 24 }]} activeOpacity={0.85} onPress={openModal}>
          <Ionicons name="add" size={28} color="#ffffff" />
        </TouchableOpacity>
      )}

      {/* Make Payment Modal */}
      {receiptPaymentId && <RentReceiptModal key={receiptPaymentId} paymentId={receiptPaymentId} onClose={() => setReceiptPaymentId(null)} />}
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
                      <Text style={[s.optionText, { color: c.text }, selectedAgreement === ag.id && { color: c.primary, fontFamily: 'Outfit_600SemiBold' }]}>
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

              <Text style={[s.fieldLabel, { color: c.text }]}>Rent period from</Text>
              <TextInput accessibilityLabel="Rent period from" placeholder="YYYY-MM-DD" value={periodStart} onChangeText={setPeriodStart} style={[s.input, neuInset(c), { color: c.text }]} />
              <Text style={[s.fieldLabel, { color: c.text }]}>Rent period through</Text>
              <TextInput accessibilityLabel="Rent period through" placeholder="YYYY-MM-DD" value={periodEnd} onChangeText={setPeriodEnd} style={[s.input, neuInset(c), { color: c.text }]} />
              <Text style={{ color: c.muted }}>Select the dates this payment is towards. This does not mark the whole period as fully paid.</Text>

              {/* Amount Input */}
              <Text style={[s.fieldLabel, { color: c.text }]}>Amount (GHS)</Text>
              <TextInput
                style={[s.input, neuInset(c), { color: c.text }]}
                placeholder="0.00"
                placeholderTextColor={c.muted}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />

              {/* Payment Method Picker */}
              <Text style={[s.fieldLabel, { color: c.text }]}>Payment Method</Text>
              <View style={s.optionsGroup}>
                {!!methodsError && <Text accessibilityRole="alert" style={{ color: c.danger }}>{methodsError}</Text>}
                {paymentMethods.map((method) => (
                  <TouchableOpacity
                    key={method.id}
                    style={[s.optionBtn, { backgroundColor: c.surface, borderColor: c.border }, selectedMethod === method.id && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
                    onPress={() => setSelectedMethod(method.id)}
                  >
                    <View style={s.methodRow}>
                      <Ionicons
                        name={method.id === 'bank_transfer' ? 'business-outline' : 'phone-portrait-outline'}
                        size={18}
                        color={selectedMethod === method.id ? c.primary : c.muted}
                      />
                      <Text style={[s.optionText, { color: c.text }, selectedMethod === method.id && { color: c.primary, fontFamily: 'Outfit_600SemiBold' }]}>
                        {method.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Mobile money number (required for MoMo rails) */}
              {selectedMethod && selectedMethod !== 'bank_transfer' && (
                <>
                  <Text style={[s.fieldLabel, { color: c.text }]}>Mobile Money Number</Text>
                  <TextInput
                    style={[s.input, neuInset(c), { color: c.text }]}
                    placeholder="0241234567"
                    placeholderTextColor={c.muted}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                </>
              )}

              {/* Submit Button */}
              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.primary }, submitting && s.submitBtnDisabled]}
                onPress={handleSubmitPayment}
                disabled={submitting || loadingAgreements || !paymentMethods.some(method => method.id === selectedMethod)}
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
  summaryCard: { flexDirection: 'row', margin: spacing.md, padding: spacing.md },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 12, fontFamily: 'Outfit_400Regular' },
  summaryValue: { fontSize: 20, fontFamily: 'Outfit_700Bold', marginTop: 4 },
  divider: { width: 1 },
  list: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: 100 },
  item: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  itemIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  itemBody: { flex: 1 },
  itemRef: { fontSize: 12, fontFamily: 'Outfit_600SemiBold' },
  itemDate: { fontSize: 11, marginTop: 2, textTransform: 'capitalize', fontFamily: 'Outfit_400Regular' },
  itemRight: { alignItems: 'flex-end', gap: 4 },
  itemAmount: { fontSize: 15, fontFamily: 'Outfit_700Bold' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 9, fontFamily: 'Outfit_700Bold', textTransform: 'capitalize' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Outfit_500Medium' },

  // FAB
  fab: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', marginBottom: spacing.sm, marginTop: spacing.md },
  noDataText: { fontSize: 13, textAlign: 'center', paddingVertical: spacing.md, fontFamily: 'Outfit_400Regular' },
  input: { paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16, fontFamily: 'Outfit_500Medium' },
  optionsGroup: { gap: spacing.sm },
  optionBtn: { borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 14, borderWidth: 1.5 },
  optionText: { fontSize: 14, fontFamily: 'Outfit_500Medium' },
  optionSub: { fontSize: 12, marginTop: 2, fontFamily: 'Outfit_400Regular' },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 16, marginTop: spacing.lg, marginBottom: spacing.md },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#ffffff' },
})
