import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Alert, Linking,
} from 'react-native'
import { Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
import { api } from '../lib/api'

type ViewingStatus = 'requested' | 'confirmed' | 'completed' | 'cancelled'

interface Viewing {
  id: string
  viewerName: string
  viewerPhone: string
  date: string
  time: string
  notes?: string
  status: ViewingStatus
  propertyTitle: string | null
}

const STATUS_LABELS: Record<ViewingStatus, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<ViewingStatus, string> = {
  requested: '#f59e0b',
  confirmed: '#3b82f6',
  completed: '#10b981',
  cancelled: '#6b7280',
}

export default function AgentViewingsScreen() {
  const c = useThemeColors()
  const [asRequester, setAsRequester] = useState(false)

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: 'Viewings' }} />
      <View style={[s.tabs, { borderBottomColor: c.border }]}>
        <TabButton active={!asRequester} onPress={() => setAsRequester(false)} c={c}>My Schedule</TabButton>
        <TabButton active={asRequester} onPress={() => setAsRequester(true)} c={c}>My Requests</TabButton>
      </View>
      <ViewingsList asRequester={asRequester} />
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

function ViewingsList({ asRequester }: { asRequester: boolean }) {
  const c = useThemeColors()
  const qc = useQueryClient()
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['agent-viewings', asRequester],
    queryFn: () =>
      api.get<{ items: Viewing[] }>(`/agent/viewings${asRequester ? '?asRequester=true' : ''}`),
  })

  const viewings = data?.items ?? []

  function confirmUpdate(viewing: Viewing, status: 'confirmed' | 'completed' | 'cancelled', label: string) {
    Alert.alert(
      label,
      `${label.toLowerCase().replace(/^./, (ch) => ch.toUpperCase())} the viewing with ${viewing.viewerName} on ${viewing.date} at ${viewing.time}?`,
      [
        { text: 'Back', style: 'cancel' },
        { text: 'Confirm', style: status === 'cancelled' ? 'destructive' : 'default', onPress: () => update(viewing.id, status) },
      ],
    )
  }

  async function update(viewingId: string, status: 'confirmed' | 'completed' | 'cancelled') {
    setUpdatingId(viewingId)
    try {
      await api.patch(`/agent/viewings/${viewingId}`, { status })
      qc.invalidateQueries({ queryKey: ['agent-viewings'] })
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to update viewing')
    } finally {
      setUpdatingId(null)
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
      {viewings.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="calendar-outline" size={48} color={c.muted} />
          <Text style={[s.emptyText, { color: c.muted }]}>
            {asRequester ? 'No viewing requests yet' : 'No viewings scheduled'}
          </Text>
          <Text style={[s.emptySub, { color: c.muted }]}>
            {asRequester
              ? 'Book a viewing from any property listing and track it here.'
              : 'Viewing requests from renters will appear here.'}
          </Text>
        </View>
      ) : (
        viewings.map((v) => {
          const busy = updatingId === v.id
          const canCancel = v.status === 'requested' || v.status === 'confirmed'
          return (
            <View key={v.id} style={[s.card, neuCard(c)]}>
              <View style={s.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>{v.viewerName}</Text>
                  <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>
                    {v.propertyTitle ?? 'Property'}
                  </Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: STATUS_COLORS[v.status] + '20' }]}>
                  <Text style={[s.statusText, { color: STATUS_COLORS[v.status] }]}>
                    {STATUS_LABELS[v.status]}
                  </Text>
                </View>
              </View>

              <View style={s.metaRow}>
                <View style={[s.metaBox, neuInset(c)]}>
                  <Ionicons name="calendar-outline" size={13} color={c.primary} />
                  <Text style={[s.metaText, { color: c.text }]}>{v.date}</Text>
                </View>
                <View style={[s.metaBox, neuInset(c)]}>
                  <Ionicons name="time-outline" size={13} color={c.primary} />
                  <Text style={[s.metaText, { color: c.text }]}>{v.time}</Text>
                </View>
                <TouchableOpacity
                  style={[s.metaBox, neuInset(c)]}
                  onPress={() => Linking.openURL(`tel:${v.viewerPhone}`)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="call-outline" size={13} color={c.primary} />
                  <Text style={[s.metaText, { color: c.primary }]}>{v.viewerPhone}</Text>
                </TouchableOpacity>
              </View>

              {v.notes ? (
                <Text style={[s.notes, { color: c.textLight }]} numberOfLines={3}>"{v.notes}"</Text>
              ) : null}

              {(canCancel || (!asRequester && (v.status === 'requested' || v.status === 'confirmed'))) && (
                <View style={s.actionsRow}>
                  {busy ? (
                    <ActivityIndicator size="small" color={c.primary} />
                  ) : (
                    <>
                      {!asRequester && v.status === 'requested' && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: c.primary }]}
                          onPress={() => confirmUpdate(v, 'confirmed', 'Confirm viewing')}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="checkmark" size={14} color="#fff" />
                          <Text style={s.actionBtnTextPrimary}>Confirm</Text>
                        </TouchableOpacity>
                      )}
                      {!asRequester && v.status === 'confirmed' && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: c.accent }]}
                          onPress={() => confirmUpdate(v, 'completed', 'Mark completed')}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="checkmark-done" size={14} color="#fff" />
                          <Text style={s.actionBtnTextPrimary}>Complete</Text>
                        </TouchableOpacity>
                      )}
                      {canCancel && (
                        <TouchableOpacity
                          style={[s.actionBtn, { borderWidth: 1.5, borderColor: c.danger }]}
                          onPress={() => confirmUpdate(v, 'cancelled', 'Cancel viewing')}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="close" size={14} color={c.danger} />
                          <Text style={[s.actionBtnTextPrimary, { color: c.danger }]}>Cancel</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          )
        })
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tabBtn: { paddingHorizontal: spacing.md, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontFamily: 'Outfit_700Bold' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
  emptySub: { fontSize: 12, fontFamily: 'Outfit_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },

  card: { padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { fontSize: 14, fontFamily: 'Outfit_700Bold' },
  cardSub: { fontSize: 11, fontFamily: 'Outfit_400Regular', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontFamily: 'Outfit_700Bold' },

  metaRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  metaBox: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  metaText: { fontSize: 12, fontFamily: 'Outfit_600SemiBold' },

  notes: { fontSize: 12, fontFamily: 'Outfit_400Regular', lineHeight: 17, fontStyle: 'italic' },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 10, paddingVertical: 9,
  },
  actionBtnTextPrimary: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', color: '#fff' },
})
