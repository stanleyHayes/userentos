import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, useIsDark, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
import { formatCurrency, formatCompact, formatDate } from '../lib/format'
import { api } from '../lib/api'
import type { Investment, InvestmentOption } from '../types/shared'

interface InvestmentOptions {
  products: InvestmentOption[]
  disclaimer: string
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting partner', active: 'Active', redemption_requested: 'Redemption requested',
  matured: 'Paid out', withdrawn: 'Redeemed early', rejected: 'Declined — refunded',
}

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
    redemption_requested: { bg: c.warning + '20', text: c.warning },
    rejected: { bg: c.danger + '20', text: c.danger },
  }

  const [showCreate, setShowCreate] = useState(false)
  const [productId, setProductId] = useState('')
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
      if (opts.products.length > 0 && !productId) setProductId(opts.products[0].id)
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  const held = investments.filter((i) => i.status === 'active' || i.status === 'pending' || i.status === 'redemption_requested')
  const totalInvested = held.reduce((s, i) => s + i.amount, 0)
  const awaiting = investments.filter((i) => i.status === 'pending' || i.status === 'redemption_requested').length
  const products = options?.products ?? []
  const product = products.find((p) => p.id === productId)

  function resetCreateModal() {
    setShowCreate(false); setAmount(''); setAccepted(false); setProductId(products[0]?.id ?? '')
  }

  async function handleCreate() {
    if (!product) { Alert.alert('Error', 'Please select a product'); return }
    if (!amount || isNaN(Number(amount)) || Number(amount) < product.minAmount) { Alert.alert('Error', `Please enter at least ${formatCurrency(product.minAmount)}`); return }
    if (!accepted) { Alert.alert('Error', 'Please accept the risk disclosure'); return }
    setSubmitting(true)
    try {
      await api.post('/investments', { productId: product.id, amount: Number(amount), riskDisclosureAccepted: accepted })
      resetCreateModal(); Alert.alert('Order placed', `Your order was sent to ${product.partnerName}. It stays pending until they confirm it; if they decline, you are refunded.`); await load()
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to place the order')
    } finally { setSubmitting(false) }
  }

  async function handleWithdraw(id: string) {
    Alert.alert('Request redemption', 'The partner will redeem this investment on its terms. Early redemption may return less than you invested. You are paid when the partner settles.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Request', onPress: async () => {
        setWithdrawingId(id)
        try { await api.post(`/investments/${id}/withdraw`, {}); Alert.alert('Requested', 'You will be paid when the partner settles.'); await load() }
        catch (e) { Alert.alert('Error', (e as { message?: string }).message || 'Request failed') }
        finally { setWithdrawingId(null) }
      }},
    ])
  }

  if (loading) {
    return <View style={[s.loadingContainer, { backgroundColor: c.surface }]}><ActivityIndicator size="large" color={c.primary} /></View>
  }

  const summaryStats = [
    { icon: 'trending-up-outline' as const, label: 'Held with partners', value: formatCompact(totalInvested), color: dark ? '#60a5fa' : '#1e3a5f' },
    { icon: 'time-outline' as const, label: 'Awaiting partner', value: `${awaiting}`, color: dark ? '#f59e0b' : '#d97706' },
    { icon: 'layers-outline' as const, label: 'Active', value: `${investments.filter((i) => i.status === 'active').length}`, color: dark ? '#34d399' : '#059669' },
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

        {options?.disclaimer && (
          <View style={[s.disclaimerCard, { backgroundColor: c.warning + '08', borderColor: c.warning + '30', marginHorizontal: spacing.md }]}>
            <Ionicons name="warning-outline" size={16} color={c.warning} style={{ marginTop: 2 }} />
            <Text style={[s.disclaimerText, { color: c.text }]}>{options.disclaimer}</Text>
          </View>
        )}

        {products.length > 0 && (
          <TouchableOpacity style={[s.newBtn, { backgroundColor: c.accent }]} activeOpacity={0.85} onPress={() => setShowCreate(true)}>
            <Ionicons name="trending-up-outline" size={20} color="#ffffff" />
            <Text style={s.newBtnText}>New Investment</Text>
          </TouchableOpacity>
        )}

        {investments.length > 0 ? (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Your Investments</Text>
            {investments.map((inv) => {
              const sc = statusColors[inv.status] || statusColors.pending
              return (
                <View key={inv.id} style={[s.card, neuCard(c)]}>
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.cardTitle, { color: c.primaryDark }]}>{inv.type.replace('_', ' ')}{inv.partnerName ? ` · ${inv.partnerName}` : ''}</Text>
                      <Text style={[s.cardMeta, { color: c.muted }]}>{inv.tenure} days · indicative {inv.interestRate}% a year, not guaranteed{inv.status === 'active' ? ` · matures ${formatDate(inv.maturityDate)}` : ''}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: sc.bg }]}>
                      <Text style={[s.badgeText, { color: sc.text }]}>{STATUS_LABEL[inv.status] ?? inv.status}</Text>
                    </View>
                  </View>
                  <View style={s.cardAmountRow}>
                    <View>
                      <Text style={[s.cardAmountLabel, { color: c.muted }]}>Invested</Text>
                      <Text style={[s.cardAmount, { color: c.primary }]} numberOfLines={1} adjustsFontSizeToFit>{formatCompact(inv.amount)}</Text>
                    </View>
                    {inv.settledAmount != null && (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[s.cardAmountLabel, { color: c.muted }]}>Paid out</Text>
                        <Text style={[s.cardReturn, { color: c.accent }]} numberOfLines={1} adjustsFontSizeToFit>{formatCompact(inv.settledAmount)}</Text>
                      </View>
                    )}
                  </View>
                  {inv.rejectionReason && <Text style={[s.cardMeta, { color: c.muted }]}>Reason: {inv.rejectionReason}</Text>}
                  {inv.status === 'active' && (
                    <TouchableOpacity style={[s.withdrawBtn, { backgroundColor: c.primary }]} onPress={() => handleWithdraw(inv.id)} disabled={withdrawingId === inv.id} activeOpacity={0.85}>
                      {withdrawingId === inv.id ? <ActivityIndicator color="#ffffff" size="small" /> : (
                        <><Ionicons name="wallet-outline" size={16} color="#ffffff" /><Text style={s.withdrawBtnText}>Request redemption</Text></>
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
            <Text style={[s.emptySubtext, { color: c.muted }]}>{products.length ? 'Investments are placed with regulated partners. Returns are not guaranteed.' : 'No partner investment products are available right now.'}</Text>
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
              <Text style={[s.fieldLabel, { color: c.text }]}>Product</Text>
              <View style={s.optionsGroup}>
                {products.map((p) => (
                  <TouchableOpacity key={p.id} style={[s.optionBtn, { backgroundColor: c.surface, borderColor: c.border }, productId === p.id && { borderColor: c.primary, backgroundColor: c.primary + '08' }]} onPress={() => { setProductId(p.id); setAccepted(false) }}>
                    <Text style={[s.optionText, { color: c.text }, productId === p.id && { color: c.primary, fontFamily: 'Outfit_600SemiBold' }]}>{p.name} — {p.partnerName}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {product && (
                <View style={[s.returnCard, { backgroundColor: c.accent + '08', borderColor: c.accent + '30' }]}>
                  <Text style={[s.returnRow, { color: c.text }]}>Held by: <Text style={s.returnBold}>{product.partnerName}</Text> ({product.regulator} licence {product.partnerLicenseNumber})</Text>
                  <Text style={[s.returnRow, { color: c.text }]}>Term: <Text style={s.returnBold}>{product.tenureDays} days</Text> · minimum {formatCurrency(product.minAmount)}</Text>
                  {product.indicativeAnnualRate != null && <Text style={[s.returnRow, { color: c.text }]}>Partner's indicative rate: <Text style={s.returnBold}>{product.indicativeAnnualRate}% a year</Text> — not guaranteed</Text>}
                  <Text style={[s.returnRowSub, { color: c.muted }]}>{product.riskWarning}</Text>
                </View>
              )}
              <Text style={[s.fieldLabel, { color: c.text }]}>Amount (GHS)</Text>
              <TextInput style={[s.input, neuInset(c), { color: c.text }]} placeholder={product ? `Min. ${product.minAmount}` : ''} placeholderTextColor={c.muted} keyboardType="numeric" value={amount} onChangeText={setAmount} />
              <Text style={[s.returnRowSub, { color: c.muted, marginTop: spacing.sm }]}>Your money leaves your wallet for the partner. The order stays pending until the partner confirms it; if they decline, you are refunded.</Text>
              <TouchableOpacity style={s.checkboxRow} onPress={() => setAccepted(!accepted)} activeOpacity={0.7}>
                <View style={[s.checkbox, { borderColor: c.border }, accepted && { backgroundColor: c.primary, borderColor: c.primary }]}>
                  {accepted && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                </View>
                <Text style={[s.checkboxLabel, { color: c.text }]}>I understand returns are not guaranteed and I could get back less than I invest</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.submitBtn, { backgroundColor: c.primary }, (submitting || !accepted) && s.submitBtnDisabled]} onPress={handleCreate} disabled={submitting || !accepted} activeOpacity={0.85}>
                {submitting ? <ActivityIndicator color="#ffffff" /> : (
                  <><Ionicons name="checkmark-circle" size={18} color="#ffffff" /><Text style={s.submitBtnText}>Place order</Text></>
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
  summaryCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: spacing.md, minWidth: 170 },
  summaryIconWrap: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  summaryTextBlock: { flex: 1 },
  summaryLabel: { fontSize: 11, fontFamily: 'Outfit_500Medium', marginBottom: 2 },
  summaryValue: { fontSize: 20, fontFamily: 'Outfit_800ExtraBold' },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: spacing.md, marginTop: spacing.md, paddingVertical: 12, borderRadius: 10 },
  newBtnText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: '#ffffff' },
  section: { paddingHorizontal: spacing.md, marginTop: spacing.md },
  sectionTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', marginBottom: spacing.sm },
  card: { padding: spacing.md, marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardTitle: { fontSize: 14, fontFamily: 'Outfit_700Bold', textTransform: 'capitalize' },
  cardMeta: { fontSize: 11, marginTop: 2, fontFamily: 'Outfit_400Regular' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: 'Outfit_700Bold', textTransform: 'capitalize' },
  cardAmountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.xs },
  cardAmountLabel: { fontSize: 11, fontFamily: 'Outfit_400Regular' },
  cardAmount: { fontSize: 16, fontFamily: 'Outfit_700Bold' },
  cardReturn: { fontSize: 14, fontFamily: 'Outfit_600SemiBold' },
  withdrawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, marginTop: spacing.sm },
  withdrawBtnText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', color: '#ffffff' },
  emptySection: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Outfit_500Medium' },
  emptySubtext: { fontSize: 12, fontFamily: 'Outfit_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', marginBottom: spacing.sm, marginTop: spacing.md },
  input: { paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16, fontFamily: 'Outfit_500Medium' },
  optionsGroup: { flexDirection: 'row', gap: spacing.sm },
  optionsGroupScroll: { flexDirection: 'row', gap: spacing.sm },
  optionBtn: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5 },
  optionText: { fontSize: 14, fontFamily: 'Outfit_500Medium' },
  returnCard: { borderWidth: 1, borderRadius: 12, padding: spacing.md, marginTop: spacing.md },
  returnRow: { fontSize: 13, fontFamily: 'Outfit_400Regular', marginBottom: 4 },
  returnBold: { fontFamily: 'Outfit_700Bold' },
  returnRowSub: { fontSize: 11, fontFamily: 'Outfit_400Regular', marginTop: 4 },
  disclaimerCard: { flexDirection: 'row', gap: spacing.sm, borderWidth: 1, borderRadius: 12, padding: spacing.md, marginTop: spacing.md },
  disclaimerText: { flex: 1, fontSize: 11, fontFamily: 'Outfit_400Regular' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkboxLabel: { flex: 1, fontSize: 13, fontFamily: 'Outfit_500Medium' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 16, marginTop: spacing.lg, marginBottom: spacing.md },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#ffffff' },
})
