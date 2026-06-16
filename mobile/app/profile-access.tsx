import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { useAuthStore } from '../stores/authStore'
import { api } from '../lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

interface AccessRequest {
  id: string
  requesterId: string
  tenantId: string
  propertyId?: string
  status: 'pending' | 'approved' | 'denied' | 'revoked'
  requestedAt: string
  respondedAt?: string
  message?: string
  requesterName?: string
  requesterEmail?: string
  tenantName?: string
  tenantEmail?: string
}

type FilterType = 'all' | 'pending' | 'approved' | 'denied' | 'revoked'

export default function ProfileAccessScreen() {
  const c = useThemeColors()
  const user = useAuthStore((s) => s.user)
  const isTenant = user?.activeRole === 'tenant'
  const qc = useQueryClient()
  const [filter, setFilter] = useState<FilterType>('all')

  const { data: requests, isLoading } = useQuery<AccessRequest[]>({
    queryKey: ['profile-access-requests'],
    queryFn: () => api.get('/profile-access/requests'),
  })

  const respondMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'deny' }) =>
      api.post(`/profile-access/${id}/respond`, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-access-requests'] }),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/profile-access/${id}/revoke`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile-access-requests'] }),
  })

  const filtered = (requests ?? []).filter((r) => filter === 'all' || r.status === filter)
  const counts = {
    all: requests?.length ?? 0,
    pending: requests?.filter((r) => r.status === 'pending').length ?? 0,
    approved: requests?.filter((r) => r.status === 'approved').length ?? 0,
    denied: requests?.filter((r) => r.status === 'denied').length ?? 0,
    revoked: requests?.filter((r) => r.status === 'revoked').length ?? 0,
  }

  function handleApprove(id: string) {
    Alert.alert('Approve Access', 'Allow this user to view your tenant profile?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => respondMutation.mutate({ id, action: 'approve' }) },
    ])
  }

  function handleDeny(id: string) {
    Alert.alert('Deny Access', 'Deny this user access to your tenant profile?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deny', style: 'destructive', onPress: () => respondMutation.mutate({ id, action: 'deny' }) },
    ])
  }

  function handleRevoke(id: string) {
    Alert.alert('Revoke Access', 'This user will no longer be able to view your profile.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => revokeMutation.mutate(id) },
    ])
  }

  const statusColors: Record<string, string> = {
    pending: c.warning,
    approved: c.accent,
    denied: c.danger,
    revoked: c.muted,
  }

  const statusIcons: Record<string, string> = {
    pending: 'time-outline',
    approved: 'checkmark-circle-outline',
    denied: 'close-circle-outline',
    revoked: 'ban-outline',
  }

  const filters: FilterType[] = ['all', 'pending', 'approved', 'denied', 'revoked']

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function renderRequest({ item }: { item: AccessRequest }) {
    const otherName = isTenant ? item.requesterName : item.tenantName
    const otherEmail = isTenant ? item.requesterEmail : item.tenantEmail
    const color = statusColors[item.status]

    return (
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
        {/* Header */}
        <View style={s.cardHeader}>
          <View style={[s.avatar, { backgroundColor: c.primary + '15' }]}>
            <Ionicons name="person-outline" size={18} color={c.primary} />
          </View>
          <View style={s.cardInfo}>
            <Text style={[s.cardName, { color: c.text }]}>{otherName ?? 'Unknown User'}</Text>
            {otherEmail && <Text style={[s.cardEmail, { color: c.muted }]}>{otherEmail}</Text>}
          </View>
          <View style={[s.statusBadge, { backgroundColor: color + '18' }]}>
            <Ionicons name={statusIcons[item.status] as keyof typeof Ionicons.glyphMap} size={12} color={color} />
            <Text style={[s.statusText, { color }]}>{item.status}</Text>
          </View>
        </View>

        {/* Meta */}
        <View style={s.meta}>
          <View style={s.metaItem}>
            <Ionicons name="time-outline" size={12} color={c.muted} />
            <Text style={[s.metaText, { color: c.muted }]}>Requested {formatDate(item.requestedAt)}</Text>
          </View>
          {item.respondedAt && (
            <View style={s.metaItem}>
              <Ionicons name="checkmark-outline" size={12} color={c.muted} />
              <Text style={[s.metaText, { color: c.muted }]}>Responded {formatDate(item.respondedAt)}</Text>
            </View>
          )}
        </View>

        {/* Message */}
        {item.message && (
          <View style={[s.messageBox, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[s.messageText, { color: c.textLight }]}>"{item.message}"</Text>
          </View>
        )}

        {/* Actions */}
        {isTenant && item.status === 'pending' && (
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: c.accent }]}
              onPress={() => handleApprove(item.id)}
              disabled={respondMutation.isPending}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={s.actionBtnText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, s.actionBtnOutline, { borderColor: c.danger }]}
              onPress={() => handleDeny(item.id)}
              disabled={respondMutation.isPending}
            >
              <Ionicons name="close" size={16} color={c.danger} />
              <Text style={[s.actionBtnText, { color: c.danger }]}>Deny</Text>
            </TouchableOpacity>
          </View>
        )}

        {isTenant && item.status === 'approved' && (
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.actionBtn, s.actionBtnOutline, { borderColor: c.danger }]}
              onPress={() => handleRevoke(item.id)}
              disabled={revokeMutation.isPending}
            >
              <Ionicons name="ban-outline" size={16} color={c.danger} />
              <Text style={[s.actionBtnText, { color: c.danger }]}>Revoke Access</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isTenant && item.status === 'approved' && (
          <View style={s.actions}>
            <View style={[s.hintBox, { backgroundColor: c.accent + '12' }]}>
              <Ionicons name="eye-outline" size={14} color={c.accent} />
              <Text style={[s.hintText, { color: c.accent }]}>You can view this tenant's profile</Text>
            </View>
          </View>
        )}

        {!isTenant && (item.status === 'denied' || item.status === 'revoked') && (
          <View style={s.actions}>
            <View style={[s.hintBox, { backgroundColor: c.muted + '12' }]}>
              <Ionicons name="refresh-outline" size={14} color={c.muted} />
              <Text style={[s.hintText, { color: c.muted }]}>You can re-request from the property page</Text>
            </View>
          </View>
        )}
      </View>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>
      {/* Description */}
      <Text style={[s.description, { color: c.muted }]}>
        {isTenant
          ? 'Manage who can view your tenant profile.'
          : 'View the status of your access requests.'}
      </Text>

      {/* Filters */}
      <View style={s.filters}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              s.filterBtn,
              { borderColor: c.border },
              filter === f && { borderColor: c.primary, backgroundColor: c.primary + '12' },
            ]}
            onPress={() => setFilter(f)}
          >
            <Text style={[
              s.filterText,
              { color: c.muted },
              filter === f && { color: c.primary, fontFamily: 'Manrope_600SemiBold' },
            ]}>
              {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderRequest}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="lock-closed-outline" size={40} color={c.muted} />
              <Text style={[s.emptyTitle, { color: c.text }]}>
                {filter === 'all' ? 'No access requests yet' : `No ${filter} requests`}
              </Text>
              <Text style={[s.emptyDesc, { color: c.muted }]}>
                {isTenant
                  ? 'When someone requests access to your profile, it will appear here.'
                  : 'When you request access to a tenant\'s profile, it will appear here.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  description: { fontSize: 13, fontFamily: 'Manrope_400Regular', paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  filterText: { fontSize: 12, fontFamily: 'Manrope_500Medium', textTransform: 'capitalize' },
  list: { padding: spacing.md, gap: 12 },
  card: { borderRadius: 12, borderWidth: 1, padding: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  cardEmail: { fontSize: 12, fontFamily: 'Manrope_400Regular', marginTop: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  messageBox: { marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1 },
  messageText: { fontSize: 12, fontFamily: 'Manrope_400Regular', fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  actionBtnOutline: { backgroundColor: 'transparent', borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },
  hintBox: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flex: 1 },
  hintText: { fontSize: 12, fontFamily: 'Manrope_500Medium' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold' },
  emptyDesc: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingHorizontal: 40 },
})
