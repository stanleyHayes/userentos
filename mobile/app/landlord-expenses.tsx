import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Stack } from 'expo-router'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
import { formatCurrency, formatDate } from '../lib/format'
import { api } from '../lib/api'

type ExpenseType = 'repair' | 'levy' | 'utility' | 'tax' | 'insurance' | 'other'

interface Expense {
  id: string; propertyId: string; propertyTitle: string | null
  type: ExpenseType; amount: number; date: string; note?: string
}

interface ExpenseSummary {
  total: number; months: number
  byType: { type: ExpenseType; total: number }[]
}

interface PropertyOption {
  id: string; title: string
}

const TYPE_CONFIG: Record<ExpenseType, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  repair: { label: 'Repair', icon: 'construct-outline' },
  levy: { label: 'Levy', icon: 'receipt-outline' },
  utility: { label: 'Utility', icon: 'flash-outline' },
  tax: { label: 'Tax', icon: 'document-outline' },
  insurance: { label: 'Insurance', icon: 'shield-checkmark-outline' },
  other: { label: 'Other', icon: 'ellipsis-horizontal-outline' },
}

const MONTH_OPTIONS = [3, 6, 12]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function LandlordExpensesScreen() {
  const c = useThemeColors()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [summary, setSummary] = useState<ExpenseSummary | null>(null)
  const [months, setMonths] = useState(6)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Record-expense modal
  const [showRecord, setShowRecord] = useState(false)
  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [type, setType] = useState<ExpenseType>('repair')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load(m = months) {
    try {
      const data = await api.get<{ items: Expense[]; summary: ExpenseSummary }>(`/landlord/expenses?months=${m}`)
      setExpenses(data.items ?? [])
      setSummary(data.summary ?? null)
    } catch { /* no-op */ } finally { setLoading(false) }
    // Own properties for the record-expense picker — `mine=true` scopes to the
    // caller's listings regardless of approval status.
    try {
      const props = await api.get<{ items: PropertyOption[] }>('/properties?mine=true')
      setProperties(props.items ?? [])
    } catch { /* picker stays empty */ }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  function selectMonths(m: number) {
    setMonths(m)
    void load(m)
  }

  function resetRecordModal() {
    setShowRecord(false); setPropertyId(''); setType('repair'); setAmount(''); setDate(todayISO()); setNote('')
  }

  async function handleRecord() {
    const amountNum = Number(amount)
    if (!propertyId) { Alert.alert('Error', 'Please select a property'); return }
    if (!amount || !(amountNum > 0)) { Alert.alert('Error', 'Enter a valid amount'); return }
    if (!date.trim() || date.trim().length < 4) { Alert.alert('Error', 'Enter a date (YYYY-MM-DD)'); return }
    setSubmitting(true)
    try {
      await api.post('/landlord/expenses', {
        propertyId,
        type,
        amount: amountNum,
        date: date.trim(),
        note: note.trim() || undefined,
      })
      resetRecordModal()
      Alert.alert('Success', 'Expense recorded')
      await load()
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to record expense')
    } finally { setSubmitting(false) }
  }

  function handleDelete(expense: Expense) {
    Alert.alert('Delete Expense', `Delete this ${TYPE_CONFIG[expense.type]?.label ?? expense.type} expense of ${formatCurrency(expense.amount)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(expense.id)
          try {
            await api.delete(`/landlord/expenses/${expense.id}`)
            await load()
          } catch (e) {
            Alert.alert('Error', (e as { message?: string }).message || 'Failed to delete expense')
          } finally { setDeletingId(null) }
        },
      },
    ])
  }

  const topCategory = summary?.byType.length
    ? [...summary.byType].sort((a, b) => b.total - a.total)[0]
    : null
  const monthlyAvg = summary && summary.months > 0 ? summary.total / summary.months : 0

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: c.surface }]}>
        <Stack.Screen options={{ title: 'Expenses' }} />
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <Stack.Screen options={{ title: 'Expenses' }} />
      <ScrollView
        style={[s.container, { backgroundColor: c.surface }]}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        <TouchableOpacity style={[s.newBtn, { backgroundColor: c.primary }]} activeOpacity={0.85} onPress={() => setShowRecord(true)}>
          <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
          <Text style={s.newBtnText}>Record Expense</Text>
        </TouchableOpacity>

        {/* Months filter */}
        <View style={s.chipRow}>
          {MONTH_OPTIONS.map((m) => (
            <TouchableOpacity
              key={m}
              style={[s.chip, { backgroundColor: c.card, borderColor: months === m ? c.primary : c.border }, months === m && { backgroundColor: c.primary + '10' }]}
              onPress={() => selectMonths(m)}
            >
              <Text style={[s.chipText, { color: months === m ? c.primary : c.text }]}>Last {m} months</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stat row */}
        <View style={s.statRow}>
          <View style={[s.statCard, neuCard(c)]}>
            <Ionicons name="wallet-outline" size={18} color={c.primary} />
            <Text style={[s.statValue, { color: c.primaryDark }]}>{formatCurrency(summary?.total ?? 0)}</Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Total spent</Text>
          </View>
          <View style={[s.statCard, neuCard(c)]}>
            <Ionicons name={topCategory ? TYPE_CONFIG[topCategory.type].icon : 'pie-chart-outline'} size={18} color={c.warning} />
            <Text style={[s.statValue, { color: c.primaryDark }]} numberOfLines={1} adjustsFontSizeToFit>
              {topCategory ? TYPE_CONFIG[topCategory.type].label : '—'}
            </Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Top category</Text>
          </View>
          <View style={[s.statCard, neuCard(c)]}>
            <Ionicons name="trending-up-outline" size={18} color={c.accent} />
            <Text style={[s.statValue, { color: c.primaryDark }]} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(Math.round(monthlyAvg * 100) / 100)}</Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Monthly avg</Text>
          </View>
        </View>

        {/* By-type breakdown */}
        {summary && summary.byType.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: c.primaryDark }]}>By Category</Text>
            <View style={[s.card, neuCard(c)]}>
              {summary.byType.sort((a, b) => b.total - a.total).map((row, i) => {
                const pct = summary.total > 0 ? Math.round((row.total / summary.total) * 100) : 0
                const cfg = TYPE_CONFIG[row.type] ?? TYPE_CONFIG.other
                return (
                  <View key={row.type} style={[s.typeRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                    <View style={[s.typeIcon, { backgroundColor: c.primary + '10' }]}>
                      <Ionicons name={cfg.icon} size={16} color={c.primary} />
                    </View>
                    <Text style={[s.typeLabel, { color: c.text }]}>{cfg.label}</Text>
                    <Text style={[s.typePct, { color: c.muted }]}>{pct}%</Text>
                    <Text style={[s.typeAmount, { color: c.primaryDark }]}>{formatCurrency(row.total)}</Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Expense list */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Expenses</Text>
          {expenses.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="receipt-outline" size={48} color={c.muted} />
              <Text style={[s.emptyText, { color: c.muted }]}>No expenses in the last {months} months</Text>
            </View>
          ) : (
            expenses.map((e) => {
              const cfg = TYPE_CONFIG[e.type] ?? TYPE_CONFIG.other
              return (
                <View key={e.id} style={[s.expenseRow, neuCard(c)]}>
                  <View style={[s.typeIcon, { backgroundColor: c.warning + '15' }]}>
                    <Ionicons name={cfg.icon} size={16} color={c.warning} />
                  </View>
                  <View style={s.expenseBody}>
                    <View style={s.expenseTop}>
                      <Text style={[s.expenseTitle, { color: c.primaryDark }]} numberOfLines={1}>{e.propertyTitle ?? 'Property'}</Text>
                      <Text style={[s.expenseAmount, { color: c.primaryDark }]}>{formatCurrency(e.amount)}</Text>
                    </View>
                    <View style={s.expenseMeta}>
                      <View style={[s.typeBadge, { backgroundColor: c.warning + '15' }]}>
                        <Text style={[s.typeBadgeText, { color: c.warning }]}>{cfg.label}</Text>
                      </View>
                      <Text style={[s.expenseDate, { color: c.muted }]}>{formatDate(e.date)}</Text>
                    </View>
                    {!!e.note && <Text style={[s.expenseNote, { color: c.muted }]} numberOfLines={2}>{e.note}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(e)} disabled={deletingId === e.id} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    {deletingId === e.id ? (
                      <ActivityIndicator size="small" color={c.danger} />
                    ) : (
                      <Ionicons name="trash-outline" size={18} color={c.danger} />
                    )}
                  </TouchableOpacity>
                </View>
              )
            })
          )}
        </View>
        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Record expense modal */}
      <Modal visible={showRecord} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>Record Expense</Text>
              <TouchableOpacity onPress={resetRecordModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.fieldLabel, { color: c.text }]}>Property</Text>
              {properties.length === 0 ? (
                <Text style={{ color: c.muted, fontSize: 13, marginBottom: spacing.sm }}>No properties found on your account.</Text>
              ) : (
                <View style={[s.optionsGroup, { marginBottom: spacing.sm }]}>
                  {properties.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[s.optionBtn, { backgroundColor: c.surface, borderColor: c.border }, propertyId === p.id && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
                      onPress={() => setPropertyId(p.id)}
                    >
                      <Text style={[s.optionText, { color: c.text }, propertyId === p.id && { color: c.primary, fontFamily: 'Outfit_600SemiBold' }]} numberOfLines={1}>
                        {p.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={[s.fieldLabel, { color: c.text }]}>Type</Text>
              <View style={s.optionsGroup}>
                {(Object.keys(TYPE_CONFIG) as ExpenseType[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.optionBtn, s.typeChip, { backgroundColor: c.surface, borderColor: c.border }, type === t && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
                    onPress={() => setType(t)}
                  >
                    <Ionicons name={TYPE_CONFIG[t].icon} size={14} color={type === t ? c.primary : c.muted} />
                    <Text style={[s.optionText, { color: c.text }, type === t && { color: c.primary, fontFamily: 'Outfit_600SemiBold' }]}>{TYPE_CONFIG[t].label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.fieldLabel, { color: c.text }]}>Amount (GHS)</Text>
              <TextInput
                style={[s.input, neuInset(c), { color: c.text }]}
                placeholder="0.00"
                placeholderTextColor={c.muted}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />

              <Text style={[s.fieldLabel, { color: c.text }]}>Date</Text>
              <TextInput
                style={[s.input, neuInset(c), { color: c.text }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={c.muted}
                value={date}
                onChangeText={setDate}
              />

              <Text style={[s.fieldLabel, { color: c.text }]}>Note (optional)</Text>
              <TextInput
                style={[s.input, neuInset(c), s.textArea, { color: c.text }]}
                placeholder="What was this expense for?"
                placeholderTextColor={c.muted}
                multiline
                numberOfLines={3}
                maxLength={300}
                value={note}
                onChangeText={setNote}
              />

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.primary }, submitting && s.submitBtnDisabled]}
                onPress={handleRecord}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? <ActivityIndicator color="#ffffff" /> : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
                    <Text style={s.submitBtnText}>Record Expense</Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.md, paddingBottom: 40 },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, marginBottom: spacing.md },
  newBtnText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: '#ffffff' },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5 },
  chipText: { fontSize: 12, fontFamily: 'Outfit_600SemiBold' },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: { flex: 1, padding: spacing.sm + 4, gap: 4 },
  statValue: { fontSize: 14, fontFamily: 'Outfit_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Outfit_400Regular' },
  section: { marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', marginBottom: spacing.sm },
  card: { paddingHorizontal: spacing.md },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  typeIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { flex: 1, fontSize: 13, fontFamily: 'Outfit_500Medium' },
  typePct: { fontSize: 11, fontFamily: 'Outfit_400Regular' },
  typeAmount: { fontSize: 13, fontFamily: 'Outfit_700Bold', minWidth: 80, textAlign: 'right' },
  expenseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: spacing.md, marginBottom: spacing.sm },
  expenseBody: { flex: 1 },
  expenseTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  expenseTitle: { flex: 1, fontSize: 14, fontFamily: 'Outfit_700Bold' },
  expenseAmount: { fontSize: 14, fontFamily: 'Outfit_700Bold' },
  expenseMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontFamily: 'Outfit_700Bold' },
  expenseDate: { fontSize: 11, fontFamily: 'Outfit_400Regular' },
  expenseNote: { fontSize: 12, fontFamily: 'Outfit_400Regular', marginTop: 6 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  emptyText: { fontSize: 13, fontFamily: 'Outfit_500Medium' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', marginBottom: spacing.sm, marginTop: spacing.md },
  optionsGroup: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  optionBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: spacing.md, borderWidth: 1.5, maxWidth: '100%' },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optionText: { fontSize: 13, fontFamily: 'Outfit_500Medium' },
  input: { paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16, fontFamily: 'Outfit_500Medium' },
  textArea: { height: 80, paddingTop: 14, textAlignVertical: 'top' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 16, marginTop: spacing.lg, marginBottom: spacing.md },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#ffffff' },
})
