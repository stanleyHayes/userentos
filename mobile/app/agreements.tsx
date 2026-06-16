import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { formatCurrency, formatDate } from '../lib/format'
import { api } from '../lib/api'
import { ListSkeleton } from '../components/Skeleton'

interface Agreement {
  id: string; propertyId: string; rentAmount: number; status: string
  startDate: string; endDate: string
}

export default function AgreementsScreen() {
  const c = useThemeColors()
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

  function renderAgreement({ item }: { item: Agreement }) {
    const statusColor = statusColors[item.status] ?? c.muted
    const isPending = item.status === 'pending_signature' || item.status === 'pending'
    return (
      <View style={[s.card, { backgroundColor: c.white }]}>
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
  card: { borderRadius: 12, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  cardIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  cardBody: { flex: 1 },
  cardId: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  cardProp: { fontSize: 11, marginTop: 2, fontFamily: 'Manrope_400Regular' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },
  cardDetails: { borderTopWidth: 1, paddingTop: spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  detailLabel: { fontSize: 12, width: 40, fontFamily: 'Manrope_400Regular' },
  detailValue: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  signBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 12, marginTop: spacing.sm },
  signBtnText: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
})
