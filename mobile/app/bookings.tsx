import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Alert, TextInput, Modal,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

interface Booking {
  id: string
  _id?: string
  type: string
  description: string
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
  scheduledDate?: string
  scheduledTime?: string
  estimatedCost?: number
  finalCost?: number
  quoteAmount?: number
  quoteAccepted?: boolean
  paymentStatus: string
  rating?: number
  review?: string
  notes: { text: string; createdBy: string; createdAt: string }[]
  workerId?: string
  workerName?: string
  requesterId?: string
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  in_progress: '#06b6d4',
  completed: '#10b981',
  cancelled: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export default function BookingsScreen() {
  const c = useThemeColors()
  const qc = useQueryClient()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const [viewMode, setViewMode] = useState<'requester' | 'worker'>('requester')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [noteModal, setNoteModal] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [noteText, setNoteText] = useState('')

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['bookings', viewMode],
    queryFn: () =>
      api.get<{ items: Booking[] }>(`/service-bookings${viewMode === 'worker' ? '?asWorker=true' : ''}`),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/service-bookings/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
    },
  })

  const items = data?.items ?? []
  const filtered = statusFilter === 'all' ? items : items.filter((b) => b.status === statusFilter)

  const canActAsWorker = viewMode === 'worker'

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      <View style={[s.header, { backgroundColor: c.primary }]}>
        <Text style={s.headerTitle}>My Bookings</Text>
        <View style={s.toggleRow}>
          <TouchableOpacity
            style={[s.toggleBtn, viewMode === 'requester' && { backgroundColor: 'rgba(255,255,255,0.2)' }]}
            onPress={() => setViewMode('requester')}
          >
            <Text style={[s.toggleText, viewMode === 'requester' && { color: '#fff' }]}>My Requests</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, viewMode === 'worker' && { backgroundColor: 'rgba(255,255,255,0.2)' }]}
            onPress={() => setViewMode('worker')}
          >
            <Text style={[s.toggleText, viewMode === 'worker' && { color: '#fff' }]}>My Jobs</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterContent}
      >
        {['all', 'pending', 'confirmed', 'in_progress', 'completed'].map((st) => (
          <TouchableOpacity
            key={st}
            style={[
              s.filterChip,
              { backgroundColor: statusFilter === st ? c.primary : c.card, borderColor: c.border },
            ]}
            onPress={() => setStatusFilter(st)}
          >
            <Text style={[s.filterChipText, { color: statusFilter === st ? '#fff' : c.text }]}>
              {st === 'all' ? 'All' : STATUS_LABELS[st]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.primary} />}
        contentContainerStyle={s.listContent}
      >
        {isLoading && !isRefetching ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={48} color={c.muted} />
            <Text style={[s.emptyTitle, { color: c.text }]}>No bookings</Text>
            <Text style={[s.emptySubtitle, { color: c.muted }]}>
              {viewMode === 'requester' ? 'Book a worker to get started' : 'No jobs assigned yet'}
            </Text>
          </View>
        ) : (
          filtered.map((b) => (
            <View key={b.id ?? b._id} style={[s.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={s.cardHeader}>
                <View style={[s.statusBadge, { backgroundColor: STATUS_COLORS[b.status] + '18' }]}>
                  <Text style={[s.statusText, { color: STATUS_COLORS[b.status] }]}>
                    {STATUS_LABELS[b.status]}
                  </Text>
                </View>
                <Text style={[s.dateText, { color: c.muted }]}>
                  {b.scheduledDate ? b.scheduledDate : new Date(b.createdAt).toLocaleDateString()}
                </Text>
              </View>

              <Text style={[s.typeText, { color: c.text }]}>
                {b.type.charAt(0).toUpperCase() + b.type.slice(1)}
              </Text>
              <Text style={[s.descText, { color: c.textLight }]} numberOfLines={2}>
                {b.description}
              </Text>

              {b.quoteAmount !== undefined && (
                <Text style={[s.quoteText, { color: c.primary }]}>
                  Quote: GHS {b.quoteAmount} {b.quoteAccepted ? '(Accepted)' : '(Pending)'}
                </Text>
              )}

              {b.rating !== undefined && (
                <View style={s.ratingRow}>
                  <Ionicons name="star" size={14} color="#f59e0b" />
                  <Text style={[s.ratingText, { color: c.text }]}>{b.rating}</Text>
                  {b.review && <Text style={[s.reviewText, { color: c.textLight }]}>"{b.review}"</Text>}
                </View>
              )}

              {/* Action buttons */}
              <View style={s.actionsRow}>
                {canActAsWorker ? (
                  <>
                    {b.status === 'pending' && (
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: '#3b82f6' }]}
                        onPress={() => updateMutation.mutate({ id: b.id ?? b._id!, body: { status: 'confirmed' } })}
                      >
                        <Text style={s.actionBtnText}>Confirm</Text>
                      </TouchableOpacity>
                    )}
                    {b.status === 'confirmed' && (
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: '#06b6d4' }]}
                        onPress={() => updateMutation.mutate({ id: b.id ?? b._id!, body: { status: 'in_progress' } })}
                      >
                        <Text style={s.actionBtnText}>Start Job</Text>
                      </TouchableOpacity>
                    )}
                    {b.status === 'in_progress' && (
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: '#10b981' }]}
                        onPress={() => updateMutation.mutate({ id: b.id ?? b._id!, body: { status: 'completed' } })}
                      >
                        <Text style={s.actionBtnText}>Complete</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <>
                    {b.status === 'pending' && (
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: '#ef4444' }]}
                        onPress={() => updateMutation.mutate({ id: b.id ?? b._id!, body: { status: 'cancelled' } })}
                      >
                        <Text style={s.actionBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                    {b.status === 'completed' && b.rating === undefined && (
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: '#f59e0b' }]}
                        onPress={() => {
                          setSelectedBooking(b)
                          setNoteModal(true)
                        }}
                      >
                        <Text style={s.actionBtnText}>Rate</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
                <TouchableOpacity
                  style={[s.actionBtnOutline, { borderColor: c.border }]}
                  onPress={() => {
                    setSelectedBooking(b)
                    setNoteModal(true)
                  }}
                >
                  <Text style={[s.actionBtnOutlineText, { color: c.text }]}>Add Note</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Note / Rate Modal */}
      <Modal visible={noteModal} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <Text style={[s.modalTitle, { color: c.text }]}>
              {selectedBooking?.status === 'completed' && selectedBooking?.rating === undefined ? 'Rate & Review' : 'Add Note'}
            </Text>
            <TextInput
              style={[s.input, s.textarea, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
              placeholder="Write your note..."
              placeholderTextColor={c.muted}
              value={noteText}
              onChangeText={setNoteText}
              multiline
            />
            {selectedBooking?.status === 'completed' && selectedBooking?.rating === undefined && (
              <Text style={[s.hint, { color: c.muted }]}>Include a rating (1-5) in your note, e.g. "5 - Excellent work!"</Text>
            )}
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: c.border }]} onPress={() => setNoteModal(false)}>
                <Text style={[s.modalBtnText, { color: c.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: c.primary }]}
                onPress={() => {
                  if (!noteText.trim()) return
                  const body: Record<string, unknown> = { notes: [{ text: noteText, createdBy: viewMode }] }
                  // Try to parse rating from note text
                  const match = noteText.match(/^(\d)/)
                  if (match && selectedBooking?.status === 'completed' && selectedBooking?.rating === undefined) {
                    body.rating = Number(match[1])
                    body.review = noteText.replace(/^\d\s*[-.]?\s*/, '').trim()
                  }
                  updateMutation.mutate({ id: selectedBooking!.id ?? selectedBooking!._id!, body })
                  setNoteModal(false)
                  setNoteText('')
                }}
              >
                <Text style={[s.modalBtnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTitle: { color: '#fff', fontSize: 22, fontFamily: 'Manrope_800ExtraBold' },
  toggleRow: { flexDirection: 'row', marginTop: spacing.md, gap: 8 },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  toggleText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  filterScroll: { marginTop: spacing.md },
  filterContent: { paddingHorizontal: spacing.lg, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  filterChipText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  listContent: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  card: { borderRadius: 14, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  dateText: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  typeText: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  descText: { fontSize: 13, fontFamily: 'Manrope_400Regular', lineHeight: 18 },
  quoteText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  reviewText: { fontSize: 12, fontFamily: 'Manrope_400Regular', fontStyle: 'italic', flex: 1 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  actionBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  actionBtnOutline: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  actionBtnOutlineText: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  empty: { alignItems: 'center', marginTop: 60, gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Manrope_400Regular' },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  modalContent: { borderRadius: 20, padding: spacing.lg },
  modalTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', marginBottom: spacing.md },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, fontFamily: 'Manrope_400Regular' },
  textarea: { height: 80, textAlignVertical: 'top' },
  hint: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 4 },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnText: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
})
