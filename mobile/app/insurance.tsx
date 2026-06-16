import { useState, useMemo } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useThemeColors, spacing } from '../lib/theme'
import { formatCurrency, formatDate } from '../lib/format'
import { api } from '../lib/api'

type Category = 'renters' | 'landlord' | 'rent_guarantee' | 'property_damage' | 'tenant_default'
type PolicyStatus = 'pending' | 'active' | 'lapsed' | 'cancelled' | 'claimed'

interface InsuranceProduct {
  id: string
  productName: string
  providerName: string
  category: Category
  description: string
  coverageDetails: string
  monthlyPremium: number
  coverageLimit: number
  excessAmount: number
  terms?: string
  active: boolean
}

interface InsuranceClaim {
  id: string
  description: string
  amount: number
  status: 'pending' | 'approved' | 'rejected' | 'paid'
}

interface InsurancePolicy {
  id: string
  productId: string
  policyNumber: string
  status: PolicyStatus
  monthlyPremium: number
  startDate: string
  endDate: string
  claims: InsuranceClaim[]
}

const CATEGORY_LABELS: Record<Category, string> = {
  renters: 'Renters',
  landlord: 'Landlord',
  rent_guarantee: 'Rent Guarantee',
  property_damage: 'Property Damage',
  tenant_default: 'Tenant Default',
}

const STATUS_COLORS: Record<PolicyStatus, string> = {
  pending: '#f59e0b',
  active: '#10b981',
  lapsed: '#6b7280',
  cancelled: '#6b7280',
  claimed: '#ef4444',
}

export default function InsuranceScreen() {
  const c = useThemeColors()
  const [tab, setTab] = useState<'browse' | 'policies'>('browse')

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={[s.tabs, { borderBottomColor: c.border }]}>
        <TabButton active={tab === 'browse'} onPress={() => setTab('browse')} c={c}>Browse</TabButton>
        <TabButton active={tab === 'policies'} onPress={() => setTab('policies')} c={c}>My Policies</TabButton>
      </View>
      {tab === 'browse' ? <BrowseTab /> : <PoliciesTab />}
    </View>
  )
}

function TabButton({
  active, onPress, children, c,
}: {
  active: boolean
  onPress: () => void
  children: React.ReactNode
  c: ReturnType<typeof useThemeColors>
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.tabBtn, active && { borderBottomColor: c.primary, borderBottomWidth: 2 }]}>
      <Text style={[s.tabText, { color: active ? c.primary : c.muted }]}>{children}</Text>
    </TouchableOpacity>
  )
}

function BrowseTab() {
  const c = useThemeColors()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Category | 'all'>('all')

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['insurance-products', filter],
    queryFn: () => {
      const qs = filter === 'all' ? '' : `?category=${filter}`
      return api.get<{ items: InsuranceProduct[] }>(`/insurance/products${qs}`)
    },
  })

  const products = data?.items ?? []

  const [selected, setSelected] = useState<InsuranceProduct | null>(null)
  const [buying, setBuying] = useState(false)

  async function buy() {
    if (!selected) return
    setBuying(true)
    try {
      await api.post('/insurance/policies', { productId: selected.id, termMonths: 12 })
      qc.invalidateQueries({ queryKey: ['insurance-policies'] })
      Alert.alert('Activated', `Policy "${selected.productName}" is now active.`)
      setSelected(null)
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to buy policy')
    } finally {
      setBuying(false)
    }
  }

  if (isLoading) {
    return (
      <View style={[s.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={c.primary} />}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingBottom: spacing.sm }}
        style={{ marginBottom: spacing.sm }}
      >
        <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} c={c} />
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
          <FilterChip
            key={cat}
            label={CATEGORY_LABELS[cat]}
            active={filter === cat}
            onPress={() => setFilter(cat)}
            c={c}
          />
        ))}
      </ScrollView>

      {products.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="shield-outline" size={48} color={c.muted} />
          <Text style={[s.emptyText, { color: c.muted }]}>No insurance products available</Text>
          <Text style={[s.emptySub, { color: c.muted }]}>Check back soon — new products are added regularly.</Text>
        </View>
      ) : (
        products.map((p) => (
          <View key={p.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={s.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>{p.productName}</Text>
                <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>{p.providerName}</Text>
              </View>
              <View style={[s.catBadge, { backgroundColor: c.primary + '15' }]}>
                <Text style={[s.catText, { color: c.primary }]}>{CATEGORY_LABELS[p.category]}</Text>
              </View>
            </View>

            <Text style={[s.desc, { color: c.muted }]} numberOfLines={3}>{p.description}</Text>

            <View style={s.statRow}>
              <View style={[s.statBox, { backgroundColor: c.surface }]}>
                <Text style={[s.statBoxLabel, { color: c.muted }]}>Premium</Text>
                <Text style={[s.statBoxValue, { color: c.primary }]}>{formatCurrency(p.monthlyPremium)}/mo</Text>
              </View>
              <View style={[s.statBox, { backgroundColor: c.surface }]}>
                <Text style={[s.statBoxLabel, { color: c.muted }]}>Coverage</Text>
                <Text style={[s.statBoxValue, { color: c.text }]}>{formatCurrency(p.coverageLimit)}</Text>
              </View>
            </View>

            <Text style={[s.coverageDetails, { color: c.muted }]} numberOfLines={3}>
              <Text style={{ fontFamily: 'Manrope_700Bold' }}>Includes: </Text>
              {p.coverageDetails}
            </Text>

            <TouchableOpacity
              style={[s.buyBtn, { backgroundColor: c.primary }]}
              onPress={() => setSelected(p)}
              activeOpacity={0.85}
            >
              <Ionicons name="shield-checkmark" size={16} color="#fff" />
              <Text style={s.buyBtnText}>Buy Policy</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>Confirm Policy Purchase</Text>
              <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[s.cardTitle, { color: c.text }]}>{selected.productName}</Text>
                <Text style={[s.cardSub, { color: c.muted, marginBottom: spacing.md }]}>{selected.providerName}</Text>

                <View style={[s.summaryBox, { backgroundColor: c.surface }]}>
                  <SummaryRow label="Monthly premium" value={formatCurrency(selected.monthlyPremium)} c={c} />
                  <SummaryRow label="Coverage limit" value={formatCurrency(selected.coverageLimit)} c={c} />
                  <SummaryRow label="Excess" value={formatCurrency(selected.excessAmount)} c={c} />
                  <SummaryRow label="Term" value="12 months" c={c} />
                </View>

                {selected.terms ? (
                  <View style={[s.termsBox, { backgroundColor: c.surface }]}>
                    <Text style={[s.termsLabel, { color: c.muted }]}>TERMS</Text>
                    <Text style={[s.termsText, { color: c.text }]}>{selected.terms}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[s.submitBtn, { backgroundColor: c.primary }, buying && { opacity: 0.6 }]}
                  onPress={buy}
                  disabled={buying}
                  activeOpacity={0.85}
                >
                  {buying ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.submitText}>Pay {formatCurrency(selected.monthlyPremium)}</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

function PoliciesTab() {
  const c = useThemeColors()
  const qc = useQueryClient()

  const { data: policiesData, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['insurance-policies'],
    queryFn: () => api.get<{ items: InsurancePolicy[] }>('/insurance/policies'),
  })

  const { data: productsData } = useQuery({
    queryKey: ['insurance-products', 'all'],
    queryFn: () => api.get<{ items: InsuranceProduct[] }>('/insurance/products?all=true'),
  })

  const policies = policiesData?.items ?? []
  const productsById = useMemo(() => {
    const m = new Map<string, InsuranceProduct>()
    for (const p of productsData?.items ?? []) m.set(p.id, p)
    return m
  }, [productsData])

  const [claimPolicy, setClaimPolicy] = useState<InsurancePolicy | null>(null)
  const [claimAmount, setClaimAmount] = useState('')
  const [claimDesc, setClaimDesc] = useState('')
  const [filing, setFiling] = useState(false)

  async function fileClaim() {
    if (!claimPolicy) return
    const amt = Number(claimAmount)
    if (!amt || amt <= 0) {
      Alert.alert('Invalid amount', 'Please enter a positive amount')
      return
    }
    if (claimDesc.trim().length < 10) {
      Alert.alert('Invalid description', 'Description must be at least 10 characters')
      return
    }
    setFiling(true)
    try {
      await api.post(`/insurance/policies/${claimPolicy.id}/claim`, {
        amount: amt,
        description: claimDesc.trim(),
      })
      qc.invalidateQueries({ queryKey: ['insurance-policies'] })
      Alert.alert('Filed', 'Claim submitted successfully')
      setClaimPolicy(null)
      setClaimAmount('')
      setClaimDesc('')
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to file claim')
    } finally {
      setFiling(false)
    }
  }

  if (isLoading) {
    return (
      <View style={[s.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={c.primary} />}
    >
      {policies.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="shield-outline" size={48} color={c.muted} />
          <Text style={[s.emptyText, { color: c.muted }]}>No policies yet</Text>
          <Text style={[s.emptySub, { color: c.muted }]}>Browse the marketplace to protect your home or rental investment.</Text>
        </View>
      ) : (
        policies.map((policy) => {
          const product = productsById.get(policy.productId)
          const canClaim = policy.status === 'active' || policy.status === 'claimed'
          return (
            <View key={policy.id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={s.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>
                    {product?.productName ?? 'Policy'}
                  </Text>
                  <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>
                    {product?.providerName ?? 'Insurance Provider'}
                  </Text>
                  <Text style={[s.policyNum, { color: c.muted }]}>{policy.policyNumber}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: STATUS_COLORS[policy.status] + '20' }]}>
                  <Text style={[s.statusText, { color: STATUS_COLORS[policy.status] }]}>{policy.status}</Text>
                </View>
              </View>

              <View style={s.statRow}>
                <View style={[s.statBox, { backgroundColor: c.surface, flex: 1 }]}>
                  <Text style={[s.statBoxLabel, { color: c.muted }]}>Premium</Text>
                  <Text style={[s.statBoxValue, { color: c.text }]}>{formatCurrency(policy.monthlyPremium)}</Text>
                </View>
                <View style={[s.statBox, { backgroundColor: c.surface, flex: 1 }]}>
                  <Text style={[s.statBoxLabel, { color: c.muted }]}>Started</Text>
                  <Text style={[s.statBoxValue, { color: c.text }]}>{formatDate(policy.startDate).split(',')[0]}</Text>
                </View>
                <View style={[s.statBox, { backgroundColor: c.surface, flex: 1 }]}>
                  <Text style={[s.statBoxLabel, { color: c.muted }]}>Ends</Text>
                  <Text style={[s.statBoxValue, { color: c.text }]}>{formatDate(policy.endDate).split(',')[0]}</Text>
                </View>
              </View>

              {policy.claims.length > 0 && (
                <View style={[s.claimsBox, { backgroundColor: c.surface }]}>
                  <Text style={[s.claimsLabel, { color: c.muted }]}>CLAIMS</Text>
                  {policy.claims.map((cl) => (
                    <View key={cl.id} style={s.claimRow}>
                      <Text style={[s.claimDesc, { color: c.text }]} numberOfLines={1}>{cl.description}</Text>
                      <Text style={[s.claimAmount, { color: c.text }]}>
                        {formatCurrency(cl.amount)} · {cl.status}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[s.claimBtn, { borderColor: canClaim ? c.primary : c.border }, !canClaim && { opacity: 0.5 }]}
                disabled={!canClaim}
                onPress={() => setClaimPolicy(policy)}
                activeOpacity={0.85}
              >
                <Ionicons name="warning-outline" size={14} color={canClaim ? c.primary : c.muted} />
                <Text style={[s.claimBtnText, { color: canClaim ? c.primary : c.muted }]}>File Claim</Text>
              </TouchableOpacity>
            </View>
          )
        })
      )}

      <Modal visible={!!claimPolicy} animationType="slide" transparent onRequestClose={() => setClaimPolicy(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>File Insurance Claim</Text>
              <TouchableOpacity onPress={() => setClaimPolicy(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {claimPolicy && (
                <View style={[s.summaryBox, { backgroundColor: c.surface, marginTop: 0 }]}>
                  <Text style={[s.termsLabel, { color: c.muted }]}>POLICY</Text>
                  <Text style={[s.policyNum, { color: c.text, fontSize: 13 }]}>{claimPolicy.policyNumber}</Text>
                </View>
              )}

              <Text style={[s.label, { color: c.text }]}>Claim Amount (GHS)</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                keyboardType="numeric"
                value={claimAmount}
                onChangeText={setClaimAmount}
                placeholder="0.00"
                placeholderTextColor={c.muted}
              />

              <Text style={[s.label, { color: c.text }]}>Description (min 10 chars)</Text>
              <TextInput
                style={[s.input, s.textArea, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                value={claimDesc}
                onChangeText={setClaimDesc}
                placeholder="Describe what happened..."
                placeholderTextColor={c.muted}
                multiline
                numberOfLines={4}
              />

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.primary }, filing && { opacity: 0.6 }]}
                onPress={fileClaim}
                disabled={filing}
                activeOpacity={0.85}
              >
                {filing ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Submit Claim</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

function FilterChip({
  label, active, onPress, c,
}: {
  label: string
  active: boolean
  onPress: () => void
  c: ReturnType<typeof useThemeColors>
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[s.filterChip, { backgroundColor: active ? c.primary : c.surface, borderColor: active ? c.primary : c.border }]}
    >
      <Text style={[s.filterChipText, { color: active ? '#fff' : c.text }]}>{label}</Text>
    </TouchableOpacity>
  )
}

function SummaryRow({ label, value, c }: { label: string; value: string; c: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={s.summaryRowItem}>
      <Text style={[s.summaryRowLabel, { color: c.muted }]}>{label}</Text>
      <Text style={[s.summaryRowValue, { color: c.text }]}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterChipText: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  emptySub: { fontSize: 12, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },

  card: { borderRadius: 14, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  cardSub: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  policyNum: { fontSize: 10, fontFamily: 'Manrope_500Medium', marginTop: 2 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  catText: { fontSize: 10, fontFamily: 'Manrope_700Bold' },
  desc: { fontSize: 12, fontFamily: 'Manrope_400Regular', lineHeight: 18 },

  statRow: { flexDirection: 'row', gap: 6 },
  statBox: { flex: 1, padding: 10, borderRadius: 8, gap: 2 },
  statBoxLabel: { fontSize: 9, fontFamily: 'Manrope_500Medium', textTransform: 'uppercase' },
  statBoxValue: { fontSize: 12, fontFamily: 'Manrope_700Bold' },

  coverageDetails: { fontSize: 11, fontFamily: 'Manrope_400Regular', lineHeight: 16 },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },

  buyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 10,
  },
  buyBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_600SemiBold' },

  claimsBox: { padding: 10, borderRadius: 8, gap: 4 },
  claimsLabel: { fontSize: 9, fontFamily: 'Manrope_700Bold', letterSpacing: 0.5 },
  claimRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  claimDesc: { fontSize: 11, fontFamily: 'Manrope_500Medium', flex: 1 },
  claimAmount: { fontSize: 11, fontFamily: 'Manrope_700Bold' },

  claimBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, paddingVertical: 9, borderRadius: 10,
  },
  claimBtnText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold', flex: 1, marginRight: spacing.md },
  summaryBox: { padding: spacing.md, borderRadius: 10, marginTop: spacing.md, gap: 6 },
  summaryRowItem: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryRowLabel: { fontSize: 12, fontFamily: 'Manrope_500Medium' },
  summaryRowValue: { fontSize: 12, fontFamily: 'Manrope_700Bold' },
  termsBox: { padding: spacing.md, borderRadius: 10, marginTop: spacing.md, gap: 6 },
  termsLabel: { fontSize: 9, fontFamily: 'Manrope_700Bold', letterSpacing: 0.5 },
  termsText: { fontSize: 12, fontFamily: 'Manrope_400Regular', lineHeight: 17 },
  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, fontFamily: 'Manrope_500Medium' },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12, marginTop: spacing.lg, marginBottom: spacing.md,
  },
  submitText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
})
