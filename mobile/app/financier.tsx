import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
import { formatCurrency, formatCompact } from '../lib/format'
import { api } from '../lib/api'

interface FinancingOffer {
  id: string
  name: string
  description: string
  productType: string
  annualInterestRate: number
  processingFeePct: number
  lateFeePct: number
  minAmount: number
  maxAmount: number
  minTenureMonths: number
  maxTenureMonths: number
  minCreditScore: number
  requiresEmployment: boolean
  requiresPayrollDeduction: boolean
  active: boolean
}

interface Application {
  id: string
  applicantName?: string
  applicantId: string
  offerId: string
  amountRequested: number
  tenureMonths: number
  purpose: string
  status: string
  creditScoreAtApply?: number
  monthlyIncomeAtApply?: number
  willUsePayrollDeduction: boolean
}

interface Contract {
  id: string
  applicantName?: string
  applicantId: string
  productType: string
  principal: number
  annualInterestRate: number
  tenureMonths: number
  monthlyPayment: number
  totalRepayable: number
  amountRepaid: number
  status: string
  signedByApplicant: boolean
}

interface ItemsResponse<T> { items: T[] }

interface PortfolioStats {
  totalDisbursed: number
  totalRepaid: number
  outstanding: number
  activeContracts: number
  settledContracts: number
  defaultedContracts: number
  inArrearsContracts: number
  pendingApplications: number
  contractCount: number
  defaultRate: number
}

interface CollectionItem {
  id: string
  applicantId: string
  applicantName?: string
  status: string
  principal: number
  outstanding: number
  daysOverdue: number
  lastReminderAt?: string
}

type Tab = 'offers' | 'applications' | 'contracts' | 'collections'

const productTypes = [
  { value: 'rent_advance', label: 'Rent advance' },
  { value: 'deposit_loan', label: 'Deposit loan' },
  { value: 'rent_to_own', label: 'Rent-to-own' },
]

export default function FinancierScreen() {
  const c = useThemeColors()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('offers')

  const offersQ = useQuery({
    queryKey: ['financing-offers-mine'],
    queryFn: () => api.get<ItemsResponse<FinancingOffer>>('/financing/offers/mine'),
  })
  const appsQ = useQuery({
    queryKey: ['financing-applications'],
    queryFn: () => api.get<ItemsResponse<Application>>('/financing/applications'),
  })
  const contractsQ = useQuery({
    queryKey: ['financing-contracts'],
    queryFn: () => api.get<ItemsResponse<Contract>>('/financing/contracts'),
  })
  const portfolioQ = useQuery({
    queryKey: ['financing-portfolio'],
    queryFn: () => api.get<PortfolioStats>('/financing/portfolio'),
  })
  const collectionsQ = useQuery({
    queryKey: ['financing-collections'],
    queryFn: () => api.get<ItemsResponse<CollectionItem>>('/financing/collections'),
  })

  const offers = offersQ.data?.items ?? []
  const applications = appsQ.data?.items ?? []
  const contracts = contractsQ.data?.items ?? []
  const portfolio = portfolioQ.data
  const collections = collectionsQ.data?.items ?? []

  const activeOffers = offers.filter((o) => o.active).length
  const pendingApps = applications.filter((a) => a.status === 'submitted' || a.status === 'under_review').length
  const activeContracts = contracts.filter((cn) => cn.status === 'active').length

  const appStatusConfig: Record<string, { bg: string; text: string }> = {
    submitted: { bg: c.warning + '15', text: c.warning },
    under_review: { bg: c.warning + '15', text: c.warning },
    approved: { bg: c.accent + '15', text: c.accent },
    rejected: { bg: c.danger + '15', text: c.danger },
    withdrawn: { bg: c.surface, text: c.muted },
    draft: { bg: c.surface, text: c.muted },
  }
  const contractStatusConfig: Record<string, { bg: string; text: string }> = {
    pending_disbursement: { bg: c.warning + '15', text: c.warning },
    active: { bg: c.primary + '15', text: c.primary },
    in_grace: { bg: c.warning + '15', text: c.warning },
    in_arrears: { bg: c.danger + '15', text: c.danger },
    defaulted: { bg: c.danger + '15', text: c.danger },
    settled: { bg: c.accent + '15', text: c.accent },
    closed: { bg: c.surface, text: c.muted },
  }

  // ── Create offer modal ──
  const [showCreate, setShowCreate] = useState(false)
  const [fName, setFName] = useState('')
  const [fType, setFType] = useState('rent_advance')
  const [fDesc, setFDesc] = useState('')
  const [fMinAmount, setFMinAmount] = useState('')
  const [fMaxAmount, setFMaxAmount] = useState('')
  const [fMinTenure, setFMinTenure] = useState('')
  const [fMaxTenure, setFMaxTenure] = useState('')
  const [fRate, setFRate] = useState('')
  const [fFee, setFFee] = useState('0')
  const [fLateFee, setFLateFee] = useState('0')
  const [fMinCredit, setFMinCredit] = useState('0')
  const [fReqEmployment, setFReqEmployment] = useState(true)
  const [fReqPayroll, setFReqPayroll] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  function resetCreate() {
    setShowCreate(false)
    setFName(''); setFType('rent_advance'); setFDesc('')
    setFMinAmount(''); setFMaxAmount(''); setFMinTenure(''); setFMaxTenure('')
    setFRate(''); setFFee('0'); setFLateFee('0'); setFMinCredit('0')
    setFReqEmployment(true); setFReqPayroll(false)
  }

  async function submitCreate() {
    const minAmount = Number(fMinAmount)
    const maxAmount = Number(fMaxAmount)
    const minTenure = Number(fMinTenure)
    const maxTenure = Number(fMaxTenure)
    const rate = Number(fRate)
    const fee = Number(fFee) || 0
    const lateFee = Number(fLateFee) || 0
    const minCredit = Number(fMinCredit) || 0
    if (fName.trim().length < 3) { Alert.alert('Invalid name', 'Name must be at least 3 characters'); return }
    if (!minAmount || minAmount < 50 || !maxAmount || maxAmount < 50) { Alert.alert('Invalid amount', 'Min and max amounts must be at least GHS 50'); return }
    if (maxAmount < minAmount) { Alert.alert('Invalid amount', 'Max amount must be ≥ min amount'); return }
    if (!Number.isInteger(minTenure) || minTenure < 1 || minTenure > 60 || !Number.isInteger(maxTenure) || maxTenure < 1 || maxTenure > 60) {
      Alert.alert('Invalid tenure', 'Tenure must be whole months between 1 and 60'); return
    }
    if (maxTenure < minTenure) { Alert.alert('Invalid tenure', 'Max tenure must be ≥ min tenure'); return }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) { Alert.alert('Invalid rate', 'APR must be between 0 and 100'); return }
    if (fee < 0 || fee > 20) { Alert.alert('Invalid fee', 'Processing fee must be between 0 and 20%'); return }
    if (lateFee < 0 || lateFee > 50) { Alert.alert('Invalid fee', 'Late fee must be between 0 and 50%'); return }
    setCreating(true)
    try {
      await api.post('/financing/offers', {
        name: fName.trim(),
        productType: fType,
        description: fDesc.trim(),
        minAmount, maxAmount,
        minTenureMonths: minTenure, maxTenureMonths: maxTenure,
        annualInterestRate: rate,
        processingFeePct: fee,
        lateFeePct: lateFee,
        minCreditScore: minCredit,
        requiresEmployment: fReqEmployment,
        requiresPayrollDeduction: fReqPayroll,
      })
      qc.invalidateQueries({ queryKey: ['financing-offers-mine'] })
      Alert.alert('Created', 'Your offer is now live')
      resetCreate()
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to create offer')
    } finally {
      setCreating(false)
    }
  }

  async function toggleOffer(offer: FinancingOffer) {
    setBusyId(offer.id)
    try {
      await api.patch(`/financing/offers/${offer.id}`, { active: !offer.active })
      qc.invalidateQueries({ queryKey: ['financing-offers-mine'] })
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to update offer')
    } finally {
      setBusyId(null)
    }
  }

  function decideApplication(app: Application, approve: boolean) {
    Alert.alert(
      approve ? 'Approve Application' : 'Reject Application',
      approve
        ? `Approve ${formatCurrency(app.amountRequested)} for ${app.applicantName ?? 'this applicant'}? This creates a contract.`
        : 'Reject this application?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approve ? 'Approve' : 'Reject',
          style: approve ? 'default' : 'destructive',
          onPress: async () => {
            setBusyId(app.id)
            try {
              await api.post(`/financing/applications/${app.id}/${approve ? 'approve' : 'reject'}`, {})
              qc.invalidateQueries({ queryKey: ['financing-applications'] })
              qc.invalidateQueries({ queryKey: ['financing-contracts'] })
            } catch (e) {
              Alert.alert('Error', (e as { message?: string }).message ?? 'Action failed')
            } finally {
              setBusyId(null)
            }
          },
        },
      ],
    )
  }

  function disburse(contract: Contract) {
    Alert.alert(
      'Disburse Funds',
      `Disburse ${formatCurrency(contract.principal)} to ${contract.applicantName ?? 'the applicant'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disburse',
          onPress: async () => {
            setBusyId(contract.id)
            try {
              await api.post(`/financing/contracts/${contract.id}/disburse`, {})
              qc.invalidateQueries({ queryKey: ['financing-contracts'] })
              Alert.alert('Disbursed', 'Funds have been disbursed')
            } catch (e) {
              Alert.alert('Error', (e as { message?: string }).message ?? 'Disbursement failed')
            } finally {
              setBusyId(null)
            }
          },
        },
      ],
    )
  }

  function remind(item: CollectionItem) {
    Alert.alert(
      'Send Reminder',
      `Send a payment reminder to ${item.applicantName ?? 'the borrower'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remind',
          onPress: async () => {
            setBusyId(item.id)
            try {
              await api.post(`/financing/contracts/${item.id}/remind`, {})
              qc.invalidateQueries({ queryKey: ['financing-collections'] })
              qc.invalidateQueries({ queryKey: ['financing-portfolio'] })
              Alert.alert('Reminder sent', 'The borrower has been notified')
            } catch (e) {
              Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to send reminder')
            } finally {
              setBusyId(null)
            }
          },
        },
      ],
    )
  }

  const activeQuery = tab === 'offers' ? offersQ : tab === 'applications' ? appsQ : tab === 'contracts' ? contractsQ : collectionsQ
  if (offersQ.isLoading && appsQ.isLoading && contractsQ.isLoading) {
    return (
      <View style={[s.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  const stats = [
    { icon: 'pricetags-outline' as const, label: 'Active Offers', value: String(activeOffers), color: c.primary },
    { icon: 'time-outline' as const, label: 'Pending Apps', value: String(pendingApps), color: c.warning },
    { icon: 'document-text-outline' as const, label: 'Active Contracts', value: String(activeContracts), color: c.accent },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
        refreshControl={
          <RefreshControl
            refreshing={activeQuery.isRefetching}
            onRefresh={() => activeQuery.refetch()}
            tintColor={c.primary}
          />
        }
      >
        {/* Stats */}
        <View style={s.statsRow}>
          {stats.map((stat) => (
            <View key={stat.label} style={[s.stat, neuCard(c), { borderLeftWidth: 3, borderLeftColor: stat.color }]}>
              <View style={[s.statIcon, { backgroundColor: stat.color + '18' }]}>
                <Ionicons name={stat.icon} size={16} color={stat.color} />
              </View>
              <Text style={[s.statValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
              <Text style={[s.statLabel, { color: c.muted }]} numberOfLines={1}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Portfolio stats */}
        {portfolio && (
          <View style={s.statsRow}>
            {([
              { icon: 'cash-outline' as const, label: 'Disbursed', caption: `${portfolio.contractCount} contracts`, value: formatCompact(portfolio.totalDisbursed), color: c.primary },
              { icon: 'hourglass-outline' as const, label: 'Outstanding', caption: `${portfolio.activeContracts} active`, value: formatCompact(portfolio.outstanding), color: c.warning },
              { icon: 'checkmark-done-outline' as const, label: 'Repaid', caption: `${portfolio.settledContracts} settled`, value: formatCompact(portfolio.totalRepaid), color: c.accent },
              { icon: 'alert-circle-outline' as const, label: 'Default rate', caption: `${portfolio.defaultedContracts} defaulted`, value: `${portfolio.defaultRate}%`, color: portfolio.defaultRate > 5 ? c.danger : c.accent },
            ]).map((stat) => (
              <View key={stat.label} style={[s.stat, neuCard(c), { borderLeftWidth: 3, borderLeftColor: stat.color }]}>
                <View style={[s.statIcon, { backgroundColor: stat.color + '18' }]}>
                  <Ionicons name={stat.icon} size={16} color={stat.color} />
                </View>
                <Text style={[s.statValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
                <Text style={[s.statLabel, { color: c.muted }]} numberOfLines={1}>{stat.label}</Text>
                <Text style={[s.statCaption, { color: c.muted }]} numberOfLines={1}>{stat.caption}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Segments */}
        <View style={[s.segment, neuInset(c)]}>
          {([['offers', 'Offers'], ['applications', 'Applications'], ['contracts', 'Contracts'], ['collections', 'Collections']] as [Tab, string][]).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[s.segmentBtn, tab === key && { backgroundColor: c.card }]}
              onPress={() => setTab(key)}
              activeOpacity={0.8}
            >
              <Text style={[s.segmentText, { color: tab === key ? c.primary : c.muted }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Offers ── */}
        {tab === 'offers' && (
          <>
            <TouchableOpacity
              style={[s.newBtn, { backgroundColor: c.primary }]}
              onPress={() => setShowCreate(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={s.newBtnText}>Create Offer</Text>
            </TouchableOpacity>

            {offersQ.isLoading ? (
              <ActivityIndicator color={c.primary} style={{ marginTop: spacing.xl }} />
            ) : offers.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="pricetags-outline" size={48} color={c.muted} />
                <Text style={[s.emptyText, { color: c.muted }]}>No offers yet</Text>
                <Text style={[s.emptySub, { color: c.muted }]}>Create your first financing offer to start receiving applications.</Text>
              </View>
            ) : (
              offers.map((o) => (
                <View key={o.id} style={[s.card, neuCard(c)]}>
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>{o.name}</Text>
                      <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>{o.productType.replace(/_/g, ' ')}</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: o.active ? c.accent + '15' : c.surface }]}>
                      <View style={[s.badgeDot, { backgroundColor: o.active ? c.accent : c.muted }]} />
                      <Text style={[s.badgeText, { color: o.active ? c.accent : c.muted }]}>{o.active ? 'Active' : 'Paused'}</Text>
                    </View>
                  </View>

                  <View style={s.rows}>
                    <Row label="Rate" value={`${o.annualInterestRate}% APR`} c={c} />
                    <Row label="Amount" value={`${formatCompact(o.minAmount)} – ${formatCompact(o.maxAmount)}`} c={c} />
                    <Row label="Tenure" value={`${o.minTenureMonths}–${o.maxTenureMonths} mo`} c={c} />
                    <Row label="Fees" value={`${o.processingFeePct}% processing · ${o.lateFeePct}% late`} c={c} />
                    <Row label="Min credit" value={String(o.minCreditScore)} c={c} />
                  </View>

                  <View style={s.tagRow}>
                    {o.requiresEmployment && (
                      <View style={[s.tag, { backgroundColor: c.surface }]}>
                        <Text style={[s.tagText, { color: c.muted }]}>Employment required</Text>
                      </View>
                    )}
                    {o.requiresPayrollDeduction && (
                      <View style={[s.tag, { backgroundColor: c.warning + '20' }]}>
                        <Ionicons name="sparkles" size={10} color={c.warning} />
                        <Text style={[s.tagText, { color: c.warning }]}>Payroll deduction</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[s.toggleBtn, { borderColor: o.active ? c.warning : c.accent }]}
                    onPress={() => toggleOffer(o)}
                    disabled={busyId === o.id}
                    activeOpacity={0.85}
                  >
                    {busyId === o.id ? (
                      <ActivityIndicator size="small" color={o.active ? c.warning : c.accent} />
                    ) : (
                      <>
                        <Ionicons name={o.active ? 'pause-circle-outline' : 'play-circle-outline'} size={16} color={o.active ? c.warning : c.accent} />
                        <Text style={[s.toggleBtnText, { color: o.active ? c.warning : c.accent }]}>
                          {o.active ? 'Deactivate' : 'Activate'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}

        {/* ── Applications ── */}
        {tab === 'applications' && (
          appsQ.isLoading ? (
            <ActivityIndicator color={c.primary} style={{ marginTop: spacing.xl }} />
          ) : applications.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="document-text-outline" size={48} color={c.muted} />
              <Text style={[s.emptyText, { color: c.muted }]}>No applications</Text>
              <Text style={[s.emptySub, { color: c.muted }]}>Applications to your offers will appear here.</Text>
            </View>
          ) : (
            applications.map((a) => {
              const sc = appStatusConfig[a.status] ?? appStatusConfig.submitted
              const decidable = a.status === 'submitted' || a.status === 'under_review'
              const offer = offers.find((o) => o.id === a.offerId)
              return (
                <View key={a.id} style={[s.card, neuCard(c)]}>
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>
                        {a.applicantName ?? `Applicant #${a.applicantId.slice(-6)}`}
                      </Text>
                      <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>
                        {offer?.name ?? 'Financing offer'} · {a.tenureMonths} mo
                      </Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: sc.bg }]}>
                      <View style={[s.badgeDot, { backgroundColor: sc.text }]} />
                      <Text style={[s.badgeText, { color: sc.text }]}>{a.status.replace(/_/g, ' ')}</Text>
                    </View>
                  </View>

                  <View style={s.rows}>
                    <Row label="Amount requested" value={formatCurrency(a.amountRequested)} c={c} />
                    {a.creditScoreAtApply != null && <Row label="Credit score" value={String(a.creditScoreAtApply)} c={c} />}
                    {a.monthlyIncomeAtApply != null && <Row label="Monthly income" value={formatCurrency(a.monthlyIncomeAtApply)} c={c} />}
                  </View>

                  <Text style={[s.desc, { color: c.muted }]} numberOfLines={2}>{a.purpose}</Text>

                  {a.willUsePayrollDeduction && (
                    <View style={s.tagRow}>
                      <View style={[s.tag, { backgroundColor: c.warning + '20' }]}>
                        <Ionicons name="sparkles" size={10} color={c.warning} />
                        <Text style={[s.tagText, { color: c.warning }]}>Payroll deduction</Text>
                      </View>
                    </View>
                  )}

                  {decidable && (
                    <View style={s.actionRow}>
                      <TouchableOpacity
                        style={[s.actionBtnOutline, { borderColor: c.danger }]}
                        onPress={() => decideApplication(a, false)}
                        disabled={busyId === a.id}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="close-circle-outline" size={16} color={c.danger} />
                        <Text style={[s.actionBtnOutlineText, { color: c.danger }]}>Reject</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actionBtnSolid, { backgroundColor: c.accent }]}
                        onPress={() => decideApplication(a, true)}
                        disabled={busyId === a.id}
                        activeOpacity={0.85}
                      >
                        {busyId === a.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                            <Text style={s.actionBtnSolidText}>Approve</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )
            })
          )
        )}

        {/* ── Contracts ── */}
        {tab === 'contracts' && (
          contractsQ.isLoading ? (
            <ActivityIndicator color={c.primary} style={{ marginTop: spacing.xl }} />
          ) : contracts.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="briefcase-outline" size={48} color={c.muted} />
              <Text style={[s.emptyText, { color: c.muted }]}>No contracts</Text>
              <Text style={[s.emptySub, { color: c.muted }]}>Approved applications become contracts here.</Text>
            </View>
          ) : (
            contracts.map((cn) => {
              const sc = contractStatusConfig[cn.status] ?? contractStatusConfig.closed
              const outstanding = Math.max(0, cn.totalRepayable - cn.amountRepaid)
              const pct = cn.totalRepayable > 0 ? Math.min(100, Math.round((cn.amountRepaid / cn.totalRepayable) * 100)) : 0
              const disbursable = cn.status === 'pending_disbursement' && cn.signedByApplicant
              return (
                <View key={cn.id} style={[s.card, neuCard(c)]}>
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>
                        {cn.applicantName ?? `Applicant #${cn.applicantId.slice(-6)}`}
                      </Text>
                      <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>
                        {cn.productType.replace(/_/g, ' ')} · {cn.tenureMonths} mo · {cn.annualInterestRate}% APR
                      </Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: sc.bg }]}>
                      <View style={[s.badgeDot, { backgroundColor: sc.text }]} />
                      <Text style={[s.badgeText, { color: sc.text }]}>{cn.status.replace(/_/g, ' ')}</Text>
                    </View>
                  </View>

                  <View style={s.rows}>
                    <Row label="Principal" value={formatCurrency(cn.principal)} c={c} />
                    <Row label="Monthly payment" value={formatCurrency(cn.monthlyPayment)} c={c} />
                    <Row label="Repaid" value={formatCompact(cn.amountRepaid)} c={c} />
                    <Row label="Outstanding" value={formatCompact(outstanding)} c={c} />
                  </View>

                  {cn.status !== 'pending_disbursement' && (
                    <>
                      <View style={s.progressHeader}>
                        <Text style={[s.progressLabel, { color: c.muted }]}>Repayment</Text>
                        <Text style={[s.progressPct, { color: c.primary }]}>{pct}%</Text>
                      </View>
                      <View style={[s.progressBar, { backgroundColor: c.surface }]}>
                        <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: pct >= 100 ? c.accent : c.primary }]} />
                      </View>
                    </>
                  )}

                  {cn.status === 'pending_disbursement' && !cn.signedByApplicant && (
                    <View style={s.tagRow}>
                      <View style={[s.tag, { backgroundColor: c.surface }]}>
                        <Ionicons name="hourglass-outline" size={10} color={c.muted} />
                        <Text style={[s.tagText, { color: c.muted }]}>Awaiting applicant signature</Text>
                      </View>
                    </View>
                  )}

                  {disbursable && (
                    <TouchableOpacity
                      style={[s.actionBtnSolid, { backgroundColor: c.primary }]}
                      onPress={() => disburse(cn)}
                      disabled={busyId === cn.id}
                      activeOpacity={0.85}
                    >
                      {busyId === cn.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="wallet-outline" size={16} color="#fff" />
                          <Text style={s.actionBtnSolidText}>Disburse {formatCompact(cn.principal)}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )
            })
          )
        )}

        {/* ── Collections ── */}
        {tab === 'collections' && (
          collectionsQ.isLoading ? (
            <ActivityIndicator color={c.primary} style={{ marginTop: spacing.xl }} />
          ) : collections.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="checkmark-circle-outline" size={48} color={c.muted} />
              <Text style={[s.emptyText, { color: c.muted }]}>No overdue contracts</Text>
              <Text style={[s.emptySub, { color: c.muted }]}>Contracts in grace, arrears, or default will appear here.</Text>
            </View>
          ) : (
            collections.map((item) => {
              const sc = contractStatusConfig[item.status] ?? contractStatusConfig.in_arrears
              return (
                <View key={item.id} style={[s.card, neuCard(c)]}>
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>
                        {item.applicantName ?? `Applicant #${item.applicantId.slice(-6)}`}
                      </Text>
                      <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>
                        {item.status.replace(/_/g, ' ')}
                      </Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: item.daysOverdue > 0 ? c.danger + '15' : sc.bg }]}>
                      <View style={[s.badgeDot, { backgroundColor: item.daysOverdue > 0 ? c.danger : sc.text }]} />
                      <Text style={[s.badgeText, { color: item.daysOverdue > 0 ? c.danger : sc.text }]}>
                        {item.daysOverdue > 0 ? `${item.daysOverdue}d overdue` : item.status.replace(/_/g, ' ')}
                      </Text>
                    </View>
                  </View>

                  <View style={s.rows}>
                    <Row label="Principal" value={formatCurrency(item.principal)} c={c} />
                    <Row label="Outstanding" value={formatCurrency(item.outstanding)} c={c} />
                  </View>

                  <TouchableOpacity
                    style={[s.actionBtnOutline, { borderColor: c.warning }]}
                    onPress={() => remind(item)}
                    disabled={busyId === item.id}
                    activeOpacity={0.85}
                  >
                    {busyId === item.id ? (
                      <ActivityIndicator size="small" color={c.warning} />
                    ) : (
                      <>
                        <Ionicons name="notifications-outline" size={16} color={c.warning} />
                        <Text style={[s.actionBtnOutlineText, { color: c.warning }]}>Remind</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )
            })
          )
        )}
      </ScrollView>

      {/* Create offer modal */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={resetCreate}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>Create Financing Offer</Text>
              <TouchableOpacity onPress={resetCreate} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.label, { color: c.text }]}>Offer name</Text>
              <TextInput
                style={[s.input, neuInset(c), { color: c.text }]}
                value={fName}
                onChangeText={setFName}
                placeholder="e.g. Quick Rent Advance"
                placeholderTextColor={c.muted}
              />

              <Text style={[s.label, { color: c.text }]}>Product type</Text>
              <View style={s.optionsGroup}>
                {productTypes.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={[
                      s.optionBtn,
                      { backgroundColor: c.surface, borderColor: c.border },
                      fType === t.value && { borderColor: c.primary, backgroundColor: c.primary + '08' },
                    ]}
                    onPress={() => setFType(t.value)}
                  >
                    <Text style={[s.optionText, { color: c.text }, fType === t.value && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.label, { color: c.text }]}>Description</Text>
              <TextInput
                style={[s.input, s.textArea, neuInset(c), { color: c.text }]}
                multiline
                numberOfLines={2}
                value={fDesc}
                onChangeText={setFDesc}
                placeholder="What does this offer cover?"
                placeholderTextColor={c.muted}
              />

              <View style={s.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: c.text }]}>Min amount (GHS)</Text>
                  <TextInput style={[s.input, neuInset(c), { color: c.text }]} keyboardType="numeric" value={fMinAmount} onChangeText={setFMinAmount} placeholder="50" placeholderTextColor={c.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: c.text }]}>Max amount (GHS)</Text>
                  <TextInput style={[s.input, neuInset(c), { color: c.text }]} keyboardType="numeric" value={fMaxAmount} onChangeText={setFMaxAmount} placeholder="5000" placeholderTextColor={c.muted} />
                </View>
              </View>

              <View style={s.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: c.text }]}>Min tenure (mo)</Text>
                  <TextInput style={[s.input, neuInset(c), { color: c.text }]} keyboardType="numeric" value={fMinTenure} onChangeText={setFMinTenure} placeholder="1" placeholderTextColor={c.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: c.text }]}>Max tenure (mo)</Text>
                  <TextInput style={[s.input, neuInset(c), { color: c.text }]} keyboardType="numeric" value={fMaxTenure} onChangeText={setFMaxTenure} placeholder="12" placeholderTextColor={c.muted} />
                </View>
              </View>

              <View style={s.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: c.text }]}>APR (%)</Text>
                  <TextInput style={[s.input, neuInset(c), { color: c.text }]} keyboardType="numeric" value={fRate} onChangeText={setFRate} placeholder="15" placeholderTextColor={c.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: c.text }]}>Min credit score</Text>
                  <TextInput style={[s.input, neuInset(c), { color: c.text }]} keyboardType="numeric" value={fMinCredit} onChangeText={setFMinCredit} placeholder="0" placeholderTextColor={c.muted} />
                </View>
              </View>

              <View style={s.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: c.text }]}>Processing fee (%)</Text>
                  <TextInput style={[s.input, neuInset(c), { color: c.text }]} keyboardType="numeric" value={fFee} onChangeText={setFFee} placeholder="0" placeholderTextColor={c.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: c.text }]}>Late fee (%)</Text>
                  <TextInput style={[s.input, neuInset(c), { color: c.text }]} keyboardType="numeric" value={fLateFee} onChangeText={setFLateFee} placeholder="0" placeholderTextColor={c.muted} />
                </View>
              </View>

              <TouchableOpacity style={s.checkboxRow} onPress={() => setFReqEmployment(!fReqEmployment)} activeOpacity={0.7}>
                <View style={[s.checkbox, { borderColor: c.border, backgroundColor: fReqEmployment ? c.primary : 'transparent' }]}>
                  {fReqEmployment && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[s.checkboxLabel, { color: c.text }]}>Requires verified employment</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.checkboxRow} onPress={() => setFReqPayroll(!fReqPayroll)} activeOpacity={0.7}>
                <View style={[s.checkbox, { borderColor: c.border, backgroundColor: fReqPayroll ? c.primary : 'transparent' }]}>
                  {fReqPayroll && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[s.checkboxLabel, { color: c.text }]}>Requires payroll deduction</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.primary }, creating && s.submitDisabled]}
                onPress={submitCreate}
                disabled={creating}
                activeOpacity={0.85}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={16} color="#fff" />
                    <Text style={s.submitText}>Create Offer</Text>
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

function Row({ label, value, c }: { label: string; value: string; c: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, { color: c.muted }]}>{label}</Text>
      <Text style={[s.rowValue, { color: c.text }]}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  stat: { flex: 1, padding: 10, gap: 3 },
  statIcon: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  statValue: { fontSize: 15, fontFamily: 'Manrope_800ExtraBold' },
  statLabel: { fontSize: 9, fontFamily: 'Manrope_500Medium' },
  statCaption: { fontSize: 8, fontFamily: 'Manrope_400Regular' },

  segment: { flexDirection: 'row', padding: 3, marginBottom: spacing.md },
  segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segmentText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },

  newBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, marginBottom: spacing.md,
  },
  newBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_600SemiBold' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  emptySub: { fontSize: 12, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },

  card: { padding: spacing.md, marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
  cardTitle: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  cardSub: { fontSize: 11, fontFamily: 'Manrope_500Medium', marginTop: 2, textTransform: 'capitalize' },
  desc: { fontSize: 12, fontFamily: 'Manrope_400Regular', marginBottom: spacing.sm, lineHeight: 18 },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },

  rows: { gap: 4, marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  rowValue: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 10, fontFamily: 'Manrope_600SemiBold' },

  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: 10, paddingVertical: 9, marginTop: 2,
  },
  toggleBtnText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },

  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  actionBtnOutline: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: 10, paddingVertical: 10,
  },
  actionBtnOutlineText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  actionBtnSolid: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 10, paddingVertical: 10,
  },
  actionBtnSolidText: { color: '#fff', fontSize: 13, fontFamily: 'Manrope_600SemiBold' },

  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  progressPct: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: spacing.sm },
  progressFill: { height: '100%', borderRadius: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '88%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 17, fontFamily: 'Manrope_700Bold', flex: 1, marginRight: spacing.md },
  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.sm, marginBottom: spacing.xs },
  input: { paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, fontFamily: 'Manrope_500Medium' },
  textArea: { minHeight: 60, textAlignVertical: 'top' },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  optionsGroup: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  optionBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: spacing.md, alignItems: 'center', borderWidth: 1.5 },
  optionText: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  checkbox: { width: 22, height: 22, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checkboxLabel: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, marginTop: spacing.lg, marginBottom: spacing.md,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
})
