import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useThemeColors, useIsDark, spacing } from '../../lib/theme'
import { formatCompact, formatDate } from '../../lib/format'
import { api } from '../../lib/api'
import { ListSkeleton } from '../../components/Skeleton'

interface Wallet {
  balance: number
  transactions: { id: string; type: string; amount: number; description: string; createdAt: string }[]
}

interface SavingsPlan {
  id: string; targetAmount: number; currentAmount: number; frequency: string
  contributionAmount: number; targetDate: string; status: string
}

const frequencies = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

const paymentMethods = [
  { value: 'mtn_momo', label: 'MTN MoMo', icon: 'phone-portrait-outline' },
  { value: 'telecel_cash', label: 'Telecel Cash', icon: 'phone-portrait-outline' },
  { value: 'airteltigo_money', label: 'AirtelTigo Money', icon: 'phone-portrait-outline' },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: 'business-outline' },
] as const

const tabs = ['Savings', 'Investments', 'Loans'] as const
type Tab = typeof tabs[number]

export default function SavingsScreen() {
  const c = useThemeColors()
  const dark = useIsDark()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('Savings')
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [plans, setPlans] = useState<SavingsPlan[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  // New Plan modal state
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [targetAmount, setTargetAmount] = useState('')
  const [frequency, setFrequency] = useState('')
  const [contributionAmount, setContributionAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [submittingPlan, setSubmittingPlan] = useState(false)

  // Deposit/Withdraw modal state
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [walletAction, setWalletAction] = useState<'deposit' | 'withdraw'>('deposit')
  const [walletAmount, setWalletAmount] = useState('')
  const [walletMethod, setWalletMethod] = useState('')
  const [submittingWallet, setSubmittingWallet] = useState(false)

  async function load() {
    try {
      const [w, p] = await Promise.all([
        api.get<Wallet>('/savings/wallet'),
        api.get<{ items: SavingsPlan[] }>('/savings/plans'),
      ])
      setWallet(w)
      setPlans(p.items)
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  function resetPlanModal() {
    setShowPlanModal(false)
    setTargetAmount('')
    setFrequency('')
    setContributionAmount('')
    setTargetDate('')
  }

  async function handleCreatePlan() {
    if (!targetAmount || isNaN(Number(targetAmount)) || Number(targetAmount) <= 0) { Alert.alert('Error', 'Please enter a valid target amount'); return }
    if (!frequency) { Alert.alert('Error', 'Please select a frequency'); return }
    if (!contributionAmount || isNaN(Number(contributionAmount)) || Number(contributionAmount) <= 0) { Alert.alert('Error', 'Please enter a valid contribution amount'); return }
    if (!targetDate) { Alert.alert('Error', 'Please enter a target date (YYYY-MM-DD)'); return }

    setSubmittingPlan(true)
    try {
      await api.post('/savings/plans', {
        targetAmount: Number(targetAmount),
        frequency,
        contributionAmount: Number(contributionAmount),
        targetDate,
      })
      resetPlanModal()
      Alert.alert('Success', 'Savings plan created successfully')
      await load()
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', _err.message || 'Failed to create savings plan')
    } finally { setSubmittingPlan(false) }
  }

  function openWalletModal(action: 'deposit' | 'withdraw') {
    setWalletAction(action)
    setWalletAmount('')
    setShowWalletModal(true)
  }

  async function handleWalletAction() {
    if (!walletAmount || isNaN(Number(walletAmount)) || Number(walletAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount'); return
    }
    if (!walletMethod) {
      Alert.alert('Error', 'Please select a payment method'); return
    }

    setSubmittingWallet(true)
    try {
      const endpoint = walletAction === 'deposit' ? '/savings/wallet/deposit' : '/savings/wallet/withdraw'
      await api.post(endpoint, { amount: Number(walletAmount), method: walletMethod })
      setShowWalletModal(false)
      setWalletMethod('')
      Alert.alert('Success', `${walletAction === 'deposit' ? 'Deposit' : 'Withdrawal'} successful`)
      await load()
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', _err.message || `Failed to ${walletAction
    }`)
    } finally { setSubmittingWallet(false) }
  }

  const recentTxs = (wallet?.transactions ?? []).slice(-5).reverse()

  // Wallet card gradient colors
  const walletBg = dark ? '#3b82f6' : '#1e3a5f'
  const walletAccent = dark ? '#2563eb' : '#2d5a8e'

  // Quick stats from plans
  const activePlans = plans.filter((p) => p.status === 'active')
  const totalSaved = activePlans.reduce((sum, p) => sum + p.currentAmount, 0)
  const totalTarget = activePlans.reduce((sum, p) => sum + p.targetAmount, 0)

  if (loading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: c.surface }]}>
        <ListSkeleton />
      </View>
    )
  }

  function handleTabPress(tab: Tab) {
    setActiveTab(tab)
    if (tab === 'Investments') {
      router.push('/investments')
      setTimeout(() => setActiveTab('Savings'), 300)
    } else if (tab === 'Loans') {
      router.push('/loans')
      setTimeout(() => setActiveTab('Savings'), 300)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      {/* Tab Navigation */}
      <View style={[s.tabBar, { backgroundColor: c.white, borderBottomColor: c.border }]}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && { borderBottomColor: c.primary }]}
            onPress={() => handleTabPress(tab)}
            activeOpacity={0.7}
          >
            <Text style={[s.tabText, { color: c.muted }, activeTab === tab && { fontFamily: 'Manrope_700Bold', color: c.primary }]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={[s.container, { backgroundColor: c.surface }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>
        {/* Wallet Card - Vibrant Gradient */}
        <View style={[s.walletCard, { backgroundColor: walletBg }]}>
          {/* Decorative accent overlay */}
          <View style={[s.walletOverlay, { backgroundColor: walletAccent }]} />
          <View style={s.walletContent}>
            <View style={s.walletHeader}>
              <View style={s.walletIconWrap}>
                <Ionicons name="wallet" size={22} color="#ffffff" />
              </View>
              <Text style={s.walletLabel}>Wallet Balance</Text>
            </View>
            <Text style={s.walletBalance} numberOfLines={1} adjustsFontSizeToFit>{formatCompact(wallet?.balance ?? 0)}</Text>

            {/* Mini stat chips */}
            <View style={s.walletStats}>
              <View style={s.walletStatChip}>
                <Ionicons name="flag-outline" size={13} color="rgba(255,255,255,0.8)" />
                <Text style={s.walletStatText}>{activePlans.length} plan{activePlans.length !== 1 ? 's' : ''}</Text>
              </View>
              {totalTarget > 0 && (
                <View style={s.walletStatChip}>
                  <Ionicons name="pie-chart-outline" size={13} color="rgba(255,255,255,0.8)" />
                  <Text style={s.walletStatText}>{formatCompact(totalSaved)} / {formatCompact(totalTarget)}</Text>
                </View>
              )}
            </View>

            <View style={s.walletActions}>
              <TouchableOpacity style={s.walletBtn} activeOpacity={0.8} onPress={() => openWalletModal('deposit')}>
                <Ionicons name="arrow-down-circle" size={18} color="#ffffff" />
                <Text style={s.walletBtnText}>Deposit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.walletBtn, s.walletBtnOutline]} activeOpacity={0.8} onPress={() => openWalletModal('withdraw')}>
                <Ionicons name="arrow-up-circle" size={18} color="#ffffff" />
                <Text style={s.walletBtnText}>Withdraw</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* New Plan Button */}
        <TouchableOpacity style={[s.newPlanBtn, { backgroundColor: c.accent }]} activeOpacity={0.85} onPress={() => setShowPlanModal(true)}>
          <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
          <Text style={s.newPlanBtnText}>New Savings Plan</Text>
        </TouchableOpacity>

        {/* Savings Plans */}
        {plans.length > 0 ? (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Savings Plans</Text>
            {plans.map((plan) => {
              const pct = Math.min(100, Math.round((plan.currentAmount / plan.targetAmount) * 100))
              const isActive = plan.status === 'active'
              const progressColor = pct >= 75 ? c.accent : pct >= 40 ? c.warning : c.primary
              return (
                <View key={plan.id} style={[s.planCard, { backgroundColor: c.white }]}>
                  <View style={s.planHeader}>
                    <View style={s.planHeaderLeft}>
                      <View style={[s.planIconWrap, { backgroundColor: (isActive ? c.accent : c.muted) + '15' }]}>
                        <Ionicons name="flag" size={16} color={isActive ? c.accent : c.muted} />
                      </View>
                      <View>
                        <Text style={[s.planName, { color: c.primaryDark }]}>Plan #{plan.id.slice(0, 8)}</Text>
                        <Text style={[s.planMeta, { color: c.muted }]}>{plan.frequency} - Target {formatDate(plan.targetDate)}</Text>
                      </View>
                    </View>
                    <View style={[s.badge, { backgroundColor: isActive ? c.accent + '15' : c.muted + '15', borderWidth: 1, borderColor: isActive ? c.accent + '30' : c.muted + '30' }]}>
                      <View style={[s.badgeDot, { backgroundColor: isActive ? c.accent : c.muted }]} />
                      <Text style={[s.badgeText, { color: isActive ? c.accent : c.muted }]}>{plan.status}</Text>
                    </View>
                  </View>

                  {/* Progress visualization */}
                  <View style={s.progressSection}>
                    <View style={s.progressRow}>
                      <Text style={[s.progressLabel, { color: c.muted }]}>Progress</Text>
                      <Text style={[s.progressPct, { color: progressColor }]}>{pct}%</Text>
                    </View>
                    <View style={[s.progressBar, { backgroundColor: c.surface }]}>
                      <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: progressColor }]} />
                    </View>
                    <View style={s.planFooter}>
                      <Text style={[s.planSaved, { color: progressColor }]} numberOfLines={1} adjustsFontSizeToFit>{formatCompact(plan.currentAmount)} saved</Text>
                      <Text style={[s.planTarget, { color: c.muted }]} numberOfLines={1} adjustsFontSizeToFit>of {formatCompact(plan.targetAmount)}</Text>
                    </View>
                  </View>

                  {/* Contribution info */}
                  <View style={[s.planContribRow, { borderTopColor: c.border }]}>
                    <Ionicons name="repeat-outline" size={14} color={c.muted} />
                    <Text style={[s.planContribText, { color: c.muted }]}>{formatCompact(plan.contributionAmount)} / {plan.frequency}</Text>
                  </View>
                </View>
              )
            })}
          </View>
        ) : (
          <View style={s.emptySection}>
            <Ionicons name="wallet-outline" size={48} color={c.muted} />
            <Text style={[s.emptyText, { color: c.muted }]}>No savings plans yet</Text>
          </View>
        )}

        {/* Recent Transactions */}
        {recentTxs.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Recent Transactions</Text>
            {recentTxs.map((tx, i) => (
              <View key={`${tx.id}-${i}`} style={[s.txItem, { backgroundColor: c.white }]}>
                <View style={[s.txIcon, { backgroundColor: tx.type === 'deposit' ? c.accent + '15' : c.danger + '15' }]}>
                  <Ionicons
                    name={tx.type === 'deposit' ? 'arrow-down' : 'arrow-up'}
                    size={16}
                    color={tx.type === 'deposit' ? c.accent : c.danger}
                  />
                </View>
                <View style={s.txBody}>
                  <Text style={[s.txDesc, { color: c.primaryDark }]}>{tx.description}</Text>
                  <Text style={[s.txDate, { color: c.muted }]}>{formatDate(tx.createdAt)}</Text>
                </View>
                <Text style={[s.txAmount, { color: tx.type === 'deposit' ? c.accent : c.danger }]} numberOfLines={1} adjustsFontSizeToFit>
                  {tx.type === 'deposit' ? '+' : '-'}{formatCompact(tx.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* New Plan Modal */}
      <Modal visible={showPlanModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>New Savings Plan</Text>
              <TouchableOpacity onPress={resetPlanModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.fieldLabel, { color: c.text }]}>Target Amount (GHS)</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                placeholder="e.g. 5000"
                placeholderTextColor={c.muted}
                keyboardType="numeric"
                value={targetAmount}
                onChangeText={setTargetAmount}
              />

              <Text style={[s.fieldLabel, { color: c.text }]}>Frequency</Text>
              <View style={s.optionsGroup}>
                {frequencies.map((f) => (
                  <TouchableOpacity
                    key={f.value}
                    style={[s.optionBtn, { backgroundColor: c.surface, borderColor: c.border }, frequency === f.value && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
                    onPress={() => setFrequency(f.value)}
                  >
                    <Text style={[s.optionText, { color: c.text }, frequency === f.value && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.fieldLabel, { color: c.text }]}>Contribution Amount (GHS)</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                placeholder="e.g. 200"
                placeholderTextColor={c.muted}
                keyboardType="numeric"
                value={contributionAmount}
                onChangeText={setContributionAmount}
              />

              <Text style={[s.fieldLabel, { color: c.text }]}>Target Date (YYYY-MM-DD)</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                placeholder="e.g. 2026-12-31"
                placeholderTextColor={c.muted}
                value={targetDate}
                onChangeText={setTargetDate}
              />

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.primary }, submittingPlan && s.submitBtnDisabled]}
                onPress={handleCreatePlan}
                disabled={submittingPlan}
                activeOpacity={0.85}
              >
                {submittingPlan ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
                    <Text style={s.submitBtnText}>Create Plan</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Deposit/Withdraw Modal */}
      <Modal visible={showWalletModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>{walletAction === 'deposit' ? 'Deposit to Wallet' : 'Withdraw from Wallet'}</Text>
              <TouchableOpacity onPress={() => setShowWalletModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>

            <Text style={[s.fieldLabel, { color: c.text }]}>Amount (GHS)</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
              placeholder="0.00"
              placeholderTextColor={c.muted}
              keyboardType="numeric"
              value={walletAmount}
              onChangeText={setWalletAmount}
            />

            <Text style={[s.fieldLabel, { color: c.text }]}>Payment Method</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {paymentMethods.map((m) => (
                <TouchableOpacity
                  key={m.value}
                  style={[s.optionBtn, { flex: 0, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: c.surface, borderColor: c.border }, walletMethod === m.value && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
                  onPress={() => setWalletMethod(m.value)}
                >
                  <Text style={[s.optionText, { fontSize: 12, color: c.text }, walletMethod === m.value && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: walletAction === 'withdraw' ? c.danger : c.primary }, submittingWallet && s.submitBtnDisabled]}
              onPress={handleWalletAction}
              disabled={submittingWallet}
              activeOpacity={0.85}
            >
              {submittingWallet ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name={walletAction === 'deposit' ? 'arrow-down-circle' : 'arrow-up-circle'} size={18} color="#ffffff" />
                  <Text style={s.submitBtnText}>{walletAction === 'deposit' ? 'Deposit' : 'Withdraw'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBar: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs, borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },

  // Wallet Card
  walletCard: { margin: spacing.md, borderRadius: 20, overflow: 'hidden', position: 'relative' },
  walletOverlay: { position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, opacity: 0.25 },
  walletContent: { padding: spacing.lg, position: 'relative' },
  walletHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  walletIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  walletLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontFamily: 'Manrope_500Medium' },
  walletBalance: { color: '#ffffff', fontSize: 34, fontFamily: 'Manrope_800ExtraBold', marginBottom: 4 },
  walletStats: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
  walletStatChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  walletStatText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: 'Manrope_500Medium' },
  walletActions: { flexDirection: 'row', gap: 12 },
  walletBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingVertical: 11 },
  walletBtnOutline: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  walletBtnText: { color: '#ffffff', fontSize: 13, fontFamily: 'Manrope_600SemiBold' },

  // New Plan
  newPlanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: spacing.md, paddingVertical: 12, borderRadius: 12 },
  newPlanBtnText: { fontSize: 15, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },

  // Section
  section: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  sectionTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', marginBottom: spacing.sm },

  // Plan Cards
  planCard: { borderRadius: 14, padding: spacing.md, marginBottom: spacing.sm, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  planHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  planIconWrap: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  planName: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  planMeta: { fontSize: 11, marginTop: 2, textTransform: 'capitalize', fontFamily: 'Manrope_400Regular' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },

  // Progress
  progressSection: { marginTop: 4 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressLabel: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  progressPct: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  planFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  planSaved: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  planTarget: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  planContribRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1 },
  planContribText: { fontSize: 11, fontFamily: 'Manrope_500Medium', textTransform: 'capitalize' },

  // Empty
  emptySection: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },

  // Transactions
  txItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: spacing.md, marginBottom: spacing.xs, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  txIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  txBody: { flex: 1 },
  txDesc: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
  txDate: { fontSize: 11, marginTop: 2, fontFamily: 'Manrope_400Regular' },
  txAmount: { fontSize: 14, fontFamily: 'Manrope_700Bold' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginBottom: spacing.sm, marginTop: spacing.md },
  input: { borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16, borderWidth: 1, fontFamily: 'Manrope_500Medium' },
  optionsGroup: { flexDirection: 'row', gap: spacing.sm },
  optionBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5 },
  optionText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 16, marginTop: spacing.lg, marginBottom: spacing.md },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: '#ffffff' },
})
