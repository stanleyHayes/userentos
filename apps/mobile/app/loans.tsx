import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert, Switch } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, useIsDark, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
import { formatCurrency, formatCompact } from '../lib/format'
import { api } from '../lib/api'
import { AITextInput } from '../components/AITextInput'
import type { Loan, LoanQuote, LoanTerms } from '../types/shared'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting review', pre_qualified: 'Pre-qualified', pending_review: 'In review',
  approved: 'Awaiting disbursement', active: 'Active', repaid: 'Repaid', defaulted: 'Defaulted', rejected: 'Declined',
}
const OPEN = ['pending', 'pre_qualified', 'pending_review', 'approved', 'active', 'defaulted']

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
    rejected: { bg: c.danger + '15', text: c.danger, icon: 'close-circle-outline' },
  }

  const [showApply, setShowApply] = useState(false)
  const [agreementId, setAgreementId] = useState('')
  const [agreements, setAgreements] = useState<{ id: string; status: string; rentAmount: number }[]>([])
  const [amount, setAmount] = useState('')
  const [tenure, setTenure] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [repayingId, setRepayingId] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [terms, setTerms] = useState<LoanTerms | null>(null)
  const [quote, setQuote] = useState<LoanQuote | null>(null)
  const [accepted, setAccepted] = useState(false)

  async function load() {
    try {
      const data = await api.get<{ items: Loan[] }>('/loans')
      setLoans(data.items)
    } catch { /* no-op */ } finally { setLoading(false) }
    // Load the user's agreements for the loan application picker — nobody can
    // be expected to hand-type an agreement ID.
    try {
      const ag = await api.get<{ items: { id: string; status: string; rentAmount: number }[] }>('/agreements')
      setAgreements((ag.items ?? []).filter((a) => a.status === 'active'))
    } catch { /* picker stays empty */ }
    // The rate and limits come from the server — never hardcoded here.
    try { setTerms(await api.get<LoanTerms>('/loans/terms')) } catch { /* apply stays hidden */ }
  }
  useEffect(() => { load() }, [])
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  const openLoan = loans.find((l) => OPEN.includes(l.status))
  const amountNum = Number(amount) || 0
  const tenureNum = Number(tenure) || terms?.minTenureMonths || 3
  const tenureOptions = terms
    ? Array.from({ length: terms.maxTenureMonths - terms.minTenureMonths + 1 }, (_, i) => terms.minTenureMonths + i).filter((m) => m % 3 === 0 || m === terms.minTenureMonths)
    : []

  function resetApplyModal() { setShowApply(false); setAgreementId(''); setAmount(''); setTenure(''); setReason(''); setQuote(null); setAccepted(false) }

  async function handleReviewTerms() {
    if (!terms) return
    if (!agreementId) { Alert.alert('Error', 'Please select a signed, active agreement'); return }
    if (!amount || amountNum < terms.minAmount || amountNum > terms.maxAmount) { Alert.alert('Error', `Amount must be between ${formatCurrency(terms.minAmount)} and ${formatCurrency(terms.maxAmount)}`); return }
    if (!reason || reason.length < 10) { Alert.alert('Error', 'Please provide a reason (min 10 characters)'); return }
    setSubmitting(true)
    try { setQuote(await api.get<LoanQuote>(`/loans/quote?amount=${amountNum}&tenure=${tenureNum}`)); setAccepted(false) }
    catch (e) { Alert.alert('Error', (e as { message?: string }).message || 'Could not calculate the loan terms') }
    finally { setSubmitting(false) }
  }

  async function handleApply() {
    if (!quote || !accepted) return
    setSubmitting(true)
    try {
      await api.post('/loans/apply', {
        agreementId, amount: quote.principal, tenure: quote.tenureMonths, reason,
        acceptTerms: accepted, quotedApr: quote.apr, quotedTotalRepayment: quote.totalRepayable,
      })
      resetApplyModal(); Alert.alert('Application received', 'A lender will review your application. Nothing is paid until the lender approves and disburses it.'); await load()
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to apply for loan')
    } finally { setSubmitting(false) }
  }

  async function handleRequestReview(id: string) {
    setReviewingId(id)
    try { await api.post(`/loans/${id}/request-review`, {}); Alert.alert('Sent for review', 'A person will review this decision.'); await load() }
    catch (e) { Alert.alert('Error', (e as { message?: string }).message || 'Could not request a review') }
    finally { setReviewingId(null) }
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
          <Text style={[s.infoBannerText, { color: c.primaryDark }]}>
            {terms
              ? `Personal loan of ${formatCurrency(terms.minAmount)}–${formatCurrency(terms.maxAmount)}, repaid monthly over ${terms.minTenureMonths}–${terms.maxTenureMonths} months at ${terms.annualInterestRate}% a year${terms.processingFeePct > 0 ? ` plus a ${terms.processingFeePct}% fee` : ''}. You see the APR, total cost and every repayment before you confirm. Borrowing costs money; missed repayments can affect your credit score. A lender reviews every application.`
              : 'Loan terms are unavailable right now.'}
          </Text>
        </View>

        {!openLoan && terms && (
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
                <View key={loan.id} style={[s.card, neuCard(c)]}>
                  {/* Card header with icon-enhanced status badge */}
                  <View style={s.cardHeader}>
                    <View style={s.cardHeaderLeft}>
                      <View style={[s.cardIconWrap, { backgroundColor: sc.bg }]}>
                        <Ionicons name={sc.icon as keyof typeof Ionicons.glyphMap} size={18} color={sc.text} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cardTitle, { color: c.primaryDark }]} numberOfLines={1} adjustsFontSizeToFit>{formatCompact(loan.amount)} Loan</Text>
                        <Text style={[s.cardMeta, { color: c.muted }]}>{loan.tenure} months at {loan.interestRate}% a year{loan.apr != null ? ` (APR ${loan.apr}%)` : ''} - {loan.reason}</Text>
                      </View>
                    </View>
                    <View style={[s.badge, { backgroundColor: sc.bg, borderWidth: 1, borderColor: sc.text + '30' }]}>
                      <View style={[s.badgeDot, { backgroundColor: sc.text }]} />
                      <Text style={[s.badgeText, { color: sc.text }]}>{STATUS_LABEL[loan.status] ?? loan.status}</Text>
                    </View>
                  </View>
                  {(loan.decisionReason || (loan.status === 'rejected' && loan.automatedAssessment)) && (
                    <Text style={[s.cardMeta, { color: c.muted, marginBottom: spacing.sm }]}>
                      {loan.decisionReason ? `Reviewer's reason: ${loan.decisionReason}` : `Automated assessment: ${loan.automatedAssessment!.reasons.join(' ')}`}
                    </Text>
                  )}
                  {loan.status === 'rejected' && loan.automatedAssessment?.outcome === 'declined' && !loan.reviewedBy && !loan.reviewRequestedAt && (
                    <TouchableOpacity style={[s.repayBtnOutline, { borderColor: c.primary }]} onPress={() => handleRequestReview(loan.id)} disabled={reviewingId === loan.id} activeOpacity={0.85}>
                      {reviewingId === loan.id ? <ActivityIndicator color={c.primary} size="small" /> : <Text style={[s.repayBtnOutlineText, { color: c.primary }]}>Ask a person to review this decision</Text>}
                    </TouchableOpacity>
                  )}

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
                          <Text style={[s.progressStat, { color: c.muted }]}>Paid: <Text style={{ color: c.accent, fontFamily: 'Outfit_600SemiBold' }}>{formatCompact(loan.amountPaid)}</Text></Text>
                        </View>
                        <View style={s.progressStatRow}>
                          <Ionicons name="hourglass-outline" size={13} color={dark ? '#f87171' : '#dc2626'} />
                          <Text style={[s.progressStat, { color: c.muted }]}>Left: <Text style={{ color: dark ? '#f87171' : '#dc2626', fontFamily: 'Outfit_600SemiBold' }}>{formatCompact(remaining)}</Text></Text>
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
                </View>
              )
            })}
          </View>
        ) : (
          <View style={s.emptySection}>
            <Ionicons name="cash-outline" size={48} color={c.muted} />
            <Text style={[s.emptyText, { color: c.muted }]}>No loans yet</Text>
            <Text style={[s.emptySubtext, { color: c.muted }]}>Your loan applications and repayments will appear here.</Text>
          </View>
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <Modal visible={showApply} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>{quote ? 'Review Loan Terms' : 'Apply for a Personal Loan'}</Text>
              <TouchableOpacity onPress={resetApplyModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {!quote ? (
                <>
                  <Text style={[s.fieldLabel, { color: c.text }]}>Rental agreement (signed and active)</Text>
                  {agreements.length === 0 ? (
                    <Text style={{ color: c.muted, fontSize: 13, marginBottom: spacing.sm }}>No active, signed agreements on your account.</Text>
                  ) : (
                    <View style={[s.optionsGroup, { marginBottom: spacing.sm }]}>
                      {agreements.map((a) => (
                        <TouchableOpacity
                          key={a.id}
                          style={[s.optionBtn, { backgroundColor: c.surface, borderColor: c.border }, agreementId === a.id && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
                          onPress={() => setAgreementId(a.id)}
                        >
                          <Text style={[s.optionText, { color: c.text }, agreementId === a.id && { color: c.primary, fontFamily: 'Outfit_600SemiBold' }]}>
                            {formatCurrency(a.rentAmount)}/mo · #{a.id.slice(-6)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <Text style={[s.fieldLabel, { color: c.text }]}>Amount (GHS)</Text>
                  <TextInput style={[s.input, neuInset(c), { color: c.text }]} placeholder={terms ? `${terms.minAmount} - ${terms.maxAmount}` : ''} placeholderTextColor={c.muted} keyboardType="numeric" value={amount} onChangeText={setAmount} />
                  <Text style={[s.fieldLabel, { color: c.text }]}>Repayment Period</Text>
                  <View style={s.optionsGroup}>
                    {tenureOptions.map((m) => (
                      <TouchableOpacity key={m} style={[s.optionBtn, { backgroundColor: c.surface, borderColor: c.border }, tenureNum === m && { borderColor: c.primary, backgroundColor: c.primary + '08' }]} onPress={() => setTenure(String(m))}>
                        <Text style={[s.optionText, { color: c.text }, tenureNum === m && { color: c.primary, fontFamily: 'Outfit_600SemiBold' }]}>{m} months</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <AITextInput label="Reason" aiContext="loan application reason" placeholder="Why do you need this loan? (min 10 chars)" numberOfLines={3} value={reason} onChangeText={setReason} />
                  <TouchableOpacity style={[s.submitBtn, { backgroundColor: c.primary }, submitting && s.submitBtnDisabled]} onPress={handleReviewTerms} disabled={submitting} activeOpacity={0.85}>
                    {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={s.submitBtnText}>Review terms</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={[s.calcCard, neuInset(c)]}>
                    <Text style={[s.calcRow, { color: c.text }]}>Amount borrowed: <Text style={s.calcBold}>{formatCurrency(quote.principal)}</Text></Text>
                    {quote.processingFee > 0 && <Text style={[s.calcRow, { color: c.text }]}>Processing fee (deducted): <Text style={s.calcBold}>{formatCurrency(quote.processingFee)}</Text></Text>}
                    <Text style={[s.calcRow, { color: c.text }]}>You receive: <Text style={s.calcBold}>{formatCurrency(quote.netDisbursed)}</Text></Text>
                    <Text style={[s.calcRow, { color: c.text }]}>Interest rate: <Text style={s.calcBold}>{quote.annualInterestRate}% a year</Text></Text>
                    <Text style={[s.calcRow, { color: c.text }]}>APR (interest and fees): <Text style={s.calcBold}>{quote.apr}%</Text></Text>
                    <Text style={[s.calcRow, { color: c.text }]}>Total repayment: <Text style={s.calcBold}>{formatCurrency(quote.totalRepayable)}</Text></Text>
                    <Text style={[s.calcRow, { color: c.text }]}>Total cost of credit: <Text style={s.calcBold}>{formatCurrency(quote.totalCostOfCredit)}</Text></Text>
                  </View>
                  <Text style={[s.fieldLabel, { color: c.text }]}>Repayment schedule</Text>
                  {quote.schedule.map((row) => (
                    <Text key={row.installmentNumber} style={[s.calcRow, { color: c.text }]}>
                      Month {row.installmentNumber}: {formatCurrency(row.amountDue)} ({formatCurrency(row.principal)} principal + {formatCurrency(row.interest)} interest)
                    </Text>
                  ))}
                  <Text style={[s.cardMeta, { color: c.muted, marginTop: spacing.sm }]}>Payments start one month after the lender disburses the loan. Applying does not guarantee approval.</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }}>
                    <Switch value={accepted} onValueChange={setAccepted} />
                    <Text style={[s.calcRow, { color: c.text, flex: 1 }]}>I have read these terms and accept them</Text>
                  </View>
                  <TouchableOpacity style={[s.submitBtn, { backgroundColor: c.primary }, (submitting || !accepted) && s.submitBtnDisabled]} onPress={handleApply} disabled={submitting || !accepted} activeOpacity={0.85}>
                    {submitting ? <ActivityIndicator color="#ffffff" /> : (
                      <><Ionicons name="checkmark-circle" size={18} color="#ffffff" /><Text style={s.submitBtnText}>Confirm and apply</Text></>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setQuote(null)} style={{ alignItems: 'center', marginBottom: spacing.md }}>
                    <Text style={{ color: c.primary, fontFamily: 'Outfit_600SemiBold' }}>Back</Text>
                  </TouchableOpacity>
                </>
              )}
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
  infoBannerText: { flex: 1, fontSize: 12, fontFamily: 'Outfit_400Regular' },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: spacing.md, paddingVertical: 12, borderRadius: 10 },
  newBtnText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: '#ffffff' },
  section: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  sectionTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', marginBottom: spacing.sm },

  // Loan cards
  card: { padding: spacing.md, marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: spacing.sm },
  cardIconWrap: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontFamily: 'Outfit_700Bold' },
  cardMeta: { fontSize: 11, marginTop: 2, fontFamily: 'Outfit_400Regular' },

  // Status badge
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontFamily: 'Outfit_700Bold', textTransform: 'capitalize' },

  // Progress
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 11, fontFamily: 'Outfit_400Regular' },
  progressPct: { fontSize: 13, fontFamily: 'Outfit_700Bold' },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  progressStatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  progressStat: { fontSize: 11, fontFamily: 'Outfit_400Regular' },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  repayBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10 },
  repayBtnOutlineText: { fontSize: 12, fontFamily: 'Outfit_600SemiBold' },
  repayBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, paddingVertical: 10 },
  repayBtnText: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', color: '#ffffff' },

  // Empty
  emptySection: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Outfit_500Medium' },
  emptySubtext: { fontSize: 12, fontFamily: 'Outfit_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', marginBottom: spacing.sm, marginTop: spacing.md },
  input: { paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16, fontFamily: 'Outfit_500Medium' },
  textArea: { height: 80, paddingTop: 14 },
  optionsGroup: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  optionBtn: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: spacing.md, alignItems: 'center', borderWidth: 1.5 },
  optionText: { fontSize: 13, fontFamily: 'Outfit_500Medium' },
  calcCard: { padding: spacing.md, marginTop: spacing.md },
  calcRow: { fontSize: 13, fontFamily: 'Outfit_400Regular', marginBottom: 4 },
  calcBold: { fontFamily: 'Outfit_700Bold' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 16, marginTop: spacing.lg, marginBottom: spacing.md },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#ffffff' },
})
