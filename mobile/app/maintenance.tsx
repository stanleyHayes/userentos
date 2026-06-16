import { useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useThemeColors, spacing } from '../lib/theme'
import { formatDate, formatCurrency } from '../lib/format'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

type Status = 'requested' | 'acknowledged' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
type Priority = 'low' | 'medium' | 'high' | 'urgent'
type Category = 'plumbing' | 'electrical' | 'structural' | 'pest' | 'appliance' | 'security' | 'other'

interface MaintenanceRequest {
  id: string
  propertyId: string
  propertyTitle?: string
  title: string
  description: string
  category: Category
  priority: Priority
  status: Status
  images?: string[]
  scheduledDate?: string
  cost?: number
  createdAt: string
  updatedAt: string
}

const STATUSES: { key: Status; label: string; color: string }[] = [
  { key: 'requested', label: 'Requested', color: '#f59e0b' },
  { key: 'acknowledged', label: 'Acknowledged', color: '#3b82f6' },
  { key: 'scheduled', label: 'Scheduled', color: '#8b5cf6' },
  { key: 'in_progress', label: 'In Progress', color: '#06b6d4' },
  { key: 'completed', label: 'Completed', color: '#10b981' },
]

const PRIORITY_COLORS: Record<Priority, string> = {
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#f59e0b',
  urgent: '#ef4444',
}

const CATEGORIES: Category[] = ['plumbing', 'electrical', 'structural', 'pest', 'appliance', 'security', 'other']
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

function relativeTime(iso?: string) {
  if (!iso) return ''
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return ''
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(iso)
}

export default function MaintenanceScreen() {
  const c = useThemeColors()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const role = user?.activeRole ?? 'tenant'
  const isTenant = role === 'tenant'

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => api.get<{ items: MaintenanceRequest[] }>('/maintenance'),
  })

  const items = data?.items ?? []

  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const filtered = useMemo(() => {
    if (isTenant || statusFilter === 'all') return items
    return items.filter((it) => it.status === statusFilter)
  }, [items, statusFilter, isTenant])

  const [showCreate, setShowCreate] = useState(false)
  const [propertyId, setPropertyId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<Category>('other')
  const [priority, setPriority] = useState<Priority>('medium')
  const [submitting, setSubmitting] = useState(false)

  // Detail/move modal (landlord)
  const [selectedReq, setSelectedReq] = useState<MaintenanceRequest | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<Status | null>(null)

  function resetCreate() {
    setShowCreate(false)
    setPropertyId('')
    setTitle('')
    setDescription('')
    setCategory('other')
    setPriority('medium')
  }

  async function submit() {
    if (!propertyId.trim() || !title.trim() || !description.trim()) {
      Alert.alert('Missing fields', 'Please complete property, title and description')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/maintenance', {
        propertyId: propertyId.trim(),
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
      })
      qc.invalidateQueries({ queryKey: ['maintenance'] })
      Alert.alert('Submitted', 'Maintenance request created')
      resetCreate()
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  async function moveTo(id: string, next: Status) {
    setUpdatingStatus(next)
    try {
      if (next === 'completed') {
        await api.post(`/maintenance/${id}/complete`, {})
      } else {
        await api.patch(`/maintenance/${id}`, { status: next })
      }
      qc.invalidateQueries({ queryKey: ['maintenance'] })
      setSelectedReq(null)
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message ?? 'Failed to update')
    } finally {
      setUpdatingStatus(null)
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
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={c.primary} />}
      >
        <TouchableOpacity
          style={[s.newBtn, { backgroundColor: c.primary }]}
          onPress={() => setShowCreate(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={s.newBtnText}>New Request</Text>
        </TouchableOpacity>

        {!isTenant && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingBottom: spacing.sm }}
            style={{ marginBottom: spacing.sm }}
          >
            <FilterChip
              label={`All (${items.length})`}
              active={statusFilter === 'all'}
              onPress={() => setStatusFilter('all')}
              color={c.primary}
              c={c}
            />
            {STATUSES.map((st) => {
              const count = items.filter((it) => it.status === st.key).length
              return (
                <FilterChip
                  key={st.key}
                  label={`${st.label} (${count})`}
                  active={statusFilter === st.key}
                  onPress={() => setStatusFilter(st.key)}
                  color={st.color}
                  c={c}
                />
              )
            })}
          </ScrollView>
        )}

        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="construct-outline" size={48} color={c.muted} />
            <Text style={[s.emptyText, { color: c.muted }]}>No maintenance requests</Text>
            <Text style={[s.emptySub, { color: c.muted }]}>
              {isTenant
                ? 'Submit a request when something at your rental needs fixing.'
                : "You're all caught up. New requests will land here."}
            </Text>
          </View>
        ) : (
          filtered.map((req) => {
            const statusMeta = STATUSES.find((st) => st.key === req.status)
            return (
              <TouchableOpacity
                key={req.id}
                style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={() => !isTenant && setSelectedReq(req)}
                activeOpacity={0.7}
                disabled={isTenant}
              >
                <View style={s.cardRow}>
                  <View style={[s.iconWrap, { backgroundColor: c.primary + '15' }]}>
                    <Ionicons name="construct" size={18} color={c.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.titleRow}>
                      <Text style={[s.cardTitle, { color: c.text }]} numberOfLines={1}>{req.title}</Text>
                      <View style={[s.priorityBadge, { backgroundColor: PRIORITY_COLORS[req.priority] + '20' }]}>
                        <Text style={[s.priorityText, { color: PRIORITY_COLORS[req.priority] }]}>
                          {req.priority}
                        </Text>
                      </View>
                    </View>
                    <Text style={[s.cardMeta, { color: c.muted }]} numberOfLines={1}>
                      {req.propertyTitle ?? req.propertyId} · {req.category}
                    </Text>
                    <View style={s.statusRow}>
                      <View style={[s.statusDot, { backgroundColor: statusMeta?.color ?? c.muted }]} />
                      <Text style={[s.statusLabel, { color: c.text }]}>
                        {req.status.replace(/_/g, ' ')}
                      </Text>
                      <Text style={[s.timeLabel, { color: c.muted }]}>
                        {' · '}{relativeTime(req.updatedAt)}
                      </Text>
                    </View>
                    {(req.scheduledDate || req.cost !== undefined) && (
                      <View style={s.metaFooter}>
                        {req.scheduledDate && (
                          <View style={s.metaItem}>
                            <Ionicons name="calendar-outline" size={11} color={c.muted} />
                            <Text style={[s.metaText, { color: c.muted }]}>{formatDate(req.scheduledDate)}</Text>
                          </View>
                        )}
                        {req.cost !== undefined && (
                          <Text style={[s.costText, { color: c.text }]}>{formatCurrency(req.cost)}</Text>
                        )}
                      </View>
                    )}
                  </View>
                  {!isTenant && <Ionicons name="chevron-forward" size={16} color={c.muted} />}
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={resetCreate}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>New Maintenance Request</Text>
              <TouchableOpacity onPress={resetCreate} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.label, { color: c.text }]}>Property ID</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                value={propertyId}
                onChangeText={setPropertyId}
                placeholder="Property identifier"
                placeholderTextColor={c.muted}
              />

              <Text style={[s.label, { color: c.text }]}>Title</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Kitchen tap leaking"
                placeholderTextColor={c.muted}
              />

              <Text style={[s.label, { color: c.text }]}>Description</Text>
              <TextInput
                style={[s.input, s.textArea, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the issue in detail"
                placeholderTextColor={c.muted}
                multiline
                numberOfLines={4}
              />

              <Text style={[s.label, { color: c.text }]}>Category</Text>
              <View style={s.chipWrap}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      s.chip,
                      { borderColor: c.border, backgroundColor: c.surface },
                      category === cat && { borderColor: c.primary, backgroundColor: c.primary + '10' },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[
                      s.chipText,
                      { color: c.text },
                      category === cat && { color: c.primary, fontFamily: 'Manrope_700Bold' },
                    ]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.label, { color: c.text }]}>Priority</Text>
              <View style={s.chipWrap}>
                {PRIORITIES.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      s.chip,
                      { borderColor: c.border, backgroundColor: c.surface },
                      priority === p && { borderColor: PRIORITY_COLORS[p], backgroundColor: PRIORITY_COLORS[p] + '15' },
                    ]}
                    onPress={() => setPriority(p)}
                  >
                    <Text style={[
                      s.chipText,
                      { color: c.text },
                      priority === p && { color: PRIORITY_COLORS[p], fontFamily: 'Manrope_700Bold' },
                    ]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.primary }, submitting && { opacity: 0.6 }]}
                onPress={submit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Submit Request</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Status Move Modal (landlord) */}
      <Modal visible={!!selectedReq} animationType="fade" transparent onRequestClose={() => setSelectedReq(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.actionSheet, { backgroundColor: c.card }]}>
            <Text style={[s.modalTitle, { color: c.text, marginBottom: spacing.md }]}>
              Move to…
            </Text>
            {selectedReq && STATUSES.filter((st) => st.key !== selectedReq.status).map((st) => (
              <TouchableOpacity
                key={st.key}
                style={[s.statusOption, { borderColor: c.border }]}
                onPress={() => moveTo(selectedReq.id, st.key)}
                disabled={updatingStatus !== null}
              >
                <View style={[s.statusDotLarge, { backgroundColor: st.color }]} />
                <Text style={[s.statusOptionText, { color: c.text }]}>{st.label}</Text>
                {updatingStatus === st.key && <ActivityIndicator size="small" color={c.primary} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[s.statusOption, { borderColor: c.border, marginTop: spacing.sm }]}
              onPress={() => selectedReq && moveTo(selectedReq.id, 'cancelled')}
              disabled={updatingStatus !== null}
            >
              <View style={[s.statusDotLarge, { backgroundColor: c.danger }]} />
              <Text style={[s.statusOptionText, { color: c.danger }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSelectedReq(null)}
              style={[s.cancelBtn, { borderColor: c.border }]}
            >
              <Text style={[s.cancelText, { color: c.muted }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function FilterChip({
  label, active, onPress, color, c,
}: {
  label: string
  active: boolean
  onPress: () => void
  color: string
  c: ReturnType<typeof useThemeColors>
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        s.filterChip,
        { backgroundColor: active ? color : c.surface, borderColor: active ? color : c.border },
      ]}
    >
      <Text style={[s.filterChipText, { color: active ? '#fff' : c.text }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, marginBottom: spacing.md,
  },
  newBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  filterChipText: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  emptySub: { fontSize: 12, fontFamily: 'Manrope_400Regular', textAlign: 'center', paddingHorizontal: spacing.xl },
  card: { borderRadius: 14, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  cardRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  iconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold', flex: 1 },
  priorityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  priorityText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'uppercase' },
  cardMeta: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 2, textTransform: 'capitalize' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  statusLabel: { fontSize: 11, fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize' },
  timeLabel: { fontSize: 10, fontFamily: 'Manrope_400Regular' },
  metaFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 10, fontFamily: 'Manrope_500Medium' },
  costText: { fontSize: 11, fontFamily: 'Manrope_700Bold' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.sm, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, fontFamily: 'Manrope_500Medium' },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  chipText: { fontSize: 12, fontFamily: 'Manrope_500Medium', textTransform: 'capitalize' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12, marginTop: spacing.lg, marginBottom: spacing.md,
  },
  submitText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },

  // Action Sheet
  actionSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, paddingBottom: spacing.xl },
  statusOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: 10, borderWidth: 1, marginBottom: 6,
  },
  statusDotLarge: { width: 10, height: 10, borderRadius: 5 },
  statusOptionText: { flex: 1, fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  cancelBtn: {
    paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', marginTop: spacing.md,
  },
  cancelText: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
})
