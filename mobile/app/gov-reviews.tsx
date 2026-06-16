import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { formatCurrency, formatDate } from '../lib/format'
import { api } from '../lib/api'

interface PendingProperty {
  id: string
  title: string
  address: { street: string; city: string; region: string }
  rentAmount: number
  landlordName?: string
  createdAt: string
}

export default function GovReviewsScreen() {
  const c = useThemeColors()
  const [properties, setProperties] = useState<PendingProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actioningId, setActioningId] = useState<string | null>(null)

  async function load() {
    try {
      const data = await api.get<{ items: PendingProperty[] }>('/properties/pending-review')
      setProperties(data.items ?? [])
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function handleApprove(id: string) {
    Alert.alert('Approve Property', 'Are you sure you want to approve this property listing?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          setActioningId(id)
          try {
            await api.post(`/properties/${id}/review`, { action: 'approve' })
            Alert.alert('Approved', 'Property has been approved and is now listed.')
            setProperties((prev) => prev.filter((p) => p.id !== id))
          } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to approve property')
    } finally { setActioningId(null) }
        },
      },
    ])
  }

  function handleReject(id: string) {
    Alert.prompt(
      'Reject Property',
      'Please provide a reason for rejection:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async (reason?: string) => {
            if (!reason?.trim()) {
              Alert.alert('Error', 'A rejection reason is required.')
              return
            }
            setActioningId(id)
            try {
              await api.post(`/properties/${id}/review`, { action: 'reject', reason: reason.trim() })
              Alert.alert('Rejected', 'Property has been rejected.')
              setProperties((prev) => prev.filter((p) => p.id !== id))
            } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to reject property')
    } finally { setActioningId(null) }
          },
        },
      ],
      'plain-text',
      '',
      'default',
    )
  }

  function renderProperty({ item }: { item: PendingProperty }) {
    const isActioning = actioningId === item.id
    return (
      <View style={[s.card, { backgroundColor: c.white }]}>
        <View style={s.cardHeader}>
          <View style={[s.cardIcon, { backgroundColor: c.warning + '15' }]}>
            <Ionicons name="business-outline" size={20} color={c.warning} />
          </View>
          <View style={s.cardHeaderText}>
            <Text style={[s.cardTitle, { color: c.primaryDark }]} numberOfLines={1}>{item.title}</Text>
            <View style={s.cardMeta}>
              <Ionicons name="location-outline" size={12} color={c.muted} />
              <Text style={[s.metaText, { color: c.muted }]} numberOfLines={1}>
                {item.address?.city}, {item.address?.region}
              </Text>
            </View>
          </View>
        </View>

        <View style={[s.cardDetails, { borderTopColor: c.border }]}>
          <View style={s.detailRow}>
            <Ionicons name="cash-outline" size={14} color={c.accent} />
            <Text style={[s.detailLabel, { color: c.muted }]}>Rent</Text>
            <Text style={[s.detailValue, { color: c.text }]}>{formatCurrency(item.rentAmount)}/mo</Text>
          </View>
          <View style={s.detailRow}>
            <Ionicons name="person-outline" size={14} color={c.primary} />
            <Text style={[s.detailLabel, { color: c.muted }]}>Landlord</Text>
            <Text style={[s.detailValue, { color: c.text }]}>{item.landlordName ?? 'Unknown'}</Text>
          </View>
          <View style={s.detailRow}>
            <Ionicons name="calendar-outline" size={14} color={c.secondary} />
            <Text style={[s.detailLabel, { color: c.muted }]}>Submitted</Text>
            <Text style={[s.detailValue, { color: c.text }]}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>

        <View style={s.cardActions}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: c.accent }]}
            onPress={() => handleApprove(item.id)}
            disabled={isActioning}
            activeOpacity={0.8}
          >
            {isActioning ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#ffffff" />
                <Text style={s.actionBtnText}>Approve</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: c.danger }]}
            onPress={() => handleReject(item.id)}
            disabled={isActioning}
            activeOpacity={0.8}
          >
            <Ionicons name="close-circle-outline" size={18} color="#ffffff" />
            <Text style={s.actionBtnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>
      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        renderItem={renderProperty}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListEmptyComponent={
          loading ? (
            <View style={s.empty}>
              <ActivityIndicator size="large" color={c.primary} />
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={c.muted} />
              <Text style={[s.emptyTitle, { color: c.text }]}>All caught up!</Text>
              <Text style={[s.emptyDesc, { color: c.muted }]}>No properties pending review.</Text>
            </View>
          )
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.md, gap: spacing.sm },
  card: { borderRadius: 14, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  cardIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  cardHeaderText: { flex: 1 },
  cardTitle: { fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { fontSize: 12, fontFamily: 'Manrope_400Regular', flex: 1 },
  cardDetails: { borderTopWidth: 1, paddingTop: spacing.sm, gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel: { fontSize: 12, fontFamily: 'Manrope_400Regular', width: 70 },
  detailValue: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', flex: 1 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: spacing.md },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  actionBtnText: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },
  empty: { alignItems: 'center', paddingVertical: 80, gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  emptyDesc: { fontSize: 13, textAlign: 'center', fontFamily: 'Manrope_400Regular' },
})
