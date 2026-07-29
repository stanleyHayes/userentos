import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Alert, Linking,
} from 'react-native'
import { Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard } from '../lib/neu'
import { formatDate } from '../lib/format'
import { api } from '../lib/api'

type LeadStatus = 'new' | 'contacted' | 'viewing' | 'applied' | 'closed' | 'lost'

interface Lead {
  id: string
  contactName: string
  contactPhone: string
  contactEmail?: string
  message?: string
  status: LeadStatus
  propertyTitle: string | null
  createdAt: string
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  viewing: 'Viewing',
  applied: 'Applied',
  closed: 'Closed',
  lost: 'Lost',
}

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: '#3b82f6',
  contacted: '#f59e0b',
  viewing: '#8b5cf6',
  applied: '#06b6d4',
  closed: '#10b981',
  lost: '#6b7280',
}

/** Next-step actions offered per pipeline stage. */
const ADVANCE_ACTIONS: Partial<Record<LeadStatus, { label: string; status: LeadStatus; icon: string; danger?: boolean }[]>> = {
  new: [
    { label: 'Mark Contacted', status: 'contacted', icon: 'call-outline' },
    { label: 'Mark Lost', status: 'lost', icon: 'close-circle-outline', danger: true },
  ],
  contacted: [
    { label: 'Viewing Scheduled', status: 'viewing', icon: 'calendar-outline' },
    { label: 'Mark Lost', status: 'lost', icon: 'close-circle-outline', danger: true },
  ],
  viewing: [
    { label: 'Mark Applied', status: 'applied', icon: 'document-text-outline' },
    { label: 'Mark Lost', status: 'lost', icon: 'close-circle-outline', danger: true },
  ],
  applied: [
    { label: 'Close Deal', status: 'closed', icon: 'checkmark-circle-outline' },
    { label: 'Mark Lost', status: 'lost', icon: 'close-circle-outline', danger: true },
  ],
}

export default function AgentLeadsScreen() {
  const c = useThemeColors()
  const qc = useQueryClient()
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['agent-leads', filter],
    queryFn: () => {
      const qs = filter === 'all' ? '' : `?status=${filter}`
      return api.get<{ items: Lead[] }>(`/agent/leads${qs}`)
    },
  })

  const leads = data?.items ?? []

  function confirmAdvance(lead: Lead, status: LeadStatus, label: string) {
    Alert.alert(
      label,
      `Update ${lead.contactName}'s lead to "${STATUS_LABELS[status]}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => advance(lead.id, status) },
      ],
    )
  }

  async function advance(leadId: string, status: LeadStatus) {
    setUpdatingId(leadId)
    try {
      await api.patch(`/agent/leads/${leadId}`, { status })
      qc.invalidateQueries({ queryKey: ['agent-leads'] })
    } catch (e) {
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to update lead')
    } finally {
      setUpdatingId(null)
    }
  }

  if (isLoading) {
    return (
      <View style={[s.center, { backgroundColor: c.background }]}>
        <Stack.Screen options={{ title: 'Leads' }} />
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: 'Leads' }} />
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
          {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((st) => (
            <FilterChip
              key={st}
              label={STATUS_LABELS[st]}
              active={filter === st}
              onPress={() => setFilter(st)}
              c={c}
            />
          ))}
        </ScrollView>

        {leads.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={48} color={c.muted} />
            <Text style={[s.emptyText, { color: c.muted }]}>No leads yet</Text>
            <Text style={[s.emptySub, { color: c.muted }]}>
              When renters tap "I'm interested" on your listings, they land here.
            </Text>
          </View>
        ) : (
          leads.map((lead) => {
            const actions = ADVANCE_ACTIONS[lead.status] ?? []
            const busy = updatingId === lead.id
            return (
              <View key={lead.id} style={[s.card, neuCard(c)]}>
                <View style={s.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>{lead.contactName}</Text>
                    <Text style={[s.cardSub, { color: c.muted }]} numberOfLines={1}>
                      {lead.propertyTitle ?? 'Property'} · {formatDate(lead.createdAt)}
                    </Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: STATUS_COLORS[lead.status] + '20' }]}>
                    <Text style={[s.statusText, { color: STATUS_COLORS[lead.status] }]}>
                      {STATUS_LABELS[lead.status]}
                    </Text>
                  </View>
                </View>

                <View style={s.contactRow}>
                  <TouchableOpacity
                    style={[s.contactChip, { borderColor: c.border }]}
                    onPress={() => Linking.openURL(`tel:${lead.contactPhone}`)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="call-outline" size={13} color={c.primary} />
                    <Text style={[s.contactChipText, { color: c.primary }]}>{lead.contactPhone}</Text>
                  </TouchableOpacity>
                  {lead.contactEmail ? (
                    <TouchableOpacity
                      style={[s.contactChip, { borderColor: c.border }]}
                      onPress={() => Linking.openURL(`mailto:${lead.contactEmail}`)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="mail-outline" size={13} color={c.primary} />
                      <Text style={[s.contactChipText, { color: c.primary }]} numberOfLines={1}>Email</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {lead.message ? (
                  <Text style={[s.message, { color: c.textLight }]} numberOfLines={4}>"{lead.message}"</Text>
                ) : null}

                {actions.length > 0 && (
                  <View style={s.actionsRow}>
                    {busy ? (
                      <ActivityIndicator size="small" color={c.primary} />
                    ) : (
                      actions.map((a) => (
                        <TouchableOpacity
                          key={a.status}
                          style={[
                            s.actionBtn,
                            { borderColor: a.danger ? c.danger : c.primary },
                          ]}
                          onPress={() => confirmAdvance(lead, a.status, a.label)}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name={a.icon as keyof typeof Ionicons.glyphMap}
                            size={14}
                            color={a.danger ? c.danger : c.primary}
                          />
                          <Text style={[s.actionBtnText, { color: a.danger ? c.danger : c.primary }]}>{a.label}</Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}
              </View>
            )
          })
        )}
      </ScrollView>
    </View>
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

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  filterChipText: { fontSize: 11, fontFamily: 'Outfit_600SemiBold' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
  emptySub: { fontSize: 12, fontFamily: 'Outfit_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },

  card: { padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { fontSize: 14, fontFamily: 'Outfit_700Bold' },
  cardSub: { fontSize: 11, fontFamily: 'Outfit_400Regular', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontFamily: 'Outfit_700Bold' },

  contactRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  contactChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  contactChipText: { fontSize: 12, fontFamily: 'Outfit_600SemiBold' },

  message: { fontSize: 12, fontFamily: 'Outfit_400Regular', lineHeight: 17, fontStyle: 'italic' },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: 10, paddingVertical: 9,
  },
  actionBtnText: { fontSize: 12, fontFamily: 'Outfit_600SemiBold' },
})
