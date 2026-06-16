import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
  Image, Alert, TextInput, Modal,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useThemeColors, spacing } from '../../lib/theme'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'

interface WorkerDetail {
  id: string
  _id?: string
  name: string
  photo?: string
  trades: string[]
  skills: string[]
  bio: string
  location: string
  serviceRadius: number
  hourlyRate: number
  fixedRates: Record<string, number>
  rating: number
  reviewCount: number
  completedJobs: number
  verificationLevel: string
  emergencyAvailable: boolean
  yearsExperience: number
  availability: Record<string, boolean>
}

export default function WorkerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const c = useThemeColors()
  const router = useRouter()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [bookingModal, setBookingModal] = useState(false)
  const [description, setDescription] = useState('')
  const [type, setType] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [estimatedCost, setEstimatedCost] = useState('')

  const { data: worker, isLoading } = useQuery({
    queryKey: ['worker', id],
    queryFn: () => api.get<WorkerDetail>(`/workers/${id}`),
    enabled: !!id,
  })

  const bookingMutation = useMutation({
    mutationFn: () =>
      api.post('/service-bookings', {
        workerId: id,
        type: type || worker?.trades[0] || 'general',
        description,
        scheduledDate: scheduledDate || undefined,
        estimatedCost: estimatedCost ? Number(estimatedCost) : undefined,
        requesterRole: user?.activeRole ?? 'tenant',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] })
      setBookingModal(false)
      setDescription('')
      setType('')
      setScheduledDate('')
      setEstimatedCost('')
      Alert.alert('Booking Sent', 'Your service request has been sent to the worker.')
    },
    onError: () => {
      Alert.alert('Error', 'Failed to send booking. Please try again.')
    },
  })

  if (isLoading) {
    return (
      <View style={[s.center, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  if (!worker) {
    return (
      <View style={[s.center, { backgroundColor: c.background }]}>
        <Text style={{ color: c.muted }}>Worker not found</Text>
      </View>
    )
  }

  const availabilityDays = Object.entries(worker.availability ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1, 3))

  return (
    <View style={[s.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={[s.header, { backgroundColor: c.primary }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Image source={{ uri: worker.photo || 'https://via.placeholder.com/120' }} style={s.photo} />
          <Text style={s.name}>{worker.name}</Text>
          <View style={s.badgeRow}>
            {worker.verificationLevel === 'verified' && (
              <View style={[s.badge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <Ionicons name="checkmark-circle" size={12} color="#fff" />
                <Text style={s.badgeText}>Verified</Text>
              </View>
            )}
            {worker.emergencyAvailable && (
              <View style={[s.badge, { backgroundColor: 'rgba(239,68,68,0.3)' }]}>
                <Ionicons name="time" size={12} color="#fff" />
                <Text style={s.badgeText}>Emergency</Text>
              </View>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={[s.statsCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: c.primary }]}>{worker.rating.toFixed(1)}</Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Rating</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: c.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: c.primary }]}>{worker.reviewCount}</Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Reviews</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: c.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: c.primary }]}>{worker.completedJobs}</Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Jobs</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: c.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: c.primary }]}>{worker.yearsExperience}</Text>
            <Text style={[s.statLabel, { color: c.muted }]}>Years</Text>
          </View>
        </View>

        {/* Details */}
        <View style={[s.section, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[s.sectionTitle, { color: c.text }]}>About</Text>
          <Text style={[s.bio, { color: c.textLight }]}>{worker.bio}</Text>

          <Text style={[s.sectionTitle, { color: c.text, marginTop: spacing.md }]}>Trades</Text>
          <View style={s.chipRow}>
            {worker.trades.map((t) => (
              <View key={t} style={[s.chip, { backgroundColor: c.primary + '12' }]}>
                <Text style={[s.chipText, { color: c.primary }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
              </View>
            ))}
          </View>

          <Text style={[s.sectionTitle, { color: c.text, marginTop: spacing.md }]}>Skills</Text>
          <View style={s.chipRow}>
            {worker.skills.map((s_) => (
              <View key={s_} style={[s.chip, { backgroundColor: c.surface }]}>
                <Text style={[s.chipText, { color: c.textLight }]}>{s_}</Text>
              </View>
            ))}
          </View>

          <Text style={[s.sectionTitle, { color: c.text, marginTop: spacing.md }]}>Availability</Text>
          <Text style={[s.bio, { color: c.textLight }]}>
            {availabilityDays.join(', ')} · {worker.location} ({worker.serviceRadius}km radius)
          </Text>

          {Object.keys(worker.fixedRates ?? {}).length > 0 && (
            <>
              <Text style={[s.sectionTitle, { color: c.text, marginTop: spacing.md }]}>Fixed Rates</Text>
              {Object.entries(worker.fixedRates).map(([key, val]) => (
                <View key={key} style={s.rateRow}>
                  <Text style={[s.rateLabel, { color: c.textLight }]}>
                    {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </Text>
                  <Text style={[s.rateValue, { color: c.primary }]}>GHS {val}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      {/* CTA Bar */}
      <View style={[s.ctaBar, { backgroundColor: c.card, borderColor: c.border }]}>
        <View>
          <Text style={[s.ctaLabel, { color: c.muted }]}>Hourly Rate</Text>
          <Text style={[s.ctaPrice, { color: c.text }]}>GHS {worker.hourlyRate}</Text>
        </View>
        <TouchableOpacity
          style={[s.ctaBtn, { backgroundColor: c.primary }]}
          onPress={() => setBookingModal(true)}
        >
          <Text style={s.ctaBtnText}>Book Service</Text>
        </TouchableOpacity>
      </View>

      {/* Booking Modal */}
      <Modal visible={bookingModal} animationType="slide" transparent>
        <View style={[s.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[s.modalContent, { backgroundColor: c.card }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.text }]}>Book {worker.name}</Text>
              <TouchableOpacity onPress={() => setBookingModal(false)}>
                <Ionicons name="close" size={24} color={c.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={[s.label, { color: c.text }]}>Service Type</Text>
              <TextInput
                style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                placeholder="e.g. plumbing repair"
                placeholderTextColor={c.muted}
                value={type}
                onChangeText={setType}
              />
              <Text style={[s.label, { color: c.text }]}>Description</Text>
              <TextInput
                style={[s.input, s.textarea, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                placeholder="Describe the work needed..."
                placeholderTextColor={c.muted}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
              />
              <Text style={[s.label, { color: c.text }]}>Preferred Date (YYYY-MM-DD)</Text>
              <TextInput
                style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                placeholder="2026-06-15"
                placeholderTextColor={c.muted}
                value={scheduledDate}
                onChangeText={setScheduledDate}
              />
              <Text style={[s.label, { color: c.text }]}>Estimated Cost (GHS)</Text>
              <TextInput
                style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.surface }]}
                placeholder="200"
                placeholderTextColor={c.muted}
                value={estimatedCost}
                onChangeText={setEstimatedCost}
                keyboardType="numeric"
              />
            </ScrollView>
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: c.primary }]}
              onPress={() => {
                if (!description.trim()) {
                  Alert.alert('Required', 'Please enter a description.')
                  return
                }
                bookingMutation.mutate()
              }}
            >
              <Text style={s.submitBtnText}>
                {bookingMutation.isPending ? 'Sending...' : 'Send Booking Request'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 100 },
  header: { paddingTop: 56, paddingBottom: spacing.lg, alignItems: 'center', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  backBtn: { position: 'absolute', top: 56, left: spacing.lg, width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  photo: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  name: { color: '#fff', fontSize: 20, fontFamily: 'Manrope_800ExtraBold', marginTop: spacing.sm },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { color: '#fff', fontSize: 11, fontFamily: 'Manrope_600SemiBold' },
  statsCard: { flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: -20, borderRadius: 14, borderWidth: 1, paddingVertical: spacing.md, justifyContent: 'space-evenly' },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 18, fontFamily: 'Manrope_800ExtraBold' },
  statLabel: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  statDivider: { width: 1, height: 32 },
  section: { marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: 14, borderWidth: 1, padding: spacing.md },
  sectionTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  bio: { fontSize: 13, fontFamily: 'Manrope_400Regular', marginTop: spacing.sm, lineHeight: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  chipText: { fontSize: 12, fontFamily: 'Manrope_500Medium' },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  rateLabel: { fontSize: 13, fontFamily: 'Manrope_400Regular' },
  rateValue: { fontSize: 13, fontFamily: 'Manrope_700Bold' },
  ctaBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1 },
  ctaLabel: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  ctaPrice: { fontSize: 18, fontFamily: 'Manrope_800ExtraBold' },
  ctaBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  ctaBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_700Bold' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.md, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, fontFamily: 'Manrope_400Regular' },
  textarea: { height: 80, textAlignVertical: 'top' },
  submitBtn: { marginTop: spacing.lg, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
})
