import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { formatCurrency, formatDate } from '../lib/format'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { ListSkeleton } from '../components/Skeleton'

interface Application {
  id: string
  tenantId: string
  propertyId: string
  landlordId: string
  status: string
  message: string
  sharedSections?: string[]
  moveInDate: string
  duration: number
  offeredRent?: number
  landlordNotes?: string
  respondedAt?: string
  propertyTitle: string
  propertyRent: number
  tenantName: string
  tenantEmail: string
  createdAt: string
}

const SECTION_LABELS: Record<string, { label: string; icon: string }> = {
  personal: { label: 'Personal', icon: 'person-outline' },
  professional: { label: 'Employment', icon: 'briefcase-outline' },
  references: { label: 'References', icon: 'call-outline' },
  academic: { label: 'Education', icon: 'school-outline' },
  family: { label: 'Family', icon: 'people-outline' },
  lifestyle: { label: 'Lifestyle', icon: 'heart-outline' },
  history: { label: 'History', icon: 'home-outline' },
  verification: { label: 'Verified', icon: 'shield-checkmark-outline' },
}

export default function ApplicationsScreen() {
  const c = useThemeColors()
  const { user } = useAuthStore()
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')

  const isTenant = user?.activeRole === 'tenant'

  const statusColors: Record<string, string> = {
    pending: c.warning, approved: c.accent, rejected: c.danger, withdrawn: c.muted,
  }

  async function load() {
    try {
      const data = await api.get<{ items: Application[] }>('/applications')
      setApplications(data.items ?? [])
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const displayed = statusFilter
    ? applications.filter((a) => a.status === statusFilter)
    : applications

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  async function handleWithdraw(id: string) {
    Alert.alert('Withdraw Application', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: async () => {
        setActionLoading(id)
        try { await api.post(`/applications/${id}/withdraw`, {}); await load() }
        catch { /* no-op */ } finally { setActionLoading(null) }
      }},
    ])
  }

  async function handleRespond(id: string, action: 'approve' | 'reject', title: string) {
    Alert.alert(
      action === 'approve' ? 'Approve' : 'Reject',
      `${action === 'approve' ? 'Approve' : 'Reject'} application for "${title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: action === 'approve' ? 'Approve' : 'Reject', style: action === 'reject' ? 'destructive' : 'default', onPress: async () => {
          setActionLoading(id)
          try { await api.post(`/applications/${id}/respond`, { action }); await load() }
          catch { /* no-op */ } finally { setActionLoading(null) }
        }},
      ]
    )
  }

  const counts = {
    all: applications.length,
    pending: applications.filter((a) => a.status === 'pending').length,
    approved: applications.filter((a) => a.status === 'approved').length,
    rejected: applications.filter((a) => a.status === 'rejected').length,
  }

  function renderApplication({ item }: { item: Application }) {
    const color = statusColors[item.status] ?? c.muted
    const isActing = actionLoading === item.id

    return (
      <View style={[s.card, { backgroundColor: c.white }]}>
        {/* Top: status strip */}
        <View style={[s.strip, { backgroundColor: color + '10' }]}>
          <View style={[s.statusDot, { backgroundColor: color }]} />
          <Text style={[s.statusLabel, { color }]}>{item.status}</Text>
          <Text style={[s.dateLabel, { color: c.muted }]}>{item.createdAt ? formatDate(item.createdAt) : ''}</Text>
        </View>

        <View style={s.body}>
          {/* Property + tenant */}
          <View style={s.titleRow}>
            <Ionicons name="business-outline" size={14} color={c.primary} />
            <Text style={[s.propertyTitle, { color: c.primaryDark }]} numberOfLines={1}>{item.propertyTitle}</Text>
          </View>
          {!isTenant && (
            <View style={s.tenantRow}>
              <Ionicons name="person-outline" size={11} color={c.muted} />
              <Text style={[s.tenantText, { color: c.muted }]} numberOfLines={1}>{item.tenantName} · {item.tenantEmail}</Text>
            </View>
          )}

          {/* Key details */}
          <View style={s.detailsRow}>
            {item.moveInDate ? (
              <View style={[s.chip, { backgroundColor: c.surface }]}>
                <Ionicons name="calendar-outline" size={11} color={c.muted} />
                <Text style={[s.chipText, { color: c.text }]}>{formatDate(item.moveInDate)}</Text>
              </View>
            ) : null}
            <View style={[s.chip, { backgroundColor: c.surface }]}>
              <Ionicons name="time-outline" size={11} color={c.muted} />
              <Text style={[s.chipText, { color: c.text }]}>{item.duration ?? '—'} months</Text>
            </View>
            <View style={[s.chip, { backgroundColor: c.primary + '08' }]}>
              <Text style={[s.chipText, { color: c.primary, fontFamily: 'Manrope_700Bold' }]}>
                {formatCurrency(item.offeredRent ?? item.propertyRent ?? 0)}/mo
              </Text>
            </View>
          </View>

          {/* Shared sections */}
          {Array.isArray(item.sharedSections) && item.sharedSections.length > 0 && (
            <View style={s.sectionsRow}>
              {item.sharedSections.map((key) => {
                const sec = SECTION_LABELS[key]
                if (!sec) return null
                return (
                  <View key={key} style={[s.sectionChip, { backgroundColor: c.accent + '08' }]}>
                    <Ionicons name={sec.icon as keyof typeof Ionicons.glyphMap} size={10} color={c.accent} />
                    <Text style={[s.sectionChipText, { color: c.accent }]}>{sec.label}</Text>
                  </View>
                )
              })}
            </View>
          )}

          {/* Landlord notes */}
          {item.landlordNotes ? (
            <View style={[s.notesBox, { backgroundColor: c.surface }]}>
              <Text style={[s.notesText, { color: c.textLight }]} numberOfLines={2}>{item.landlordNotes}</Text>
            </View>
          ) : null}

          {/* Actions */}
          {item.status === 'pending' && (
            <View style={s.actions}>
              {isTenant ? (
                <TouchableOpacity style={[s.actionBtn, { borderColor: c.danger + '30' }]} onPress={() => handleWithdraw(item.id)} disabled={isActing}>
                  {isActing ? <ActivityIndicator size="small" color={c.danger} /> : (
                    <><Ionicons name="close" size={14} color={c.danger} /><Text style={[s.actionBtnText, { color: c.danger }]}>Withdraw</Text></>
                  )}
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity style={[s.actionBtn, s.approveBtn, { backgroundColor: c.accent }]} onPress={() => handleRespond(item.id, 'approve', item.propertyTitle)} disabled={isActing}>
                    {isActing ? <ActivityIndicator size="small" color="#fff" /> : (
                      <><Ionicons name="checkmark" size={14} color="#fff" /><Text style={[s.actionBtnText, { color: '#fff' }]}>Approve</Text></>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, { borderColor: c.danger + '30' }]} onPress={() => handleRespond(item.id, 'reject', item.propertyTitle)} disabled={isActing}>
                    <Ionicons name="close" size={14} color={c.danger} />
                    <Text style={[s.actionBtnText, { color: c.danger }]}>Reject</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
          {item.status === 'approved' && (
            <View style={[s.approvedNote, { backgroundColor: c.accent + '10' }]}>
              <Ionicons name="document-text" size={13} color={c.accent} />
              <Text style={[s.approvedNoteText, { color: c.accent }]}>Agreement created</Text>
            </View>
          )}
        </View>
      </View>
    )
  }

  if (loading) {
    return <View style={[s.container, { backgroundColor: c.surface }]}><View style={{ padding: spacing.md }}><ListSkeleton /></View></View>
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>
      {/* Filter chips */}
      <View style={[s.filterBar, { borderColor: c.border }]}>
        {[
          { key: '', label: `All (${counts.all})` },
          { key: 'pending', label: `Pending (${counts.pending})` },
          { key: 'approved', label: `Approved (${counts.approved})` },
          { key: 'rejected', label: `Rejected (${counts.rejected})` },
        ].map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterChip, { borderColor: c.border }, statusFilter === f.key && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={[s.filterChipText, { color: c.muted }, statusFilter === f.key && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id}
        renderItem={renderApplication}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="document-text-outline" size={48} color={c.muted} />
            <Text style={[s.emptyTitle, { color: c.primaryDark }]}>{isTenant ? 'No applications yet' : 'No applications received'}</Text>
            <Text style={[s.emptySubtitle, { color: c.muted }]}>{isTenant ? 'Browse properties and apply to get started.' : 'Tenant applications will appear here.'}</Text>
          </View>
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  filterBar: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1.5 },
  filterChipText: { fontSize: 11, fontFamily: 'Manrope_500Medium' },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 40 },
  card: { borderRadius: 14, overflow: 'hidden' },
  strip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },
  dateLabel: { fontSize: 10, fontFamily: 'Manrope_400Regular', marginLeft: 'auto' },
  body: { padding: 14, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  propertyTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold', flex: 1 },
  tenantRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -4 },
  tenantText: { fontSize: 11, fontFamily: 'Manrope_400Regular', flex: 1 },
  detailsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  chipText: { fontSize: 11, fontFamily: 'Manrope_500Medium' },
  sectionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  sectionChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  sectionChipText: { fontSize: 9, fontFamily: 'Manrope_600SemiBold' },
  notesBox: { borderRadius: 8, padding: 8 },
  notesText: { fontSize: 11, fontFamily: 'Manrope_400Regular', lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  approveBtn: { borderWidth: 0 },
  actionBtnText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  approvedNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  approvedNoteText: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm, paddingHorizontal: spacing.lg },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
})
