import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as SecureStore from 'expo-secure-store'
import { router } from 'expo-router'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard } from '../lib/neu'
import { formatCurrency, formatDate } from '../lib/format'
import { api } from '../lib/api'
import { ListSkeleton } from '../components/Skeleton'
import { useAuthStore } from '../stores/authStore'

interface Agreement {
  id: string; propertyId: string; rentAmount: number; status: string
  startDate: string; endDate: string
}

/* Move-in checklist (mirrors client/src/components/agreements/MoveInChecklist.tsx).
   Progress persists per agreement in SecureStore; tasks with a business
   category link to /local-services when such businesses exist in the
   agreement property's city. */
const MOVE_IN_TASKS: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; category?: string }[] = [
  { key: 'handover', label: 'Confirm move-in date & key handover', icon: 'key-outline' },
  { key: 'meters', label: 'Photograph meter readings & condition', icon: 'camera-outline' },
  { key: 'internet', label: 'Set up home internet', icon: 'wifi-outline', category: 'internet' },
  { key: 'movers', label: 'Schedule movers', icon: 'car-outline', category: 'moving' },
  { key: 'cleaning', label: 'Book a deep clean', icon: 'sparkles-outline', category: 'cleaning' },
  { key: 'furniture', label: 'Buy furniture & essentials', icon: 'bed-outline', category: 'furniture' },
  { key: 'address', label: 'Update your address everywhere', icon: 'location-outline' },
]

function MoveInChecklist({ agreementId, propertyId }: { agreementId: string; propertyId: string }) {
  const c = useThemeColors()
  const [checked, setChecked] = useState<string[]>([])
  const [city, setCity] = useState('')
  const [categoriesInCity, setCategoriesInCity] = useState<Set<string>>(new Set())

  useEffect(() => {
    const key = `rentos-movein-${agreementId}`
    SecureStore.getItemAsync(key)
      .then((raw) => { if (raw) setChecked(JSON.parse(raw) as string[]) })
      .catch(() => {})
    // City comes from the agreement's property — the list endpoint doesn't
    // carry it, so fetch the property, then businesses in that city.
    api.get<{ address?: { city?: string } }>(`/properties/${propertyId}`)
      .then(async (p) => {
        const propCity = p.address?.city ?? ''
        setCity(propCity)
        if (!propCity) return
        const res = await api.get<{ items: { business: { category: string } }[] }>(`/businesses?city=${encodeURIComponent(propCity)}`)
        setCategoriesInCity(new Set((res.items ?? []).map((i) => i.business.category)))
      })
      .catch(() => {})
  }, [agreementId, propertyId])

  function toggle(taskKey: string) {
    setChecked((prev) => {
      const next = prev.includes(taskKey) ? prev.filter((k) => k !== taskKey) : [...prev, taskKey]
      SecureStore.setItemAsync(`rentos-movein-${agreementId}`, JSON.stringify(next)).catch(() => {})
      return next
    })
  }

  const done = checked.length
  const pct = Math.round((done / MOVE_IN_TASKS.length) * 100)

  return (
    <View style={[s.checklistCard, neuCard(c)]}>
      <View style={s.checklistHeader}>
        <Ionicons name="clipboard-outline" size={16} color={c.primary} />
        <Text style={[s.checklistTitle, { color: c.primaryDark }]}>Move-in checklist</Text>
        <Text style={[s.checklistCount, { color: c.muted }]}>{done}/{MOVE_IN_TASKS.length}</Text>
      </View>
      <View style={[s.progressTrack, { backgroundColor: c.surface }]}>
        <View style={[s.progressFill, { backgroundColor: c.accent, width: `${pct}%` }]} />
      </View>
      {MOVE_IN_TASKS.map((task) => {
        const isDone = checked.includes(task.key)
        const nearby = task.category && categoriesInCity.has(task.category)
        return (
          <View key={task.key} style={s.taskRow}>
            <TouchableOpacity
              style={[s.checkbox, { borderColor: isDone ? c.accent : c.border }, isDone && { backgroundColor: c.accent }]}
              onPress={() => toggle(task.key)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              {isDone && <Ionicons name="checkmark" size={12} color="#ffffff" />}
            </TouchableOpacity>
            <Ionicons name={task.icon} size={15} color={c.muted} style={isDone && s.taskIconDone} />
            <Text style={[s.taskLabel, { color: c.text }, isDone && { textDecorationLine: 'line-through', color: c.muted }]}>{task.label}</Text>
            {nearby && !isDone && (
              <TouchableOpacity onPress={() => router.push('/local-services')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={[s.nearbyLink, { color: c.primary }]}>Nearby options →</Text>
              </TouchableOpacity>
            )}
          </View>
        )
      })}
      {!!city && <Text style={[s.cityNote, { color: c.muted }]}>Suggestions based on {city}.</Text>}
    </View>
  )
}

export default function AgreementsScreen() {
  const c = useThemeColors()
  const isTenant = useAuthStore((state) => state.user?.activeRole === 'tenant')
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState<string | null>(null)

  const statusColors: Record<string, string> = {
    active: c.accent,
    pending_signature: c.warning,
    pending: c.warning,
    expired: c.muted,
    terminated: c.danger,
    signed: c.primary,
  }

  async function load() {
    try {
      const data = await api.get<{ items: Agreement[] }>('/agreements')
      setAgreements(data.items)
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  async function handleSign(id: string) {
    Alert.alert('Sign Agreement', 'Are you sure you want to sign this agreement?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign',
        onPress: async () => {
          setSigning(id)
          try {
            await api.post(`/agreements/${id}/sign`, {})
            await load()
          } catch { /* no-op */ } finally { setSigning(null) }
        },
      },
    ])
  }

  // Tenants get a move-in checklist under their active agreement (this screen
  // is list-only — there is no detail view to hang it on).
  const activeAgreement = agreements.find((a) => a.status === 'active')

  function renderAgreement({ item }: { item: Agreement }) {
    const statusColor = statusColors[item.status] ?? c.muted
    const isPending = item.status === 'pending_signature' || item.status === 'pending'
    return (
      <View>
      <View style={[s.card, neuCard(c)]}>
        <View style={s.cardTop}>
          <View style={[s.cardIcon, { backgroundColor: c.primary + '10' }]}>
            <Ionicons name="document-text" size={20} color={c.primary} />
          </View>
          <View style={s.cardBody}>
            <Text style={[s.cardId, { color: c.primaryDark }]}>AGR-{item.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={[s.cardProp, { color: c.muted }]}>Property: {item.propertyId.slice(0, 8).toUpperCase()}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[s.badgeText, { color: statusColor }]}>{item.status.replace('_', ' ')}</Text>
          </View>
        </View>

        <View style={[s.cardDetails, { borderTopColor: c.border }]}>
          <View style={s.detailRow}>
            <Ionicons name="cash-outline" size={14} color={c.muted} />
            <Text style={[s.detailLabel, { color: c.muted }]}>Rent</Text>
            <Text style={[s.detailValue, { color: c.primaryDark }]}>{formatCurrency(item.rentAmount)}</Text>
          </View>
          <View style={s.detailRow}>
            <Ionicons name="calendar-outline" size={14} color={c.muted} />
            <Text style={[s.detailLabel, { color: c.muted }]}>Start</Text>
            <Text style={[s.detailValue, { color: c.primaryDark }]}>{formatDate(item.startDate)}</Text>
          </View>
          <View style={s.detailRow}>
            <Ionicons name="calendar-outline" size={14} color={c.muted} />
            <Text style={[s.detailLabel, { color: c.muted }]}>End</Text>
            <Text style={[s.detailValue, { color: c.primaryDark }]}>{formatDate(item.endDate)}</Text>
          </View>
        </View>

        {isPending && (
          <TouchableOpacity style={[s.signBtn, { backgroundColor: c.primary }]} onPress={() => handleSign(item.id)} disabled={signing === item.id}>
            {signing === item.id ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="create-outline" size={18} color="#ffffff" />
                <Text style={s.signBtnText}>Sign Agreement</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
      {isTenant && activeAgreement?.id === item.id && (
        <MoveInChecklist agreementId={item.id} propertyId={item.propertyId} />
      )}
      </View>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>
      <FlatList
        data={agreements}
        keyExtractor={(item) => item.id}
        renderItem={renderAgreement}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListEmptyComponent={
          loading ? (
            <View style={s.empty}>
              <ListSkeleton />
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="document-text-outline" size={48} color={c.muted} />
              <Text style={[s.emptyText, { color: c.muted }]}>No agreements found</Text>
            </View>
          )
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.md, gap: spacing.md },
  // Cards — depth comes from neuCard() at the call site
  card: { padding: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  cardIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  cardBody: { flex: 1 },
  cardId: { fontSize: 14, fontFamily: 'Outfit_700Bold' },
  cardProp: { fontSize: 11, marginTop: 2, fontFamily: 'Outfit_400Regular' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: 'Outfit_700Bold', textTransform: 'capitalize' },
  cardDetails: { borderTopWidth: 1, paddingTop: spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  detailLabel: { fontSize: 12, width: 40, fontFamily: 'Outfit_400Regular' },
  detailValue: { fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  signBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 10, marginTop: spacing.sm },
  signBtnText: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: '#ffffff' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Outfit_500Medium' },
  // Move-in checklist (tenant, active agreement)
  checklistCard: { padding: spacing.md, marginTop: spacing.sm },
  checklistHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  checklistTitle: { flex: 1, fontSize: 14, fontFamily: 'Outfit_700Bold' },
  checklistCount: { fontSize: 12, fontFamily: 'Outfit_600SemiBold' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: spacing.sm },
  progressFill: { height: '100%', borderRadius: 3 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  taskIconDone: { opacity: 0.5 },
  taskLabel: { flex: 1, fontSize: 13, fontFamily: 'Outfit_500Medium' },
  nearbyLink: { fontSize: 11, fontFamily: 'Outfit_600SemiBold' },
  cityNote: { fontSize: 11, fontFamily: 'Outfit_400Regular', marginTop: spacing.sm },
})
