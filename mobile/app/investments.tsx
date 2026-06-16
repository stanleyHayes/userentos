import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, useIsDark, spacing } from '../lib/theme'
import { formatCurrency, formatCompact, formatDate } from '../lib/format'
import { api } from '../lib/api'

interface Investment {
  id: string; type: string; amount: number; interestRate: number; tenure: number
  startDate: string; maturityDate: string; status: string; expectedReturn: number; actualReturn?: number; partnerId: string
}

interface InvestmentOptions {
  partners: { id: string; name: string; types: string[] }[]
  rates: Record<string, Record<string, number>>
  disclaimer: string
}

const investmentTypes = [
  { value: 'treasury_bill', label: 'Treasury Bill' },
  { value: 'government_bond', label: 'Gov. Bond' },
]

export default function InvestmentsScreen() {
  const c = useThemeColors()
  const dark = useIsDark()
  const [investments, setInvestments] = useState<Investment[]>([])
  const [options, setOptions] = useState<InvestmentOptions | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  const statusColors: Record<string, { bg: string; text: string }> = {
    active: { bg: c.accent + '20', text: c.accent },
    matured: { bg: c.secondary + '20', text: c.secondary },
    withdrawn: { bg: c.muted + '20', text: c.muted },
    pending: { bg: c.warning + '20', text: c.warning },
  }

  const [showCreate, setShowCreate] = useState(false)
  const [type, setType] = useState('treasury_bill')
  const [tenure, setTenure] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [amount, setAmount] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null)

  async function load() {
    try {
      const [inv, opts] = await Promise.all([
        api.get<{ items: Investment[] }>('/investments'),
        api.get<InvestmentOptions>('/investments/options'),
      ])
      setInvestments(inv.items)
      setOptions(opts)
      if (opts.partners.length > 0 && !partnerId) setPartnerId(opts.partners[0].id)
      const tenureKeys = Object.keys(opts.rates['treasury_bill'] || {})
      if (tenureKeys.length > 0 && !tenure) setTenure(tenureKeys[0])
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  const active = investments.filter((i) => i.status === 'active')
  const totalInvested = active.reduce((s, i) => s + i.amount, 0)
  const totalExpected = active.reduce((s, i) => s + i.expectedReturn, 0)

  const rate = options?.rates[type]?.[tenure]
  const amountNum = Number(amount) || 0
  const expectedReturn = rate && amountNum > 0 ? amountNum * (rate / 100) * (Number(tenure) / 365) : 0

  const tenureOptions = Object.keys(options?.rates[type] || {}).map((d) => ({
    value: d, label: `${d} days (${options!.rates[type][d]}%)`,
  }))
  const filteredPartners = (options?.partners ?? []).filter((p) => p.types.includes(type))

  function resetCreateModal() {
    setShowCreate(false); setType('treasury_bill'); setAmount(''); setAccepted(false)
    if (options) {
      const tenureKeys = Object.keys(options.rates['treasury_bill'] || {})
      setTenure(tenureKeys[0] || ''); setPartnerId(options.partners[0]?.id ?? '')
    }
  }

  async function handleCreate() {
    if (!amount || isNaN(Number(amount)) || Number(amount) < 100) { Alert.alert('Error', 'Please enter an amount of at least GHS 100'); return }
    if (!tenure) { Alert.alert('Error', 'Please select a tenure'); return }
    if (!partnerId) { Alert.alert('Error', 'Please select a partner'); return }
    if (!accepted) { Alert.alert('Error', 'Please accept the risk disclosure'); return }
    setSubmitting(true)
    try {
      await api.post('/investments', { type, amount: Number(amount), tenure: Number(tenure), partnerId, riskDisclosureAccepted: accepted })
      resetCreateModal(); Alert.alert('Success', 'Investment created successfully'); await load()
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to create investment')
    } finally { setSubmitting(false) }
  }

  async function handleWithdraw(id: string) {
    Alert.alert('Withdraw', 'Are you sure you want to withdraw this investment?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Withdraw', onPress: async () => {
        setWithdrawingId(id)
        try { await api.post(`/investments/${id}/withdraw`, {}); Alert.alert('Success', 'Withdrawal successful'); await load() }
        catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message || 'Withdrawal failed')
    } finally { setWithdrawingId(null) }
      }},
    ])
  }

  if (loading) {
    return <View style={[s.loadingContainer, { backgroundColor: c.surface }]}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  const summaryStats = [
    { icon: 'trending-up-outline' as const, label: 'Total Invested', value: formatCompact(totalInvested), color: dark ? '#60a5fa' : '#1e3a5f' },
    { icon: 'sparkles-outline' as const, label: 'Expected Returns', value: formatCompact(totalExpected), color: dark ? '#34d399' : '#059669' },
    { icon: 'layers-outline' as const, label: 'Active', value: `${active.length}`, color: dark ? '#f59e0b' : '#d97706' },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView style={[s.container, { backgroundColor: c.surface }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}>
        {/* Summary Stat Strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.summaryStrip}>
          {summaryStats.map((stat) => (
            <View
              key={stat.label}
              style={[
                s.summaryCard,
                {
                  backgroundColor: stat.color + '0A',
                  borderLeftWidth: 3,
                  borderLeftColor: stat.color,
                  borderWidth: 1,
                  borderColor: stat.color + '18',
                  shadowColor: stat.color,
                  shadowOpacity: 0.10,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 3,
                },
              ]}
            >
              <View style={[s.summaryIconWrap, { backgroundColor: stat.color + '18' }]}>
                <Ionicons name={stat.icon} size={20} color={stat.color} />
              </View>
              <View style={s.summaryTextBlock}>
                <Text style={[s.summaryLabel, { color: c.muted }]}>{stat.label}</Text>
                <Text style={[s.summaryValue, { color: stat.color }]} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity style={[s.newBtn, { backgroundColor: c.accent }]} activeOpacity={0.85} onPress={() => setShowCreate(true)}>
          <Ionicons name="trending-up-outline" size={20} color="#ffffff" />
          <Text style={s.newBtnText}>New Investment</Text>
        </TouchableOpacity>

        {investments.length > 0 ? (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Your Investments</Text>
            {investments.map((inv) => {
              const sc = statusColors[inv.status] || statusColors.pending
              return (
                <View key={inv.id} style={[s.card, { backgroundColor: c.white }]}>
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.cardTitle, { color: c.primaryDark }]}>{inv.type.replace('_', ' ')}</Text>
                      <Text style={[s.cardMeta, { color: c.muted }]}>{inv.tenure} days at {inv.interestRate}% - Matures {formatDate(inv.maturityDate)}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: sc.bg }]}>
                      <Text style={[s.badgeText, { color: sc.text }]}>{inv.status}</Text>
                    </View>
                  </View>
                  <View style={s.cardAmountRow}>
                    <View>
                      <Text style={[s.cardAmountLabel, { color: c.muted }]}>Invested</Text>
                      <Text style={[s.cardAmount, { color: c.primary }]} numberOfLines={1} adjustsFontSizeToFit>{formatCompact(inv.amount)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.cardAmountLabel, { color: c.muted }]}>Return</Text>
                      <Text style={[s.cardReturn, { color: c.accent }]} numberOfLines={1} adjustsFontSizeToFit>+{formatCompact(inv.actualReturn ?? inv.expectedReturn)}</Text>
                    </View>
                  </View>
                  {inv.status === 'matured' && (
                    <TouchableOpacity style={[s.withdrawBtn, { backgroundColor: c.primary }]} onPress={() => handleWithdraw(inv.id)} disabled={withdrawingId === inv.id} activeOpacity={0.85}>
                      {withdrawingId === inv.id ? <ActivityIndicator color="#ffffff" size="small" /> : (
                        <><Ionicons name="wallet-outline" size={16} color="#ffffff" /><Text style={s.withdrawBtnText}>Withdraw to Wallet</Text></>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )
            })}
          </View>
        ) : (
          <View style={s.emptySection}>
            <Ionicons name="trending-up-outline" size={48} color={c.muted} />
            <Text style={[s.emptyText, { color: c.muted }]}>No investments yet</Text>
            <Text style={[s.emptySubtext, { color: c.muted }]}>Grow your savings with treasury bills and government bonds.</Text>
          </View>
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>New Investment</Text>
              <TouchableOpacity onPress={resetCreateModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.fieldLabel, { color: c.text }]}>Type</Text>
              <View style={s.optionsGroup}>
                {investmentTypes.map((t) => (
                  <TouchableOpacity key={t.value} style={[s.optionBtn, { backgroundColor: c.surface, borderColor: c.border }, type === t.value && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
                    onPress={() => { setType(t.value); const keys = Object.keys(options?.rates[t.value] || {}); setTenure(keys[0] || ''); const fp = (options?.partners ?? []).filter((p) => p.types.includes(t.value)); setPartnerId(fp[0]?.id ?? '') }}>
                    <Text style={[s.optionText, { color: c.text }, type === t.value && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[s.fieldLabel, { color: c.text }]}>Tenure</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.xs }}>
                <View style={s.optionsGroupScroll}>
                  {tenureOptions.map((t) => (
                    <TouchableOpacity key={t.value} style={[s.optionBtn, { flex: 0, paddingHorizontal: spacing.md, backgroundColor: c.surface, borderColor: c.border }, tenure === t.value && { borderColor: c.primary, backgroundColor: c.primary + '08' }]} onPress={() => setTenure(t.value)}>
                      <Text style={[s.optionText, { color: c.text }, tenure === t.value && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <Text style={[s.fieldLabel, { color: c.text }]}>Investment Partner</Text>
              <View style={s.optionsGroup}>
                {filteredPartners.map((p) => (
                  <TouchableOpacity key={p.id} style={[s.optionBtn, { backgroundColor: c.surface, borderColor: c.border }, partnerId === p.id && { borderColor: c.primary, backgroundColor: c.primary + '08' }]} onPress={() => setPartnerId(p.id)}>
                    <Text style={[s.optionText, { color: c.text }, partnerId === p.id && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[s.fieldLabel, { color: c.text }]}>Amount (GHS)</Text>
              <TextInput style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]} placeholder="Min. 100" placeholderTextColor={c.muted} keyboardType="numeric" value={amount} onChangeText={setAmount} />
              {amountNum > 0 && rate && (
                <View style={[s.returnCard, { backgroundColor: c.accent + '08', borderColor: c.accent + '30' }]}>
                  <Text style={[s.returnRow, { color: c.text }]}>Rate: <Text style={s.returnBold}>{rate}%</Text></Text>
                  <Text style={[s.returnRow, { color: c.text }]}>Expected return: <Text style={s.returnBold}>{formatCurrency(Math.round(expectedReturn * 100) / 100)}</Text></Text>
                  <Text style={[s.returnRowSub, { color: c.muted }]}>Total at maturity: {formatCurrency(amountNum + expectedReturn)}</Text>
                </View>
              )}
              {options?.disclaimer && (
                <View style={[s.disclaimerCard, { backgroundColor: c.warning + '08', borderColor: c.warning + '30' }]}>
                  <Ionicons name="warning-outline" size={16} color={c.warning} style={{ marginTop: 2 }} />
                  <Text style={[s.disclaimerText, { color: c.text }]}>{options.disclaimer}</Text>
                </View>
              )}
              <TouchableOpacity style={s.checkboxRow} onPress={() => setAccepted(!accepted)} activeOpacity={0.7}>
                <View style={[s.checkbox, { borderColor: c.border }, accepted && { backgroundColor: c.primary, borderColor: c.primary }]}>
                  {accepted && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                </View>
                <Text style={[s.checkboxLabel, { color: c.text }]}>I understand and accept the investment risks</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.submitBtn, { backgroundColor: c.primary }, (submitting || !accepted) && s.submitBtnDisabled]} onPress={handleCreate} disabled={submitting || !accepted} activeOpacity={0.85}>
                {submitting ? <ActivityIndicator color="#ffffff" /> : (
                  <><Ionicons name="checkmark-circle" size={18} color="#ffffff" /><Text style={s.submitBtnText}>Invest</Text></>
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
  summaryStrip: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs, gap: spacing.sm },
  summaryCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: spacing.md, minWidth: 170 },
  summaryIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  summaryTextBlock: { flex: 1 },
  summaryLabel: { fontSize: 11, fontFamily: 'Manrope_500Medium', marginBottom: 2 },
  summaryValue: { fontSize: 20, fontFamily: 'Manrope_800ExtraBold' },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: spacing.md, marginTop: spacing.md, paddingVertical: 12, borderRadius: 12 },
  newBtnText: { fontSize: 15, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },
  section: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  sectionTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', marginBottom: spacing.sm },
  card: { borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },
  cardMeta: { fontSize: 11, marginTop: 2, fontFamily: 'Manrope_400Regular' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },
  cardAmountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.xs },
  cardAmountLabel: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  cardAmount: { fontSize: 16, fontFamily: 'Manrope_700Bold' },
  cardReturn: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  withdrawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, marginTop: spacing.sm },
  withdrawBtnText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },
  emptySection: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
  emptySubtext: { fontSize: 12, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginBottom: spacing.sm, marginTop: spacing.md },
  input: { borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16, borderWidth: 1, fontFamily: 'Manrope_500Medium' },
  optionsGroup: { flexDirection: 'row', gap: spacing.sm },
  optionsGroupScroll: { flexDirection: 'row', gap: spacing.sm },
  optionBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5 },
  optionText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
  returnCard: { borderWidth: 1, borderRadius: 12, padding: spacing.md, marginTop: spacing.md },
  returnRow: { fontSize: 13, fontFamily: 'Manrope_400Regular', marginBottom: 4 },
  returnBold: { fontFamily: 'Manrope_700Bold' },
  returnRowSub: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 4 },
  disclaimerCard: { flexDirection: 'row', gap: spacing.sm, borderWidth: 1, borderRadius: 12, padding: spacing.md, marginTop: spacing.md },
  disclaimerText: { flex: 1, fontSize: 11, fontFamily: 'Manrope_400Regular' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkboxLabel: { flex: 1, fontSize: 13, fontFamily: 'Manrope_500Medium' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 16, marginTop: spacing.lg, marginBottom: spacing.md },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: '#ffffff' },
})
