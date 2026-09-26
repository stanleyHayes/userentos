import { useState } from 'react'
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'
import { AITextInput } from './AITextInput'

/**
 * Reason codes offered on rejection. POST /properties/:id/review refuses a
 * rejection without one, so the sheet will not submit until one is chosen.
 * Same values as web's PropertyReviewPage REJECT_REASONS.
 */
const REJECT_REASONS = [
  { value: 'incomplete_details', label: 'Incomplete details' },
  { value: 'poor_media', label: 'Photos unusable or missing' },
  { value: 'suspected_duplicate', label: 'Suspected duplicate listing' },
  { value: 'not_compliant', label: 'Breaches rental law or policy' },
  { value: 'suspected_fraud', label: 'Suspected fraud' },
  { value: 'other', label: 'Other (explain below)' },
] as const

type RejectReason = (typeof REJECT_REASONS)[number]['value']

export interface RejectableListing {
  id: string
  title: string
}

/**
 * Moderator rejects a listing: pick a reason code, optionally explain, submit.
 * A modal rather than Alert.prompt, which is iOS-only (it does nothing on
 * Android) and can't offer a reason picker.
 */
export function RejectListingModal({ listing, onClose, onRejected }: {
  listing: RejectableListing | null
  onClose: () => void
  onRejected: (id: string) => void
}) {
  return (
    <Modal visible={!!listing} animationType="slide" transparent onRequestClose={onClose}>
      {listing ? <RejectForm key={listing.id} listing={listing} onClose={onClose} onRejected={onRejected} /> : null}
    </Modal>
  )
}

function RejectForm({ listing, onClose, onRejected }: {
  listing: RejectableListing
  onClose: () => void
  onRejected: (id: string) => void
}) {
  const c = useThemeColors()
  const [reasonCode, setReasonCode] = useState<RejectReason | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // "Other" is meaningless to the owner without an explanation.
  const needsNote = reasonCode === 'other' && !note.trim()
  const canSubmit = !!reasonCode && !needsNote && !submitting

  async function submit() {
    if (!reasonCode) { setError('Choose a reason for rejecting this listing.'); return }
    if (needsNote) { setError('Explain what is wrong with this listing.'); return }
    setSubmitting(true)
    setError('')
    try {
      await api.post(`/properties/${listing.id}/review`, {
        action: 'reject',
        reasonCode,
        note: note.trim() || undefined,
      })
      onRejected(listing.id)
    } catch (err) {
      setError((err as { message?: string }).message || 'Failed to reject property')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={s.overlay}>
      <View style={[s.sheet, { backgroundColor: c.white }]} accessibilityViewIsModal>
        <View style={s.header}>
          <Text accessibilityRole="header" style={[s.title, { color: c.primaryDark }]}>Reject Listing</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
            <Ionicons name="close" size={24} color={c.muted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
          <Text style={[s.text, { color: c.textLight }]}>Why is "{listing.title}" being rejected?</Text>
          <View style={s.reasons} accessibilityRole="radiogroup">
            {REJECT_REASONS.map((r) => {
              const selected = reasonCode === r.value
              return (
                <TouchableOpacity
                  key={r.value}
                  style={[s.reason, { borderColor: selected ? c.danger : c.border, backgroundColor: selected ? c.danger + '10' : 'transparent' }]}
                  onPress={() => { setReasonCode(r.value); setError('') }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={r.label}
                >
                  <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? c.danger : c.muted} />
                  <Text style={[s.reasonText, { color: c.text }]}>{r.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <AITextInput
            label={reasonCode === 'other' ? 'Note to the owner *' : 'Note to the owner (optional)'}
            aiContext="property listing rejection reason"
            value={note}
            onChangeText={setNote}
            placeholder="Explain what the owner needs to fix..."
            maxLength={2000}
            numberOfLines={4}
          />

          {error ? <Text accessibilityLiveRegion="polite" style={[s.error, { color: c.danger }]}>{error}</Text> : null}

          <TouchableOpacity
            style={[s.primary, { backgroundColor: c.danger, opacity: canSubmit ? 1 : 0.5 }]}
            onPress={submit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Reject listing"
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Reject Listing</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', paddingBottom: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 18, fontFamily: 'Outfit_700Bold' },
  body: { paddingHorizontal: spacing.lg },
  text: { fontSize: 14, fontFamily: 'Outfit_400Regular', lineHeight: 20 },
  reasons: { gap: spacing.xs, marginTop: spacing.sm },
  reason: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  reasonText: { fontSize: 14, fontFamily: 'Outfit_500Medium', flex: 1 },
  error: { fontSize: 13, fontFamily: 'Outfit_500Medium', marginTop: spacing.sm },
  primary: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  primaryText: { color: '#fff', fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
})
