import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, useIsDark, spacing } from '../lib/theme'
import { formatCurrency, formatCompact } from '../lib/format'
import { api } from '../lib/api'
import { AITextInput } from '../components/AITextInput'

interface Loan {
  id: string; amount: number; interestRate: number; tenure: number
  monthlyPayment: number; totalRepayment: number; amountPaid: number
  status: string; reason: string; creditScoreAtApproval?: number; disbursedAt?: string
}

const tenureOptions = [
  { value: '1', label: '1 month' }, { value: '3', label: '3 months' },
  { value: '6', label: '6 months' }, { value: '12', label: '12 months' },
]

export default function LoansScreen() {
  const c = useThemeColors()
  const dark = useIsDark()
  const [loans, setLoans] = useState<Loan[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  const statusConfig: Record<string, { bg: string; text: string; icon: string }> = {
    pending: { bg: c.warning + '15', text: c.warning, icon: 'time-outline' },
    approved: { bg: c.accent + '15', text: c.accent, icon: 'checkmark-circle-outline' },
    active: { bg: c.primary + '15', text: c.primary, icon: 'pulse-outline' },
    repaid: { bg: c.accent + '15', text: c.accent, icon: 'checkmark-done-outline' },
    defaulted: { bg: c.danger + '15', text: c.danger, icon: 'alert-circle-outline' },
  }

  const [showApply, setShowApply] = useState(false)
  const [agreementId, setAgreementId] = useState('')
  const [agreements, setAgreements] = useState<{ id: string; status: string; rentAmount: number }[]>([])
  const [amount, setAmount] = useState('')
  const [tenure, setTenure] = useState('3')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [disbursingId, setDisbursingId] = useState<string | null>(null)
  const [repayingId, setRepayingId] = useState<string | null>(null)

  async function load() {
    try {
      const data = await api.get<{ items: Loan[] }>('/loans')
      setLoans(data.items)
    } catch { /* no-op */ } finally { setLoading(false) }
    // Load the user's agreements for the loan application picker — nobody can
    // be expected to hand-type an agreement ID.
    try {
      const ag = await api.get<{ items: { id: string; status: string; rentAmount: number }[] }>('/agreements')
      setAgreements(ag.items ?? [])
    } catch { /* picker stays empty */ }
  }
  useEffect(() => { load() }, [])
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  const activeLoan = loans.find((l) => l.status === 'active' || l.status === 'approved')
  const amountNum = Number(amount) || 0
  const tenureNum = Number(tenure) || 3
  const annualRate = 15
  const monthlyRate = annualRate / 100 / 12
  const monthlyPayment = amountNum > 0 ? (amountNum * monthlyRate * Math.pow(1 + monthlyRate, tenureNum)) / (Math.pow(1 + monthlyRate, tenureNum) - 1) : 0
  const totalRepayment = monthlyPayment * tenureNum

  function resetApplyModal() { setShowApply(false); setAgreementId(''); setAmount(''); setTenure('3'); setReason('') }

  async function handleApply() {
    if (!agreementId) { Alert.alert('Error', 'Please select an agreement'); return }
    if (!amount || amountNum < 50 || amountNum > 10000) { Alert.alert('Error', 'Amount must be between GHS 50 and GHS 10,000'); return }
    if (!reason || reason.length < 10) { Alert.alert('Error', 'Please provide a reason (min 10 characters)'); return }
    setSubmitting(true)
    try {
      await api.post('/loans/apply', { agreementId, amount: amountNum, tenure: tenureNum, reason })
      resetApplyModal(); Alert.alert('Success', 'Loan application submitted'); await load()
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to apply for loan')
    } finally { setSubmitting(false) }
  }

  async function handleDisburse(id: string) {
    setDisbursingId(id)
    try { await api.post(`/loans/${id}/disburse`, {}); Alert.alert('Success', 'Funds received to wallet'); await load() }
    catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message || 'Disbursement failed')
    } finally { setDisbursingId(null) }
  }

  async function handleRepay(id: string, repayAmount: number) {
    Alert.alert('Repay Loan', `Pay ${formatCurrency(repayAmount)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Pay', onPress: async () => {
        setRepayingId(id)
        try { await api.post(`/loans/${id}/repay`, { amount: repayAmount }); Alert.alert('Success', 'Payment successful'); await load() }
        catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message || 'Payment failed')
    } finally { setRepayingId(null) }
      }},
    ])
  }

  if (loading) {
    return <View style={[s.loadingContainer, { backgroundColor: c.surface }]}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView style={[s.container, { backgroundColor: c.surface }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>
        <View style={[s.infoBanner, { backgroundColor: c.primary + '08', borderColor: c.primary + '15' }]}>
          <Ionicons name="information-circle-outline" size={18} color={c.primary} />
          <Text style={[s.infoBannerText, { color: c.primaryDark }]}>Rent shortfall protection: borrow up to GHS 10,000 to cover your rent. Requires a credit score of 50+.</Text>
        </View>

        {!activeLoan && (
          <TouchableOpacity style={[s.newBtn, { backgroundColor: c.accent }]} activeOpacity={0.85} onPress={() => setShowApply(true)}>
            <Ionicons name="cash-outline" size={20} color="#ffffff" />
            <Text style={s.newBtnText}>Apply for Loan</Text>
          </TouchableOpacity>
        )}

        {loans.length > 0 ? (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Your Loans</Text>
            {loans.map((loan) => {
              const sc = statusConfig[loan.status] || statusConfig.pending
              const remaining = loan.totalRepayment - loan.amountPaid
              const pct = loan.totalRepayment > 0 ? Math.round((loan.amountPaid / loan.totalRepayment) * 100) : 0
              const progressColor = pct >= 75 ? c.accent : pct >= 40 ? c.warning : c.primary
              return (
                <View key={loan.id} style={[s.card, { backgroundColor: c.white }]}>
                  {/* Card header with icon-enhanced status badge */}
                  <View style={s.cardHeader}>
                    <View style={s.cardHeaderLeft}>
                      <View style={[s.cardIconWrap, { backgroundColor: sc.bg }]}>
                        <Ionicons name={sc.icon as keyof typeof Ionicons.glyphMap} size={18} color={sc.text} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cardTitle, { color: c.primaryDark }]} numberOfLines={1} adjustsFontSizeToFit>{formatCompact(loan.amount)} Loan</Text>
                        <Text style={[s.cardMeta, { color: c.muted }]}>{loan.tenure} months at {loan.interestRate}% - {loan.reason}</Text>
                      </View>
                    </View>
                    <View style={[s.badge, { backgroundColor: sc.bg, borderWidth: 1, borderColor: sc.text + '30' }]}>
                      <View style={[s.badgeDot, { backgroundColor: sc.text }]} />
                      <Text style={[s.badgeText, { color: sc.text }]}>{loan.status}</Text>
                    </View>
                  </View>

                  {loan.status === 'active' && (
                    <>
                      <View style={s.progressHeader}>
                        <Text style={[s.progressLabel, { color: c.muted }]}>Repayment progress</Text>
                        <Text style={[s.progressPct, { color: progressColor }]}>{pct}%</Text>
                      </View>
                      <View style={[s.progressBar, { backgroundColor: c.surface }]}>
                        <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: progressColor }]} />
                      </View>
                      <View style={s.progressFooter}>
                        <View style={s.progressStatRow}>
                          <Ionicons name="checkmark-circle-outline" size={13} color={c.accent} />
                          <Text style={[s.progressStat, { color: c.muted }]}>Paid: <Text style={{ color: c.accent, fontFamily: 'Manrope_600SemiBold' }}>{formatCompact(loan.amountPaid)}</Text></Text>
                        </View>
                        <View style={s.progressStatRow}>
                          <Ionicons name="hourglass-outline" size={13} color={dark ? '#f87171' : '#dc2626'} />
                          <Text style={[s.progressStat, { color: c.muted }]}>Left: <Text style={{ color: dark ? '#f87171' : '#dc2626', fontFamily: 'Manrope_600SemiBold' }}>{formatCompact(remaining)}</Text></Text>
                        </View>
                      </View>
                      <View style={s.actionRow}>
                        <TouchableOpacity style={[s.repayBtnOutline, { borderColor: c.primary }]} onPress={() => handleRepay(loan.id, loan.monthlyPayment)} disabled={repayingId === loan.id} activeOpacity={0.85}>
                          {repayingId === loan.id ? <ActivityIndicator color={c.primary} size="small" /> : (
                            <><Ionicons name="card-outline" size={14} color={c.primary} /><Text style={[s.repayBtnOutlineText, { color: c.primary }]} numberOfLines={1} adjustsFontSizeToFit>Pay {formatCompact(loan.monthlyPayment)}</Text></>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.repayBtn, { backgroundColor: c.primary }]} onPress={() => handleRepay(loan.id, remaining)} disabled={repayingId === loan.id} activeOpacity={0.85}>
                          <Ionicons name="wallet-outline" size={14} color="#ffffff" />
                          <Text style={s.repayBtnText} numberOfLines={1} adjustsFontSizeToFit>Pay All ({formatCompact(remaining)})</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                  {loan.status === 'approved' && (
                    <TouchableOpacity style={[s.disburseBtn, { backgroundColor: c.accent }]} onPress={() => handleDisburse(loan.id)} disabled={disbursingId === loan.id} activeOpacity={0.85}>
                      {disbursingId === loan.id ? <ActivityIndicator color="#ffffff" size="small" /> : (
                        <><Ionicons name="wallet-outline" size={16} color="#ffffff" /><Text style={s.disburseBtnText}>Receive Funds to Wallet</Text></>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}
          </View>
        ) : (
          <View style={s.emptySection}>
            <Ionicons name="cash-outline" size={48} color={c.muted} />
            <Text style={[s.emptyText, { color: c.muted }]}>No loans yet</Text>
            <Text style={[s.emptySubtext, { color: c.muted }]}>Apply for a micro-loan when you need help covering rent.</Text>
          </View>
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <Modal visible={showApply} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>Apply for Micro-Loan</Text>
              <TouchableOpacity onPress={resetApplyModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.fieldLabel, { color: c.text }]}>Agreement</Text>
              {agreements.length === 0 ? (
                <Text style={{ color: c.muted, fontSize: 13, marginBottom: spacing.sm }}>No agreements found on your account.</Text>
              ) : (
                <View style={[s.optionsGroup, { marginBottom: spacing.sm }]}>
                  {agreements.map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      style={[s.optionBtn, { backgroundColor: c.surface, borderColor: c.border }, agreementId === a.id && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
                      onPress={() => setAgreementId(a.id)}
                    >
                      <Text style={[s.optionText, { color: c.text }, agreementId === a.id && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>
                        {a.status} · {formatCurrency(a.rentAmount)}/mo · #{a.id.slice(-6)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <Text style={[s.fieldLabel, { color: c.text }]}>Amount (GHS)</Text>
              <TextInput style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]} placeholder="50 - 10,000" placeholderTextColor={c.muted} keyboardType="numeric" value={amount} onChangeText={setAmount} />
              <Text style={[s.fieldLabel, { color: c.text }]}>Repayment Period</Text>
              <View style={s.optionsGroup}>
                {tenureOptions.map((t) => (
                  <TouchableOpacity key={t.value} style={[s.optionBtn, { backgroundColor: c.surface, borderColor: c.border }, tenure === t.value && { borderColor: c.primary, backgroundColor: c.primary + '08' }]} onPress={() => setTenure(t.value)}>
                    <Text style={[s.optionText, { color: c.text }, tenure === t.value && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <AITextInput label="Reason" aiContext="loan application reason" placeholder="Why do you need this loan? (min 10 chars)" numberOfLines={3} value={reason} onChangeText={setReason} />
              {amountNum > 0 && (
                <View style={[s.calcCard, { backgroundColor: c.surface }]}>
                  <Text style={[s.calcRow, { color: c.text }]}>Interest rate: <Text style={s.calcBold}>15% annual</Text></Text>
                  <Text style={[s.calcRow, { color: c.text }]}>Monthly payment: <Text style={s.calcBold}>{formatCurrency(Math.round(monthlyPayment * 100) / 100)}</Text></Text>
                  <Text style={[s.calcRow, { color: c.text }]}>Total repayment: <Text style={s.calcBold}>{formatCurrency(Math.round(totalRepayment * 100) / 100)}</Text></Text>
                </View>
              )}
              <TouchableOpacity style={[s.submitBtn, { backgroundColor: c.primary }, submitting && s.submitBtnDisabled]} onPress={handleApply} disabled={submitting} activeOpacity={0.85}>
                {submitting ? <ActivityIndicator color="#ffffff" /> : (
                  <><Ionicons name="checkmark-circle" size={18} color="#ffffff" /><Text style={s.submitBtnText}>Apply</Text></>
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
  infoBanner: { flexDirection: 'row', gap: spacing.sm, borderWidth: 1, borderRadius: 12, padding: spacing.md, margin: spacing.md },
  infoBannerText: { flex: 1, fontSize: 12, fontFamily: 'Manrope_400Regular' },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: spacing.md, paddingVertical: 12, borderRadius: 12 },
  newBtnText: { fontSize: 15, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },
  section: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  sectionTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', marginBottom: spacing.sm },

  // Loan cards
  card: { borderRadius: 14, padding: spacing.md, marginBottom: spacing.sm, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: spacing.sm },
  cardIconWrap: { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  cardMeta: { fontSize: 11, marginTop: 2, fontFamily: 'Manrope_400Regular' },

  // Status badge
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },

  // Progress
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  progressPct: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  progressStatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  progressStat: { fontSize: 11, fontFamily: 'Manrope_400Regular' },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  repayBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10 },
  repayBtnOutlineText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  repayBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, paddingVertical: 10 },
  repayBtnText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },
  disburseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, marginTop: spacing.sm },
  disburseBtnText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },

  // Empty
  emptySection: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
  emptySubtext: { fontSize: 12, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginBottom: spacing.sm, marginTop: spacing.md },
  input: { borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16, borderWidth: 1, fontFamily: 'Manrope_500Medium' },
  textArea: { height: 80, paddingTop: 14 },
  optionsGroup: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  optionBtn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: spacing.md, alignItems: 'center', borderWidth: 1.5 },
  optionText: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
  calcCard: { borderRadius: 12, padding: spacing.md, marginTop: spacing.md },
  calcRow: { fontSize: 13, fontFamily: 'Manrope_400Regular', marginBottom: 4 },
  calcBold: { fontFamily: 'Manrope_700Bold' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 16, marginTop: spacing.lg, marginBottom: spacing.md },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: '#ffffff' },
})
