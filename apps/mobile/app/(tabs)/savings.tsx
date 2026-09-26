import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useThemeColors, useIsDark, spacing } from '../../lib/theme'
import { neuCard, neuInset } from '../../lib/neu'
import { formatCompact, formatDate } from '../../lib/format'
import { api } from '../../lib/api'
import { ListSkeleton } from '../../components/Skeleton'
import { useRegulatedFeatures } from '../../hooks/useRegulatedFeatures'

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

interface PayoutAvailability {
  balance: number; minimum: number; hasVerifiedAccount: boolean; payoutInProgress: boolean
}

const tabs = ['Savings', 'Investments', 'Loans'] as const
type Tab = typeof tabs[number]

function WalletAndSavings({ lendingEnabled, investmentsEnabled }: { lendingEnabled: boolean; investmentsEnabled: boolean }) {
  const c = useThemeColors()
  const dark = useIsDark()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('Savings')
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [plans, setPlans] = useState<SavingsPlan[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const loadGeneration = useRef(0)

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
  const [walletPhone, setWalletPhone] = useState('')
  const [submittingWallet, setSubmittingWallet] = useState(false)
  const [depositMethods, setDepositMethods] = useState<{ value: string; label: string }[]>([])
  const [methodsLoading, setMethodsLoading] = useState(false)
  const [methodsError, setMethodsError] = useState(false)
  const [methodsRetry, setMethodsRetry] = useState(0)
  const [payoutAvailability, setPayoutAvailability] = useState<PayoutAvailability | null>(null)
  const [payoutLoading, setPayoutLoading] = useState(false)
  const [payoutError, setPayoutError] = useState(false)
  const [payoutRetry, setPayoutRetry] = useState(0)
  useEffect(() => {
    if (!showWalletModal || walletAction !== 'withdraw') return
    let cancelled = false
    setPayoutLoading(true); setPayoutError(false); setPayoutAvailability(null)
    api.get<PayoutAvailability>('/payouts/available').then(data => {
      if (!data || !Number.isFinite(data.balance) || !Number.isFinite(data.minimum) || data.minimum <= 0 || typeof data.hasVerifiedAccount !== 'boolean' || typeof data.payoutInProgress !== 'boolean') throw new Error('Payout availability is incomplete')
      if (!cancelled) setPayoutAvailability(data)
    }).catch(() => { if (!cancelled) setPayoutError(true) })
      .finally(() => { if (!cancelled) setPayoutLoading(false) })
    return () => { cancelled = true }
  }, [showWalletModal, walletAction, payoutRetry])
  const canWithdraw = !payoutLoading && !payoutError && payoutAvailability?.hasVerifiedAccount && !payoutAvailability.payoutInProgress && Number.isFinite(Number(walletAmount)) && Number(walletAmount) >= payoutAvailability.minimum && Number(walletAmount) <= payoutAvailability.balance
  const [depositInstructions, setDepositInstructions] = useState<string | null>(null)
  useEffect(() => {
    if (!showWalletModal || walletAction !== 'deposit') return
    let cancelled = false
    setMethodsLoading(true); setMethodsError(false); setDepositMethods([])
    api.get<{ methods: { id: string; label: string }[] }>('/payments/methods')
      .then(data => { if (!cancelled) setDepositMethods(data.methods.map(method => ({ value: method.id, label: method.label }))) })
      .catch(() => { if (!cancelled) setMethodsError(true) })
      .finally(() => { if (!cancelled) setMethodsLoading(false) })
    return () => { cancelled = true }
  }, [showWalletModal, walletAction, methodsRetry])


  async function load() {
    const generation = ++loadGeneration.current
    try {
      const [w, p] = await Promise.all([
        api.get<Wallet>('/savings/wallet'),
        api.get<{ items: SavingsPlan[] }>('/savings/plans'),
      ])
      if (generation !== loadGeneration.current) return
      if (!w || !Number.isFinite(w.balance) || !Array.isArray(w.transactions) || !Array.isArray(p?.items)) throw new Error('Wallet response is incomplete')
      setWallet(w)
      setPlans(p.items)
      setLoadError(false)
    } catch { if (generation === loadGeneration.current) setLoadError(true) } finally { if (generation === loadGeneration.current) setLoading(false) }
  }

  useEffect(() => { load(); return () => { loadGeneration.current++ } }, [])

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
    setPayoutAvailability(null)
    setWalletAction(action)
    setWalletMethod('')
    setWalletAmount('')
    setShowWalletModal(true)
  }

  async function handleWalletAction() {
    if (!walletAmount || !Number.isFinite(Number(walletAmount)) || Number(walletAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount'); return
    }
    if (submittingWallet || (walletAction === 'withdraw' && !canWithdraw)) return
    if (walletAction === 'deposit' && (!walletMethod || methodsError || methodsLoading || !depositMethods.some(method => method.value === walletMethod))) {
      Alert.alert('Error', 'Please select a payment method'); return
    }
    if (walletAction === 'deposit' && walletMethod !== 'bank_transfer' && walletPhone.trim().length < 9) {
      Alert.alert('Error', 'Please enter the mobile money number to debit'); return
    }

    setSubmittingWallet(true)
    try {
      if (walletAction === 'deposit') {
        // Deposit initiates a real payment collection — the wallet is credited
        // only after the provider confirms, so show the payer instructions.
        // No phone for bank transfer (the field is hidden): the API accepts an
        // absent phone but rejects '' as shorter than 9 characters.
        const res = await api.post<{ instructions?: string }>('/savings/wallet/deposit', {
          amount: Number(walletAmount),
          method: walletMethod,
          phone: walletMethod === 'bank_transfer' ? undefined : (walletPhone.trim() || undefined),
        })
        setDepositInstructions(res.instructions ?? 'Your deposit is pending confirmation. Check your wallet for its status.')
        setShowWalletModal(false)
        setWalletMethod('')
        setWalletPhone('')
        Alert.alert(
          'Deposit initiated',
          res.instructions ?? 'Approve the payment on your phone — your wallet is credited once it is confirmed.',
        )
        // Poll for the balance change (simulator completes in ~2s)
        setTimeout(() => void load(), 3500)
        setTimeout(() => void load(), 8000)
      } else {
        /*
         * Withdrawals live on the payout rail, not on savings.
         *
         * POST /savings/wallet/withdraw has been retired server-side: it now
         * answers 410 with "Use POST /api/payouts ...", and this screen showed
         * that developer message to the user in an Alert. The payout rail
         * debits the wallet, sends the money through the PSP and refunds if
         * the transfer fails, which is why the old endpoint refuses to act.
         *
         * It takes only an amount — the destination comes from the user's
         * saved payout account — so `method` is no longer sent.
         */
        await api.post('/payouts', { amount: Number(walletAmount) })
        setShowWalletModal(false)
        setWalletMethod('')
        Alert.alert(
          'Withdrawal requested',
          'Your payout is being reviewed. The money is sent to your saved payout account once approved.',
        )
        await load()
      }
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

  if (loadError) {
    return <View style={{ flex: 1, padding: spacing.lg, backgroundColor: c.surface }} accessibilityRole="alert">
      <Text style={{ color: c.text }}>Could not load wallet and savings data.</Text>
      <Text style={{ color: c.muted }}>Your balance and transactions are unavailable. Please retry.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => { setLoading(true); void load() }}><Text style={{ color: c.primary, paddingVertical: spacing.md }}>Retry wallet and savings</Text></TouchableOpacity>
    </View>
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
      {depositInstructions && <View style={{ padding: spacing.md }} accessibilityRole="alert"><Text style={{ color: c.text }}>{depositInstructions}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setDepositInstructions(null)}><Text style={{ color: c.primary }}>Dismiss deposit instructions</Text></TouchableOpacity></View>}
      {/* Tab Navigation */}
      <View style={[s.tabBar, { backgroundColor: c.white, borderBottomColor: c.border }]}>
        {tabs.filter((tab) => tab === 'Savings' || (tab === 'Loans' ? lendingEnabled : investmentsEnabled)).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && { borderBottomColor: c.primary }]}
            onPress={() => handleTabPress(tab)}
            activeOpacity={0.7}
          >
            <Text style={[s.tabText, { color: c.muted }, activeTab === tab && { fontFamily: 'Outfit_700Bold', color: c.primary }]}>{tab}</Text>
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
                <View key={plan.id} style={[s.planCard, neuCard(c)]}>
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
              <View key={`${tx.id}-${i}`} style={[s.txItem, neuCard(c)]}>
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
          <View style={[s.modalContent, neuCard(c, 20)]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>New Savings Plan</Text>
              <TouchableOpacity onPress={resetPlanModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.fieldLabel, { color: c.text }]}>Target Amount (GHS)</Text>
              <TextInput
                style={[s.input, neuInset(c), { color: c.text }]}
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
                    style={[s.optionBtn, neuInset(c), frequency === f.value && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
                    onPress={() => setFrequency(f.value)}
                  >
                    <Text style={[s.optionText, { color: c.text }, frequency === f.value && { color: c.primary, fontFamily: 'Outfit_600SemiBold' }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.fieldLabel, { color: c.text }]}>Contribution Amount (GHS)</Text>
              <TextInput
                style={[s.input, neuInset(c), { color: c.text }]}
                placeholder="e.g. 200"
                placeholderTextColor={c.muted}
                keyboardType="numeric"
                value={contributionAmount}
                onChangeText={setContributionAmount}
              />

              <Text style={[s.fieldLabel, { color: c.text }]}>Target Date (YYYY-MM-DD)</Text>
              <TextInput
                style={[s.input, neuInset(c), { color: c.text }]}
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
          <View style={[s.modalContent, neuCard(c, 20)]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>{walletAction === 'deposit' ? 'Deposit to Wallet' : 'Withdraw from Wallet'}</Text>
              <TouchableOpacity onPress={() => setShowWalletModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>

            <Text style={[s.fieldLabel, { color: c.text }]}>Amount (GHS)</Text>
            <TextInput
              style={[s.input, neuInset(c), { color: c.text }]}
              placeholder="0.00"
              placeholderTextColor={c.muted}
              keyboardType="numeric"
              value={walletAmount}
              onChangeText={setWalletAmount}
            />

            {walletAction === 'withdraw' && <View style={{ gap: spacing.sm }}>
              {payoutLoading && <Text style={{ color: c.muted }}>Checking payout availability…</Text>}
              {payoutError && <View accessibilityRole="alert"><Text style={{ color: c.danger }}>Could not check payout availability.</Text><TouchableOpacity accessibilityRole="button" onPress={() => setPayoutRetry(value => value + 1)}><Text style={{ color: c.primary }}>Retry payout availability</Text></TouchableOpacity></View>}
              {!payoutLoading && !payoutError && payoutAvailability && <>
                {!payoutAvailability.hasVerifiedAccount ? <View><Text style={{ color: c.danger }}>Add and verify a payout account before withdrawing.</Text><TouchableOpacity accessibilityRole="button" onPress={() => { setShowWalletModal(false); router.push('/payout-account') }}><Text style={{ color: c.primary }}>Set up payout account</Text></TouchableOpacity></View> : payoutAvailability.payoutInProgress ? <Text style={{ color: c.muted }}>A payout is already in progress. Wait for it to finish before requesting another.</Text> : <>
                  <Text style={{ color: c.text }}>Available to withdraw: GHS {payoutAvailability.balance.toFixed(2)}. Minimum: GHS {payoutAvailability.minimum.toFixed(2)}.</Text>
                  <Text style={{ color: c.muted }}>The amount leaves your wallet now and is sent to your saved payout account once approved. If it cannot be delivered, it is refunded.</Text>
                </>}
              </>}
            </View>}
            {walletAction === 'deposit' && <Text style={[s.fieldLabel, { color: c.text }]}>Payment Method</Text>}
            {walletAction === 'deposit' && methodsLoading && <Text style={{ color: c.muted }}>Loading payment methods…</Text>}
            {walletAction === 'deposit' && methodsError && <View accessibilityRole="alert"><Text style={{ color: c.danger }}>Could not load payment methods.</Text><TouchableOpacity accessibilityRole="button" onPress={() => setMethodsRetry(value => value + 1)}><Text style={{ color: c.primary }}>Retry payment methods</Text></TouchableOpacity></View>}
            {walletAction === 'deposit' && !methodsLoading && !methodsError && depositMethods.length === 0 && <Text style={{ color: c.muted }}>No deposit methods are available right now.</Text>}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {(walletAction === 'deposit' ? depositMethods : []).map((m) => (
                <TouchableOpacity
                  key={m.value}
                  style={[s.optionBtn, neuInset(c), { flex: 0, paddingHorizontal: 14, paddingVertical: 10 }, walletMethod === m.value && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
                  onPress={() => setWalletMethod(m.value)}
                >
                  <Text style={[s.optionText, { fontSize: 12, color: c.text }, walletMethod === m.value && { color: c.primary, fontFamily: 'Outfit_600SemiBold' }]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {walletAction === 'deposit' && walletMethod && walletMethod !== 'bank_transfer' && (
              <>
                <Text style={[s.fieldLabel, { color: c.text }]}>Mobile Money Number</Text>
                <TextInput
                  style={[s.input, neuInset(c), { color: c.text }]}
                  placeholder="0241234567"
                  placeholderTextColor={c.muted}
                  keyboardType="phone-pad"
                  value={walletPhone}
                  onChangeText={setWalletPhone}
                />
              </>
            )}

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: walletAction === 'withdraw' ? c.danger : c.primary }, submittingWallet && s.submitBtnDisabled]}
              onPress={handleWalletAction}
              disabled={submittingWallet || (walletAction === 'withdraw' && !canWithdraw) || (walletAction === 'deposit' && (methodsLoading || methodsError || !depositMethods.some(method => method.value === walletMethod)))}
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
  tabText: { fontSize: 14, fontFamily: 'Outfit_500Medium' },

  // Wallet Card
  walletCard: { margin: spacing.md, borderRadius: 20, overflow: 'hidden', position: 'relative' },
  walletOverlay: { position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, opacity: 0.25 },
  walletContent: { padding: spacing.lg, position: 'relative' },
  walletHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  walletIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  walletLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontFamily: 'Outfit_500Medium' },
  walletBalance: { color: '#ffffff', fontSize: 34, fontFamily: 'Outfit_800ExtraBold', marginBottom: 4 },
  walletStats: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
  walletStatChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  walletStatText: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: 'Outfit_500Medium' },
  walletActions: { flexDirection: 'row', gap: 12 },
  walletBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingVertical: 11 },
  walletBtnOutline: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  walletBtnText: { color: '#ffffff', fontSize: 13, fontFamily: 'Outfit_600SemiBold' },

  // New Plan
  newPlanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: spacing.md, paddingVertical: 12, borderRadius: 12 },
  newPlanBtnText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: '#ffffff' },

  // Section
  section: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  sectionTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', marginBottom: spacing.sm },

  // Plan Cards — depth comes from neuCard() at the call site
  planCard: { padding: spacing.md, marginBottom: spacing.sm },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  planHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  planIconWrap: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  planName: { fontSize: 14, fontFamily: 'Outfit_700Bold' },
  planMeta: { fontSize: 11, marginTop: 2, textTransform: 'capitalize', fontFamily: 'Outfit_400Regular' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontFamily: 'Outfit_700Bold', textTransform: 'capitalize' },

  // Progress
  progressSection: { marginTop: 4 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressLabel: { fontSize: 11, fontFamily: 'Outfit_400Regular' },
  progressPct: { fontSize: 13, fontFamily: 'Outfit_700Bold' },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  planFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  planSaved: { fontSize: 12, fontFamily: 'Outfit_600SemiBold' },
  planTarget: { fontSize: 12, fontFamily: 'Outfit_400Regular' },
  planContribRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1 },
  planContribText: { fontSize: 11, fontFamily: 'Outfit_500Medium', textTransform: 'capitalize' },

  // Empty
  emptySection: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Outfit_500Medium' },

  // Transactions
  txItem: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, marginBottom: spacing.xs },
  txIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  txBody: { flex: 1 },
  txDesc: { fontSize: 13, fontFamily: 'Outfit_500Medium' },
  txDate: { fontSize: 11, marginTop: 2, fontFamily: 'Outfit_400Regular' },
  txAmount: { fontSize: 14, fontFamily: 'Outfit_700Bold' },

  // Modal — depth + top radius come from neuCard(c, 20) at the call site
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', marginBottom: spacing.sm, marginTop: spacing.md },
  input: { paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16, fontFamily: 'Outfit_500Medium' },
  optionsGroup: { flexDirection: 'row', gap: spacing.sm },
  optionBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  optionText: { fontSize: 14, fontFamily: 'Outfit_500Medium' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 16, marginTop: spacing.lg, marginBottom: spacing.md },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#ffffff' },
})

/** RentGuard groups regulated services; each part appears only when the operator offers it. */
export default function SavingsScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { data: features, isPending, isError, refetch } = useRegulatedFeatures()
  if (isPending) return <View style={[s.loadingContainer, { backgroundColor: c.surface }]}><ListSkeleton /></View>
  if (features?.wallet) return <WalletAndSavings lendingEnabled={features.lending} investmentsEnabled={features.investments} />
  const links = [
    ...(features?.investments ? [{ label: 'Investments', path: '/investments' as const }] : []),
    ...(features?.lending ? [{ label: 'Loans', path: '/loans' as const }] : []),
  ]
  return (
    <View style={{ flex: 1, padding: spacing.lg, backgroundColor: c.surface }}>
      <Text accessibilityRole="header" style={{ color: c.primaryDark, fontSize: 18, fontFamily: 'Outfit_700Bold' }}>Wallet and savings aren’t available</Text>
      <Text style={{ color: c.text, marginTop: spacing.sm }}>
        {isError ? 'We couldn’t confirm which services are available.' : 'RentOS offers stored balances and savings only where a licensed provider operates them.'}
      </Text>
      {isError && <TouchableOpacity accessibilityRole="button" onPress={() => void refetch()}><Text style={{ color: c.primary, paddingVertical: spacing.md }}>Retry</Text></TouchableOpacity>}
      {links.map((link) => (
        <TouchableOpacity key={link.path} accessibilityRole="button" onPress={() => router.push(link.path)}>
          <Text style={{ color: c.primary, paddingVertical: spacing.md, fontFamily: 'Outfit_600SemiBold' }}>{link.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}
