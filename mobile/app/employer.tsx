import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert, Share,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Constants from 'expo-constants'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
import { formatCurrency, formatCompact, formatDate } from '../lib/format'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

interface EmployerProfile {
  id: string
  legalName: string
  tradingName?: string
  tin: string
  ssnitEmployerNumber?: string
  industry?: string
  address: { street: string; city: string; region: string; digitalAddress?: string }
  contactEmail: string
  contactPhone: string
  payrollCycle: string
  paydayDayOfMonth?: number
  verificationStatus: string
  totalEmployees?: number
}

interface Employee {
  id: string
  employeeName?: string
  userId: string
  staffNumber?: string
  jobTitle?: string
  netMonthlySalary: number
  status: string
  startDate: string
}

interface Mandate {
  id: string
  employeeName?: string
  employeeId: string
  allocationType: string
  targetLabel?: string
  amountType: string
  amount: number
  startDate: string
  status: string
}

interface PayrollRun {
  id: string
  periodLabel: string
  periodStart: string
  periodEnd: string
  scheduledPayDate: string
  totalGross: number
  totalDeductions: number
  totalNet: number
  employeeCount: number
  status: string
}

interface ItemsResponse<T> { items: T[] }

interface DeductionsReport {
  months: number
  runsIncluded: number
  grandTotal: number
  employees: {
    employeeId: string
    employeeName: string
    totalDeducted: number
    runs: number
    byType: Record<string, number>
  }[]
}

interface RunReportLine {
  employeeId: string
  employeeName?: string
  allocationType: string
  amount: number
  status: string
  disbursementReference?: string
  failureReason?: string
}

interface RunReport {
  run: PayrollRun
  employees: { employeeId: string; employeeName: string; total: number; lines: RunReportLine[] }[]
  statusBreakdown: { disbursed: number; failed: number; queued: number; skipped: number }
}

type Tab = 'employees' | 'mandates' | 'payroll' | 'reports'

// Mirrors the base-URL resolution in lib/api.ts (BASE_URL is module-private
// there) so the CSV export can fetch text/csv outside the JSON api client.
function resolveApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL
  if (envUrl) return `${envUrl}/api`
  const hostUri = Constants.expoConfig?.hostUri
  const host = hostUri ? hostUri.split(':')[0] : 'localhost'
  return `http://${host}:3002/api`
}

const payrollCycles = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
]

export default function EmployerScreen() {
  const c = useThemeColors()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('employees')

  const profileQ = useQuery({
    queryKey: ['employer-me'],
    queryFn: () => api.get<EmployerProfile | null>('/employers/me'),
  })
  const profile = profileQ.data ?? null

  const employeesQ = useQuery({
    queryKey: ['employer-employees'],
    queryFn: () => api.get<ItemsResponse<Employee>>('/employers/employees'),
    enabled: !!profile,
  })
  const mandatesQ = useQuery({
    queryKey: ['employer-mandates'],
    queryFn: () => api.get<ItemsResponse<Mandate>>('/employers/mandates'),
    enabled: !!profile,
  })
  const runsQ = useQuery({
    queryKey: ['employer-payroll-runs'],
    queryFn: () => api.get<ItemsResponse<PayrollRun>>('/employers/payroll/runs'),
    enabled: !!profile,
  })

  // ── Payroll reports ──
  const [reportMonths, setReportMonths] = useState(6)
  const deductionsQ = useQuery({
    queryKey: ['employer-deductions-report', reportMonths],
    queryFn: () => api.get<DeductionsReport>(`/employers/reports/deductions?months=${reportMonths}`),
    enabled: !!profile && tab === 'reports',
  })
  const [reportRunId, setReportRunId] = useState<string | null>(null)
  const runReportQ = useQuery({
    queryKey: ['employer-run-report', reportRunId],
    queryFn: () => api.get<RunReport>(`/employers/payroll/runs/${reportRunId}/report`),
    enabled: !!reportRunId,
  })
  const runReport = runReportQ.data ?? null

  const employees = employeesQ.data?.items ?? []
  const mandates = mandatesQ.data?.items ?? []
  const runs = runsQ.data?.items ?? []

  const [busyId, setBusyId] = useState<string | null>(null)

  // ── Employer profile setup form ──
  const [legalName, setLegalName] = useState('')
  const [tradingName, setTradingName] = useState('')
  const [tin, setTin] = useState('')
  const [ssnit, setSsnit] = useState('')
  const [industry, setIndustry] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [digitalAddress, setDigitalAddress] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [payrollCycle, setPayrollCycle] = useState('monthly')
  const [payday, setPayday] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  async function submitProfile() {
    const paydayNum = payday ? Number(payday) : undefined
    if (legalName.trim().length < 2) { Alert.alert('Invalid name', 'Legal name must be at least 2 characters'); return }
    if (tin.trim().length < 5) { Alert.alert('Invalid TIN', 'TIN must be at least 5 characters'); return }
    if (!street.trim() || !city.trim() || !region.trim()) { Alert.alert('Invalid address', 'Street, city and region are required'); return }
    if (!/^\S+@\S+\.\S+$/.test(contactEmail.trim())) { Alert.alert('Invalid email', 'Enter a valid contact email'); return }
    if (contactPhone.trim().length < 7) { Alert.alert('Invalid phone', 'Contact phone must be at least 7 characters'); return }
    if (paydayNum !== undefined && (!Number.isInteger(paydayNum) || paydayNum < 1 || paydayNum > 31)) {
      Alert.alert('Invalid payday', 'Payday must be a day of the month between 1 and 31'); return
    }
    setSavingProfile(true)
    try {
      await api.post('/employers/me', {
        legalName: legalName.trim(),
        tradingName: tradingName.trim() || undefined,
        tin: tin.trim(),
        ssnitEmployerNumber: ssnit.trim() || undefined,
        industry: industry.trim() || undefined,
        address: {
          street: street.trim(),
          city: city.trim(),
          region: region.trim(),
          digitalAddress: digitalAddress.trim() || undefined,
        },
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        payrollCycle,
        paydayDayOfMonth: paydayNum,
      })
      qc.invalidateQueries({ queryKey: ['employer-me'] })
      Alert.alert('Saved', 'Your employer profile has been created')
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to save profile')
    } finally {
      setSavingProfile(false)
    }
  }

  // ── Add employee modal ──
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [empEmail, setEmpEmail] = useState('')
  const [empStaffNumber, setEmpStaffNumber] = useState('')
  const [empJobTitle, setEmpJobTitle] = useState('')
  const [empSalary, setEmpSalary] = useState('')
  const [empStartDate, setEmpStartDate] = useState('')
  const [addingEmployee, setAddingEmployee] = useState(false)

  function resetAddEmployee() {
    setShowAddEmployee(false)
    setEmpEmail(''); setEmpStaffNumber(''); setEmpJobTitle(''); setEmpSalary(''); setEmpStartDate('')
  }

  async function submitAddEmployee() {
    const salary = Number(empSalary)
    if (!/^\S+@\S+\.\S+$/.test(empEmail.trim())) { Alert.alert('Invalid email', 'Enter the employee\'s account email'); return }
    if (!Number.isFinite(salary) || salary < 0) { Alert.alert('Invalid salary', 'Enter a valid net monthly salary'); return }
    if (!empStartDate.trim()) { Alert.alert('Missing start date', 'Enter a start date (YYYY-MM-DD)'); return }
    setAddingEmployee(true)
    try {
      await api.post('/employers/employees', {
        email: empEmail.trim(),
        staffNumber: empStaffNumber.trim() || undefined,
        jobTitle: empJobTitle.trim() || undefined,
        netMonthlySalary: salary,
        startDate: empStartDate.trim(),
      })
      qc.invalidateQueries({ queryKey: ['employer-employees'] })
      qc.invalidateQueries({ queryKey: ['employer-me'] })
      Alert.alert('Added', 'Employee linked to your company')
      resetAddEmployee()
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to add employee')
    } finally {
      setAddingEmployee(false)
    }
  }

  // ── Payroll run create modal ──
  const [showCreateRun, setShowCreateRun] = useState(false)
  const [runLabel, setRunLabel] = useState('')
  const [runStart, setRunStart] = useState('')
  const [runEnd, setRunEnd] = useState('')
  const [runPayDate, setRunPayDate] = useState('')
  const [creatingRun, setCreatingRun] = useState(false)

  function resetCreateRun() {
    setShowCreateRun(false)
    setRunLabel(''); setRunStart(''); setRunEnd(''); setRunPayDate('')
  }

  async function submitCreateRun() {
    if (!runLabel.trim()) { Alert.alert('Missing label', 'Enter a period label (e.g. "January 2026")'); return }
    if (!runStart.trim() || !runEnd.trim() || !runPayDate.trim()) {
      Alert.alert('Missing dates', 'Enter period start, period end and pay date (YYYY-MM-DD)'); return
    }
    setCreatingRun(true)
    try {
      await api.post('/employers/payroll/runs', {
        periodLabel: runLabel.trim(),
        periodStart: runStart.trim(),
        periodEnd: runEnd.trim(),
        scheduledPayDate: runPayDate.trim(),
      })
      qc.invalidateQueries({ queryKey: ['employer-payroll-runs'] })
      Alert.alert('Created', 'Payroll run created from active employees and mandates')
      resetCreateRun()
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to create payroll run')
    } finally {
      setCreatingRun(false)
    }
  }

  async function approveMandate(m: Mandate) {
    setBusyId(m.id)
    try {
      await api.post(`/employers/mandates/${m.id}/approve`, {})
      qc.invalidateQueries({ queryKey: ['employer-mandates'] })
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to approve mandate')
    } finally {
      setBusyId(null)
    }
  }

  function runAction(run: PayrollRun, action: 'approve' | 'process') {
    Alert.alert(
      action === 'approve' ? 'Approve Payroll' : 'Process Payroll',
      action === 'approve'
        ? `Approve "${run.periodLabel}" for processing?`
        : `Process "${run.periodLabel}"? This disburses ${formatCurrency(run.totalDeductions)} in deductions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'approve' ? 'Approve' : 'Process',
          onPress: async () => {
            setBusyId(run.id)
            try {
              await api.post(`/employers/payroll/runs/${run.id}/${action}`, {})
              qc.invalidateQueries({ queryKey: ['employer-payroll-runs'] })
              Alert.alert('Done', action === 'approve' ? 'Payroll run approved' : 'Payroll run processed')
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

  // ── CSV export ──
  const [exportingId, setExportingId] = useState<string | null>(null)

  async function exportCsv(run: PayrollRun) {
    setExportingId(run.id)
    try {
      const token = useAuthStore.getState().token
      const res = await fetch(`${resolveApiBaseUrl()}/employers/payroll/runs/${run.id}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const csv = await res.text()
      try {
        await Share.share({ message: csv, title: `payroll-${run.periodLabel}.csv` })
      } catch {
        // user dismissed the share sheet
      }
    } catch (e) {
      Alert.alert('Export failed', (e as { message?: string }).message ?? 'Could not export CSV')
    } finally {
      setExportingId(null)
    }
  }

  const empStatusConfig: Record<string, { bg: string; text: string }> = {
    active: { bg: c.accent + '15', text: c.accent },
    pending: { bg: c.warning + '15', text: c.warning },
    on_leave: { bg: c.warning + '15', text: c.warning },
    terminated: { bg: c.danger + '15', text: c.danger },
  }
  const mandateStatusConfig: Record<string, { bg: string; text: string }> = {
    pending: { bg: c.warning + '15', text: c.warning },
    active: { bg: c.accent + '15', text: c.accent },
    paused: { bg: c.warning + '15', text: c.warning },
    revoked: { bg: c.danger + '15', text: c.danger },
    expired: { bg: c.surface, text: c.muted },
  }
  const runStatusConfig: Record<string, { bg: string; text: string }> = {
    draft: { bg: c.surface, text: c.muted },
    pending_approval: { bg: c.warning + '15', text: c.warning },
    approved: { bg: c.primary + '15', text: c.primary },
    processing: { bg: c.primary + '15', text: c.primary },
    processed: { bg: c.accent + '15', text: c.accent },
    failed: { bg: c.danger + '15', text: c.danger },
    cancelled: { bg: c.danger + '15', text: c.danger },
  }
  const lineStatusConfig: Record<string, { bg: string; text: string }> = {
    disbursed: { bg: c.accent + '15', text: c.accent },
    failed: { bg: c.danger + '15', text: c.danger },
    queued: { bg: c.warning + '15', text: c.warning },
    skipped: { bg: c.surface, text: c.muted },
  }

  if (profileQ.isLoading) {
    return (
      <View style={[s.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  // ── Profile gate: no employer profile yet ──
  if (!profile) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}>
          <View style={[s.banner, { backgroundColor: c.primary + '08', borderColor: c.primary + '20' }]}>
            <Ionicons name="business-outline" size={18} color={c.primary} />
            <Text style={[s.bannerText, { color: c.text }]}>
              Set up your employer profile to manage employees, deduction mandates and payroll.
            </Text>
          </View>

          <View style={[s.card, neuCard(c)]}>
            <Text style={[s.formTitle, { color: c.text }]}>Employer Profile</Text>

            <Text style={[s.label, { color: c.text }]}>Legal name *</Text>
            <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={legalName} onChangeText={setLegalName} placeholder="Acme Ltd" placeholderTextColor={c.muted} />

            <Text style={[s.label, { color: c.text }]}>Trading name</Text>
            <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={tradingName} onChangeText={setTradingName} placeholder="Optional" placeholderTextColor={c.muted} />

            <View style={s.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: c.text }]}>TIN *</Text>
                <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={tin} onChangeText={setTin} placeholder="C0001234567" placeholderTextColor={c.muted} autoCapitalize="characters" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: c.text }]}>SSNIT employer no.</Text>
                <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={ssnit} onChangeText={setSsnit} placeholder="Optional" placeholderTextColor={c.muted} />
              </View>
            </View>

            <Text style={[s.label, { color: c.text }]}>Industry</Text>
            <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={industry} onChangeText={setIndustry} placeholder="Optional" placeholderTextColor={c.muted} />

            <Text style={[s.label, { color: c.text }]}>Street *</Text>
            <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={street} onChangeText={setStreet} placeholder="12 Independence Ave" placeholderTextColor={c.muted} />

            <View style={s.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: c.text }]}>City *</Text>
                <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={city} onChangeText={setCity} placeholder="Accra" placeholderTextColor={c.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: c.text }]}>Region *</Text>
                <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={region} onChangeText={setRegion} placeholder="Greater Accra" placeholderTextColor={c.muted} />
              </View>
            </View>

            <Text style={[s.label, { color: c.text }]}>Digital address (GhanaPost GPS)</Text>
            <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={digitalAddress} onChangeText={setDigitalAddress} placeholder="GA-123-4567" placeholderTextColor={c.muted} autoCapitalize="characters" />

            <View style={s.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: c.text }]}>Contact email *</Text>
                <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={contactEmail} onChangeText={setContactEmail} placeholder="hr@acme.com" placeholderTextColor={c.muted} keyboardType="email-address" autoCapitalize="none" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: c.text }]}>Contact phone *</Text>
                <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={contactPhone} onChangeText={setContactPhone} placeholder="0302123456" placeholderTextColor={c.muted} keyboardType="phone-pad" />
              </View>
            </View>

            <Text style={[s.label, { color: c.text }]}>Payroll cycle</Text>
            <View style={s.optionsGroup}>
              {payrollCycles.map((p) => (
                <TouchableOpacity
                  key={p.value}
                  style={[
                    s.optionBtn,
                    { backgroundColor: c.surface, borderColor: c.border },
                    payrollCycle === p.value && { borderColor: c.primary, backgroundColor: c.primary + '08' },
                  ]}
                  onPress={() => setPayrollCycle(p.value)}
                >
                  <Text style={[s.optionText, { color: c.text }, payrollCycle === p.value && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.label, { color: c.text }]}>Payday (day of month)</Text>
            <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={payday} onChangeText={setPayday} placeholder="e.g. 28" placeholderTextColor={c.muted} keyboardType="numeric" />

            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: c.primary }, savingProfile && s.submitDisabled]}
              onPress={submitProfile}
              disabled={savingProfile}
              activeOpacity={0.85}
            >
              {savingProfile ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={s.submitText}>Create Profile</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    )
  }

  const activeQuery = tab === 'employees' ? employeesQ : tab === 'mandates' ? mandatesQ : tab === 'payroll' ? runsQ : deductionsQ

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
        {/* Profile header */}
        <View style={[s.card, neuCard(c)]}>
          <View style={s.cardHeader}>
            <View style={[s.profileIcon, { backgroundColor: c.primary + '15' }]}>
              <Ionicons name="business" size={20} color={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>{profile.legalName}</Text>
              <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>
                {[profile.tradingName, profile.industry].filter(Boolean).join(' · ') || `TIN ${profile.tin}`}
              </Text>
            </View>
            <View style={[s.badge, { backgroundColor: profile.verificationStatus === 'verified' ? c.accent + '15' : c.warning + '15' }]}>
              <View style={[s.badgeDot, { backgroundColor: profile.verificationStatus === 'verified' ? c.accent : c.warning }]} />
              <Text style={[s.badgeText, { color: profile.verificationStatus === 'verified' ? c.accent : c.warning }]}>
                {profile.verificationStatus}
              </Text>
            </View>
          </View>
          <View style={s.rows}>
            <Row label="Location" value={`${profile.address.city}, ${profile.address.region}`} c={c} />
            <Row label="Payroll" value={`${profile.payrollCycle}${profile.paydayDayOfMonth ? ` · day ${profile.paydayDayOfMonth}` : ''}`} c={c} />
            <Row label="Employees" value={String(profile.totalEmployees ?? employees.length)} c={c} />
          </View>
        </View>

        {/* Segments */}
        <View style={[s.segment, neuInset(c)]}>
          {([['employees', 'Employees'], ['mandates', 'Mandates'], ['payroll', 'Payroll'], ['reports', 'Reports']] as [Tab, string][]).map(([key, label]) => (
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

        {/* ── Employees ── */}
        {tab === 'employees' && (
          <>
            <TouchableOpacity
              style={[s.newBtn, { backgroundColor: c.primary }]}
              onPress={() => setShowAddEmployee(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="person-add-outline" size={18} color="#fff" />
              <Text style={s.newBtnText}>Add Employee</Text>
            </TouchableOpacity>

            {employeesQ.isLoading ? (
              <ActivityIndicator color={c.primary} style={{ marginTop: spacing.xl }} />
            ) : employees.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="people-outline" size={48} color={c.muted} />
                <Text style={[s.emptyText, { color: c.muted }]}>No employees yet</Text>
                <Text style={[s.emptySub, { color: c.muted }]}>Add employees by their RentOS account email to enable payroll deductions.</Text>
              </View>
            ) : (
              employees.map((e) => {
                const sc = empStatusConfig[e.status] ?? empStatusConfig.pending
                return (
                  <View key={e.id} style={[s.card, neuCard(c)]}>
                    <View style={s.cardHeader}>
                      <View style={[s.profileIcon, { backgroundColor: c.primary + '12' }]}>
                        <Ionicons name="person-outline" size={18} color={c.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>
                          {e.employeeName ?? `Employee #${e.userId.slice(-6)}`}
                        </Text>
                        <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>
                          {[e.jobTitle, e.staffNumber ? `#${e.staffNumber}` : null].filter(Boolean).join(' · ') || 'Staff'}
                        </Text>
                      </View>
                      <View style={[s.badge, { backgroundColor: sc.bg }]}>
                        <View style={[s.badgeDot, { backgroundColor: sc.text }]} />
                        <Text style={[s.badgeText, { color: sc.text }]}>{e.status.replace(/_/g, ' ')}</Text>
                      </View>
                    </View>
                    <View style={s.rows}>
                      <Row label="Net salary" value={`${formatCurrency(e.netMonthlySalary)}/mo`} c={c} />
                      <Row label="Start date" value={formatDate(e.startDate)} c={c} />
                    </View>
                  </View>
                )
              })
            )}
          </>
        )}

        {/* ── Mandates ── */}
        {tab === 'mandates' && (
          mandatesQ.isLoading ? (
            <ActivityIndicator color={c.primary} style={{ marginTop: spacing.xl }} />
          ) : mandates.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="document-text-outline" size={48} color={c.muted} />
              <Text style={[s.emptyText, { color: c.muted }]}>No mandates</Text>
              <Text style={[s.emptySub, { color: c.muted }]}>Deduction mandates signed by your employees will appear here for approval.</Text>
            </View>
          ) : (
            mandates.map((m) => {
              const sc = mandateStatusConfig[m.status] ?? mandateStatusConfig.pending
              return (
                <View key={m.id} style={[s.card, neuCard(c)]}>
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>
                        {m.employeeName ?? `Employee #${m.employeeId.slice(-6)}`}
                      </Text>
                      <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>
                        {m.allocationType.replace(/_/g, ' ')}{m.targetLabel ? ` · ${m.targetLabel}` : ''}
                      </Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: sc.bg }]}>
                      <View style={[s.badgeDot, { backgroundColor: sc.text }]} />
                      <Text style={[s.badgeText, { color: sc.text }]}>{m.status}</Text>
                    </View>
                  </View>
                  <View style={s.rows}>
                    <Row
                      label="Deduction"
                      value={m.amountType === 'percentage' ? `${m.amount}% of salary` : `${formatCurrency(m.amount)}/mo`}
                      c={c}
                    />
                    <Row label="Starts" value={formatDate(m.startDate)} c={c} />
                  </View>
                  {m.status === 'pending' && (
                    <TouchableOpacity
                      style={[s.actionBtnSolid, { backgroundColor: c.accent }]}
                      onPress={() => approveMandate(m)}
                      disabled={busyId === m.id}
                      activeOpacity={0.85}
                    >
                      {busyId === m.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                          <Text style={s.actionBtnSolidText}>Approve Mandate</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )
            })
          )
        )}

        {/* ── Payroll runs ── */}
        {tab === 'payroll' && (
          <>
            <TouchableOpacity
              style={[s.newBtn, { backgroundColor: c.primary }]}
              onPress={() => setShowCreateRun(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={s.newBtnText}>New Payroll Run</Text>
            </TouchableOpacity>

            {runsQ.isLoading ? (
              <ActivityIndicator color={c.primary} style={{ marginTop: spacing.xl }} />
            ) : runs.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="cash-outline" size={48} color={c.muted} />
                <Text style={[s.emptyText, { color: c.muted }]}>No payroll runs</Text>
                <Text style={[s.emptySub, { color: c.muted }]}>Create a run to compute deductions for a pay period.</Text>
              </View>
            ) : (
              runs.map((r) => {
                const sc = runStatusConfig[r.status] ?? runStatusConfig.draft
                const approvable = r.status === 'draft' || r.status === 'pending_approval'
                return (
                  <View key={r.id} style={[s.card, neuCard(c)]}>
                    <View style={s.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>{r.periodLabel}</Text>
                        <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>
                          {formatDate(r.periodStart)} – {formatDate(r.periodEnd)} · pays {formatDate(r.scheduledPayDate)}
                        </Text>
                      </View>
                      <View style={[s.badge, { backgroundColor: sc.bg }]}>
                        <View style={[s.badgeDot, { backgroundColor: sc.text }]} />
                        <Text style={[s.badgeText, { color: sc.text }]}>{r.status.replace(/_/g, ' ')}</Text>
                      </View>
                    </View>
                    <View style={s.rows}>
                      <Row label="Employees" value={String(r.employeeCount)} c={c} />
                      <Row label="Gross" value={formatCompact(r.totalGross)} c={c} />
                      <Row label="Deductions" value={formatCompact(r.totalDeductions)} c={c} />
                      <Row label="Net" value={formatCompact(r.totalNet)} c={c} />
                    </View>
                    <View style={s.runActions}>
                      <TouchableOpacity
                        style={[s.smallBtn, { borderColor: c.primary }]}
                        onPress={() => setReportRunId(r.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="document-text-outline" size={14} color={c.primary} />
                        <Text style={[s.smallBtnText, { color: c.primary }]}>Report</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.smallBtn, { borderColor: c.border }]}
                        onPress={() => exportCsv(r)}
                        disabled={exportingId === r.id}
                        activeOpacity={0.8}
                      >
                        {exportingId === r.id ? (
                          <ActivityIndicator size="small" color={c.text} />
                        ) : (
                          <>
                            <Ionicons name="download-outline" size={14} color={c.text} />
                            <Text style={[s.smallBtnText, { color: c.text }]}>Export CSV</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                    {(approvable || r.status === 'approved') && (
                      <TouchableOpacity
                        style={[s.actionBtnSolid, { backgroundColor: approvable ? c.primary : c.accent }]}
                        onPress={() => runAction(r, approvable ? 'approve' : 'process')}
                        disabled={busyId === r.id}
                        activeOpacity={0.85}
                      >
                        {busyId === r.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name={approvable ? 'checkmark-done-outline' : 'play-outline'} size={16} color="#fff" />
                            <Text style={s.actionBtnSolidText}>{approvable ? 'Approve Run' : 'Process Run'}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })
            )}
          </>
        )}

        {/* ── Reports ── */}
        {tab === 'reports' && (
          <>
            <View style={s.chipRow}>
              {[3, 6, 12].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    s.chip,
                    { backgroundColor: c.surface, borderColor: c.border },
                    reportMonths === m && { borderColor: c.primary, backgroundColor: c.primary + '08' },
                  ]}
                  onPress={() => setReportMonths(m)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.chipText, { color: reportMonths === m ? c.primary : c.muted }]}>
                    {m} months
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {deductionsQ.isLoading ? (
              <ActivityIndicator color={c.primary} style={{ marginTop: spacing.xl }} />
            ) : !deductionsQ.data || deductionsQ.data.employees.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="analytics-outline" size={48} color={c.muted} />
                <Text style={[s.emptyText, { color: c.muted }]}>No deductions recorded</Text>
                <Text style={[s.emptySub, { color: c.muted }]}>
                  Disbursed deductions from the last {reportMonths} months will appear here.
                </Text>
              </View>
            ) : (
              <>
                <View style={[s.card, neuCard(c)]}>
                  <View style={s.statRow}>
                    <View style={s.statBox}>
                      <Text style={[s.statValue, { color: c.text }]}>{formatCompact(deductionsQ.data.grandTotal)}</Text>
                      <Text style={[s.statLabel, { color: c.muted }]}>Total deducted</Text>
                    </View>
                    <View style={s.statBox}>
                      <Text style={[s.statValue, { color: c.text }]}>{deductionsQ.data.runsIncluded}</Text>
                      <Text style={[s.statLabel, { color: c.muted }]}>Runs included</Text>
                    </View>
                    <View style={s.statBox}>
                      <Text style={[s.statValue, { color: c.text }]}>{deductionsQ.data.employees.length}</Text>
                      <Text style={[s.statLabel, { color: c.muted }]}>Employees</Text>
                    </View>
                  </View>
                </View>

                {deductionsQ.data.employees.map((emp) => (
                  <View key={emp.employeeId} style={[s.card, neuCard(c)]}>
                    <View style={s.cardHeader}>
                      <View style={[s.profileIcon, { backgroundColor: c.primary + '12' }]}>
                        <Ionicons name="person-outline" size={18} color={c.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>{emp.employeeName}</Text>
                        <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>
                          {emp.runs} run{emp.runs === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <Text style={[s.cardTitle, { color: c.text }]}>{formatCurrency(emp.totalDeducted)}</Text>
                    </View>
                    <View style={s.chipRow}>
                      {Object.entries(emp.byType).map(([type, amount]) => (
                        <View key={type} style={[s.typeChip, { backgroundColor: c.surface, borderColor: c.border }]}>
                          <Text style={[s.typeChipLabel, { color: c.muted }]}>{type.replace(/_/g, ' ')}</Text>
                          <Text style={[s.typeChipValue, { color: c.text }]}>{formatCompact(amount)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Add employee modal */}
      <Modal visible={showAddEmployee} animationType="slide" transparent onRequestClose={resetAddEmployee}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>Add Employee</Text>
              <TouchableOpacity onPress={resetAddEmployee} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.hint, { color: c.muted }]}>
                The employee must already have a RentOS account — they will be linked by email.
              </Text>

              <Text style={[s.label, { color: c.text }]}>Account email *</Text>
              <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={empEmail} onChangeText={setEmpEmail} placeholder="employee@example.com" placeholderTextColor={c.muted} keyboardType="email-address" autoCapitalize="none" />

              <View style={s.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: c.text }]}>Staff number</Text>
                  <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={empStaffNumber} onChangeText={setEmpStaffNumber} placeholder="Optional" placeholderTextColor={c.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: c.text }]}>Job title</Text>
                  <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={empJobTitle} onChangeText={setEmpJobTitle} placeholder="Optional" placeholderTextColor={c.muted} />
                </View>
              </View>

              <Text style={[s.label, { color: c.text }]}>Net monthly salary (GHS) *</Text>
              <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={empSalary} onChangeText={setEmpSalary} placeholder="0" placeholderTextColor={c.muted} keyboardType="numeric" />

              <Text style={[s.label, { color: c.text }]}>Start date *</Text>
              <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={empStartDate} onChangeText={setEmpStartDate} placeholder="YYYY-MM-DD" placeholderTextColor={c.muted} autoCapitalize="none" />

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.primary }, addingEmployee && s.submitDisabled]}
                onPress={submitAddEmployee}
                disabled={addingEmployee}
                activeOpacity={0.85}
              >
                {addingEmployee ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="person-add" size={16} color="#fff" />
                    <Text style={s.submitText}>Add Employee</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Create payroll run modal */}
      <Modal visible={showCreateRun} animationType="slide" transparent onRequestClose={resetCreateRun}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>New Payroll Run</Text>
              <TouchableOpacity onPress={resetCreateRun} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.hint, { color: c.muted }]}>
                Deductions are computed from active employees and their approved mandates.
              </Text>

              <Text style={[s.label, { color: c.text }]}>Period label *</Text>
              <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={runLabel} onChangeText={setRunLabel} placeholder="e.g. January 2026" placeholderTextColor={c.muted} />

              <View style={s.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: c.text }]}>Period start *</Text>
                  <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={runStart} onChangeText={setRunStart} placeholder="YYYY-MM-DD" placeholderTextColor={c.muted} autoCapitalize="none" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: c.text }]}>Period end *</Text>
                  <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={runEnd} onChangeText={setRunEnd} placeholder="YYYY-MM-DD" placeholderTextColor={c.muted} autoCapitalize="none" />
                </View>
              </View>

              <Text style={[s.label, { color: c.text }]}>Scheduled pay date *</Text>
              <TextInput style={[s.input, neuInset(c), { color: c.text }]} value={runPayDate} onChangeText={setRunPayDate} placeholder="YYYY-MM-DD" placeholderTextColor={c.muted} autoCapitalize="none" />

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.primary }, creatingRun && s.submitDisabled]}
                onPress={submitCreateRun}
                disabled={creatingRun}
                activeOpacity={0.85}
              >
                {creatingRun ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="calculator-outline" size={16} color="#fff" />
                    <Text style={s.submitText}>Create Run</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Run report modal */}
      <Modal visible={!!reportRunId} animationType="slide" transparent onRequestClose={() => setReportRunId(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]} numberOfLines={1}>
                {runReport ? `Run Report — ${runReport.run.periodLabel}` : 'Run Report'}
              </Text>
              <TouchableOpacity onPress={() => setReportRunId(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>

            {runReportQ.isLoading ? (
              <ActivityIndicator color={c.primary} style={{ marginVertical: spacing.xl }} />
            ) : !runReport ? (
              <Text style={[s.hint, { color: c.muted }]}>Could not load this report.</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.chipRow}>
                  {(Object.entries(runReport.statusBreakdown) as [keyof RunReport['statusBreakdown'], number][]).map(([status, count]) => {
                    const sc = lineStatusConfig[status] ?? lineStatusConfig.skipped
                    return (
                      <View key={status} style={[s.typeChip, { backgroundColor: sc.bg, borderColor: sc.text + '30' }]}>
                        <Text style={[s.typeChipLabel, { color: sc.text }]}>{status}</Text>
                        <Text style={[s.typeChipValue, { color: sc.text }]}>{count}</Text>
                      </View>
                    )
                  })}
                </View>

                {runReport.employees.length === 0 ? (
                  <View style={s.empty}>
                    <Ionicons name="receipt-outline" size={40} color={c.muted} />
                    <Text style={[s.emptyText, { color: c.muted }]}>No deduction lines</Text>
                  </View>
                ) : (
                  runReport.employees.map((emp) => (
                    <View key={emp.employeeId} style={[s.reportEmp, { borderColor: c.border }]}>
                      <View style={s.cardHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>{emp.employeeName}</Text>
                        </View>
                        <Text style={[s.rowValue, { color: c.text }]}>{formatCurrency(emp.total)}</Text>
                      </View>
                      {emp.lines.map((line, i) => {
                        const sc = lineStatusConfig[line.status] ?? lineStatusConfig.skipped
                        return (
                          <View key={`${line.allocationType}-${i}`} style={s.lineRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={[s.rowLabel, { color: c.text, textTransform: 'capitalize' }]}>
                                {line.allocationType.replace(/_/g, ' ')}
                              </Text>
                              {line.status === 'failed' && !!line.failureReason && (
                                <Text style={[s.failText, { color: c.danger }]} numberOfLines={2}>
                                  {line.failureReason}
                                </Text>
                              )}
                            </View>
                            <Text style={[s.rowValue, { color: c.text }]}>{formatCurrency(line.amount)}</Text>
                            <View style={[s.badge, { backgroundColor: sc.bg }]}>
                              <View style={[s.badgeDot, { backgroundColor: sc.text }]} />
                              <Text style={[s.badgeText, { color: sc.text }]}>{line.status}</Text>
                            </View>
                          </View>
                        )
                      })}
                    </View>
                  ))
                )}
              </ScrollView>
            )}
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

  banner: {
    flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: 12,
    borderWidth: 1, marginBottom: spacing.md, alignItems: 'flex-start',
  },
  bannerText: { flex: 1, fontSize: 12, fontFamily: 'Manrope_500Medium' },
  formTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', marginBottom: spacing.sm },
  hint: { fontSize: 12, fontFamily: 'Manrope_400Regular', marginBottom: spacing.sm, lineHeight: 18 },

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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  cardTitle: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  cardSub: { fontSize: 11, fontFamily: 'Manrope_500Medium', marginTop: 2, textTransform: 'capitalize' },
  profileIcon: { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },

  rows: { gap: 4, marginBottom: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: 12, fontFamily: 'Manrope_400Regular' },
  rowValue: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },

  actionBtnSolid: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 10, paddingVertical: 10, marginTop: spacing.sm,
  },
  actionBtnSolidText: { color: '#fff', fontSize: 13, fontFamily: 'Manrope_600SemiBold' },

  runActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  smallBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 10, paddingVertical: 8, borderWidth: 1.5,
  },
  smallBtnText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },

  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.sm },
  chip: { borderRadius: 9, paddingVertical: 7, paddingHorizontal: spacing.md, borderWidth: 1.5 },
  chipText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },

  statRow: { flexDirection: 'row' },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 16, fontFamily: 'Manrope_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Manrope_500Medium', textAlign: 'center' },

  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1,
  },
  typeChipLabel: { fontSize: 10, fontFamily: 'Manrope_500Medium', textTransform: 'capitalize' },
  typeChipValue: { fontSize: 11, fontFamily: 'Manrope_700Bold' },

  reportEmp: { borderTopWidth: 1, paddingTop: spacing.sm, marginTop: spacing.sm },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  failText: { fontSize: 10, fontFamily: 'Manrope_400Regular', marginTop: 1 },

  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.sm, marginBottom: spacing.xs },
  input: { paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, fontFamily: 'Manrope_500Medium' },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  optionsGroup: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  optionBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: spacing.md, alignItems: 'center', borderWidth: 1.5 },
  optionText: { fontSize: 13, fontFamily: 'Manrope_500Medium' },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 17, fontFamily: 'Manrope_700Bold', flex: 1, marginRight: spacing.md },
})
