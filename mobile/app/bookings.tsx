import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, TextInput, Modal, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
import { api } from '../lib/api'

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
  quoteProvided?: boolean
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
  const [viewMode, setViewMode] = useState<'requester' | 'worker'>('requester')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [noteModal, setNoteModal] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [noteText, setNoteText] = useState('')
  const [quoteModal, setQuoteModal] = useState(false)
  const [quoteAmount, setQuoteAmount] = useState('')

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
            <View key={b.id ?? b._id} style={[s.card, neuCard(c)]}>
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

              {(b.quoteProvided ?? b.quoteAmount !== undefined) && b.quoteAmount !== undefined && (
                <View style={s.quoteRow}>
                  <View style={[s.quoteBadge, { backgroundColor: c.primary + '12' }]}>
                    <Text style={[s.quoteText, { color: c.primary }]}>Quote: GH₵{b.quoteAmount}</Text>
                  </View>
                  {b.quoteAccepted && (
                    <View style={[s.quoteBadge, { backgroundColor: '#10b98118' }]}>
                      <Text style={[s.quoteText, { color: '#10b981' }]}>Quote accepted</Text>
                    </View>
                  )}
                </View>
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
                    {!(b.quoteProvided ?? b.quoteAmount !== undefined) &&
                      ['pending', 'confirmed', 'in_progress'].includes(b.status) && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: c.primary }]}
                          onPress={() => {
                            setSelectedBooking(b)
                            setQuoteAmount('')
                            setQuoteModal(true)
                          }}
                        >
                          <Text style={s.actionBtnText}>Provide Quote</Text>
                        </TouchableOpacity>
                      )}
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
                    {(b.quoteProvided ?? b.quoteAmount !== undefined) && !b.quoteAccepted &&
                      b.status !== 'cancelled' && b.status !== 'completed' && (
                        <>
                          <TouchableOpacity
                            style={[s.actionBtn, { backgroundColor: '#10b981' }]}
                            onPress={() =>
                              Alert.alert('Accept Quote', `Accept the quote of GH₵${b.quoteAmount}?`, [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Accept',
                                  onPress: () =>
                                    updateMutation.mutate(
                                      { id: b.id ?? b._id!, body: { quoteAccepted: true } },
                                      { onError: (e) => Alert.alert('Error', e.message) },
                                    ),
                                },
                              ])
                            }
                          >
                            <Text style={s.actionBtnText}>Accept Quote</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.actionBtn, { backgroundColor: '#ef4444' }]}
                            onPress={() =>
                              Alert.alert('Decline Quote', 'Declining will cancel this booking. Continue?', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Decline',
                                  style: 'destructive',
                                  onPress: () =>
                                    updateMutation.mutate(
                                      { id: b.id ?? b._id!, body: { status: 'cancelled' } },
                                      { onError: (e) => Alert.alert('Error', e.message) },
                                    ),
                                },
                              ])
                            }
                          >
                            <Text style={s.actionBtnText}>Decline</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    {b.status === 'pending' &&
                      !((b.quoteProvided ?? b.quoteAmount !== undefined) && !b.quoteAccepted) && (
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

      {/* Quote Modal (worker) */}
      <Modal visible={quoteModal} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <Text style={[s.modalTitle, { color: c.text }]}>Provide Quote</Text>
            <TextInput
              style={[s.input, neuInset(c), { color: c.text }]}
              placeholder="Amount in GHS, e.g. 250"
              placeholderTextColor={c.muted}
              value={quoteAmount}
              onChangeText={setQuoteAmount}
              keyboardType="numeric"
            />
            <Text style={[s.hint, { color: c.muted }]}>
              The requester will be able to accept or decline this quote.
            </Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: c.border }]} onPress={() => setQuoteModal(false)}>
                <Text style={[s.modalBtnText, { color: c.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, { backgroundColor: c.primary }]}
                onPress={() => {
                  const amount = Number(quoteAmount)
                  if (!Number.isFinite(amount) || amount <= 0) {
                    Alert.alert('Invalid Amount', 'Please enter a valid quote amount.')
                    return
                  }
                  updateMutation.mutate(
                    { id: selectedBooking!.id ?? selectedBooking!._id!, body: { quoteAmount: amount } },
                    { onError: (e) => Alert.alert('Error', e.message) },
                  )
                  setQuoteModal(false)
                  setQuoteAmount('')
                }}
              >
                <Text style={[s.modalBtnText, { color: '#fff' }]}>Send Quote</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Note / Rate Modal */}
      <Modal visible={noteModal} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <Text style={[s.modalTitle, { color: c.text }]}>
              {selectedBooking?.status === 'completed' && selectedBooking?.rating === undefined ? 'Rate & Review' : 'Add Note'}
            </Text>
            <TextInput
              style={[s.input, s.textarea, neuInset(c), { color: c.text }]}
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
  headerTitle: { color: '#fff', fontSize: 22, fontFamily: 'Outfit_800ExtraBold' },
  toggleRow: { flexDirection: 'row', marginTop: spacing.md, gap: 8 },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  toggleText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  filterScroll: { marginTop: spacing.md },
  filterContent: { paddingHorizontal: spacing.lg, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 1, marginRight: 8 },
  filterChipText: { fontSize: 12, fontFamily: 'Outfit_600SemiBold' },
  listContent: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  card: { padding: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: 'Outfit_600SemiBold' },
  dateText: { fontSize: 11, fontFamily: 'Outfit_400Regular' },
  typeText: { fontSize: 15, fontFamily: 'Outfit_700Bold' },
  descText: { fontSize: 13, fontFamily: 'Outfit_400Regular', lineHeight: 18 },
  quoteRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quoteBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  quoteText: { fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 13, fontFamily: 'Outfit_700Bold' },
  reviewText: { fontSize: 12, fontFamily: 'Outfit_400Regular', fontStyle: 'italic', flex: 1 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  actionBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Outfit_600SemiBold' },
  actionBtnOutline: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  actionBtnOutlineText: { fontSize: 12, fontFamily: 'Outfit_600SemiBold' },
  empty: { alignItems: 'center', marginTop: 60, gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold' },
  emptySubtitle: { fontSize: 13, fontFamily: 'Outfit_400Regular' },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  modalContent: { borderRadius: 12, padding: spacing.lg },
  modalTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', marginBottom: spacing.md },
  input: { paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, fontFamily: 'Outfit_400Regular' },
  textarea: { height: 80, textAlignVertical: 'top' },
  hint: { fontSize: 11, fontFamily: 'Outfit_400Regular', marginTop: 4 },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnText: { fontSize: 14, fontFamily: 'Outfit_700Bold' },
})
