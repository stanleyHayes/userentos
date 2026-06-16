import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Modal, TextInput, Alert, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { formatDate } from '../lib/format'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { ListSkeleton } from '../components/Skeleton'
import { AITextInput } from '../components/AITextInput'

interface Dispute {
  id: string; title: string; category: string; status: string
  createdAt: string
}

const categoryIcons: Record<string, string> = {
  maintenance: 'build-outline',
  payment: 'card-outline',
  noise: 'volume-high-outline',
  lease: 'document-text-outline',
  security: 'shield-outline',
  rent_increase: 'trending-up-outline',
  eviction: 'home-outline',
  deposit_refund: 'cash-outline',
  illegal_clause: 'warning-outline',
  other: 'alert-circle-outline',
}

const disputeCategories = [
  { value: 'rent_increase', label: 'Rent Increase' },
  { value: 'eviction', label: 'Eviction' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'deposit_refund', label: 'Deposit Refund' },
  { value: 'illegal_clause', label: 'Illegal Clause' },
  { value: 'other', label: 'Other' },
]

export default function DisputesScreen() {
  const c = useThemeColors()
  const { user } = useAuthStore()
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  const statusColors: Record<string, string> = {
    filed: c.warning,
    under_mediation: c.primary,
    resolved: c.accent,
    closed: c.muted,
    escalated: c.danger,
  }

  // File Dispute modal state
  const [showModal, setShowModal] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [filedAgainst, setFiledAgainst] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    try {
      const data = await api.get<{ items: Dispute[] }>('/disputes')
      setDisputes(data.items)
    } catch { /* no-op */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false) }

  function resetModal() {
    setShowModal(false)
    setTitle('')
    setCategory('')
    setFiledAgainst('')
    setPropertyId('')
    setDescription('')
  }

  async function handleSubmitDispute() {
    if (!title.trim()) { Alert.alert('Error', 'Please enter a title'); return }
    if (!category) { Alert.alert('Error', 'Please select a category'); return }
    if (!filedAgainst.trim()) { Alert.alert('Error', 'Please enter the user ID of the other party'); return }
    if (!propertyId.trim()) { Alert.alert('Error', 'Please enter the property ID'); return }
    if (!description.trim() || description.trim().length < 10) { Alert.alert('Error', 'Please enter a description (min 10 characters)'); return }

    setSubmitting(true)
    try {
      await api.post('/disputes', {
        title: title.trim(),
        category,
        filedAgainst: filedAgainst.trim(),
        propertyId: propertyId.trim(),
        description: description.trim(),
      })
      resetModal()
      Alert.alert('Success', 'Dispute filed successfully')
      await load()
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to file dispute')
    } finally { setSubmitting(false) }
  }

  const isTenant = user?.activeRole === 'tenant'

  function renderDispute({ item }: { item: Dispute }) {
    const statusColor = statusColors[item.status] ?? c.muted
    const icon = categoryIcons[item.category] ?? 'alert-circle-outline'
    return (
      <View style={[s.card, { backgroundColor: c.white }]}>
        <View style={[s.cardIcon, { backgroundColor: statusColor + '15' }]}>
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={statusColor} />
        </View>
        <View style={s.cardBody}>
          <Text style={[s.cardTitle, { color: c.primaryDark }]} numberOfLines={1}>{item.title}</Text>
          <View style={s.cardMeta}>
            <Text style={[s.categoryText, { color: c.muted }]}>{item.category.replace('_', ' ')}</Text>
            <Text style={[s.dot, { color: c.muted }]}>-</Text>
            <Text style={[s.dateText, { color: c.muted }]}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>
        <View style={[s.badge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[s.badgeText, { color: statusColor }]}>{item.status.replace('_', ' ')}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>

      {isTenant && (
        <TouchableOpacity style={[s.createBtn, { backgroundColor: c.primary }]} onPress={() => setShowModal(true)}>
          <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
          <Text style={s.createBtnText}>File a Dispute</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={disputes}
        keyExtractor={(item) => item.id}
        renderItem={renderDispute}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
        ListEmptyComponent={
          loading ? (
            <View style={s.empty}>
              <ListSkeleton />
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="shield-checkmark-outline" size={48} color={c.muted} />
              <Text style={[s.emptyText, { color: c.muted }]}>No disputes filed</Text>
            </View>
          )
        }
      />

      {/* File Dispute Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: c.white }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: c.primaryDark }]}>File a Dispute</Text>
              <TouchableOpacity onPress={resetModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={c.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[s.fieldLabel, { color: c.text }]}>Title</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                placeholder="Brief title for the dispute"
                placeholderTextColor={c.muted}
                value={title}
                onChangeText={setTitle}
              />

              <Text style={[s.fieldLabel, { color: c.text }]}>Category</Text>
              <View style={s.categoryGrid}>
                {disputeCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[s.categoryBtn, { backgroundColor: c.surface, borderColor: c.border }, category === cat.value && { borderColor: c.primary, backgroundColor: c.primary + '08' }]}
                    onPress={() => setCategory(cat.value)}
                  >
                    <Ionicons
                      name={(categoryIcons[cat.value] ?? 'alert-circle-outline') as keyof typeof Ionicons.glyphMap}
                      size={16}
                      color={category === cat.value ? c.primary : c.muted}
                    />
                    <Text style={[s.categoryBtnText, { color: c.text }, category === cat.value && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.fieldLabel, { color: c.text }]}>Filed Against (User ID)</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                placeholder="User ID of the other party"
                placeholderTextColor={c.muted}
                value={filedAgainst}
                onChangeText={setFiledAgainst}
              />

              <Text style={[s.fieldLabel, { color: c.text }]}>Property ID</Text>
              <TextInput
                style={[s.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
                placeholder="ID of the related property"
                placeholderTextColor={c.muted}
                value={propertyId}
                onChangeText={setPropertyId}
              />

              <AITextInput
                label="Description"
                aiContext="rental dispute description"
                placeholder="Describe the issue in detail..."
                numberOfLines={4}
                value={description}
                onChangeText={setDescription}
              />

              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: c.primary }, submitting && s.submitBtnDisabled]}
                onPress={handleSubmitDispute}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#ffffff" />
                    <Text style={s.submitBtnText}>Submit Dispute</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: spacing.md, marginTop: spacing.md, paddingVertical: 12, borderRadius: 12 },
  createBtnText: { fontSize: 15, fontFamily: 'Manrope_600SemiBold', color: '#ffffff' },
  list: { padding: spacing.md, gap: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  cardIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  categoryText: { fontSize: 11, textTransform: 'capitalize', fontFamily: 'Manrope_400Regular' },
  dot: { fontSize: 11 },
  dateText: { fontSize: 11, fontFamily: 'Manrope_400Regular' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'capitalize' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  emptyText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', marginBottom: spacing.sm, marginTop: spacing.md },
  input: { borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 14, borderWidth: 1, fontFamily: 'Manrope_500Medium' },
  textArea: { minHeight: 100, paddingTop: 14 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5 },
  categoryBtnText: { fontSize: 12, fontFamily: 'Manrope_500Medium' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 16, marginTop: spacing.lg, marginBottom: spacing.md },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: '#ffffff' },
})
