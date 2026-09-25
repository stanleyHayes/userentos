import { useState } from 'react'
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { neuInset } from '../lib/neu'
import { api } from '../lib/api'

/** Target types the API's POST /reports accepts that mobile currently reports. */
export type ReportTargetType = 'property' | 'review' | 'user'

export interface ReportTarget {
  type: ReportTargetType
  id: string
  /** What is being reported, in the user's words: "listing", "review", ... */
  noun: string
  /**
   * Context sent along with the report, e.g. the text of a review that is
   * reported through its author because the API has no target type for it.
   */
  context?: string
}

type Reason = 'scam_or_fraud' | 'misleading_listing' | 'not_available' | 'offensive_content' | 'spam' | 'duplicate' | 'illegal' | 'other'

const LISTING_REASONS: { value: Reason; label: string }[] = [
  { value: 'scam_or_fraud', label: 'Scam or fraud' },
  { value: 'misleading_listing', label: 'Misleading or inaccurate details' },
  { value: 'not_available', label: 'No longer available' },
  { value: 'duplicate', label: 'Duplicate listing' },
  { value: 'offensive_content', label: 'Offensive or abusive content' },
  { value: 'illegal', label: 'Illegal or discriminatory' },
  { value: 'other', label: 'Something else' },
]

const CONTENT_REASONS: { value: Reason; label: string }[] = [
  { value: 'offensive_content', label: 'Offensive, abusive or hateful' },
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'misleading_listing', label: 'False or misleading' },
  { value: 'scam_or_fraud', label: 'Scam or fraud' },
  { value: 'illegal', label: 'Illegal content' },
  { value: 'other', label: 'Something else' },
]

const DETAILS_LIMIT = 2000

/**
 * Report a listing, review or user to the moderation queue (POST /reports):
 * pick a reason, optionally explain, then see an explicit confirmation.
 * A modal rather than Alert buttons, because Android alerts cap at three
 * buttons and the reason list is longer than that.
 */
export function ReportContentModal({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      {target ? <ReportForm key={`${target.type}:${target.id}`} target={target} onClose={onClose} /> : null}
    </Modal>
  )
}

function ReportForm({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const c = useThemeColors()
  const reasons = target.type === 'property' ? LISTING_REASONS : CONTENT_REASONS
  const [reason, setReason] = useState<Reason | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const needsDetails = reason === 'other' && details.trim().length < 5
  const canSubmit = !!reason && !needsDetails && !submitting

  async function submit() {
    if (!reason) { setError('Choose a reason for your report.'); return }
    if (needsDetails) { setError('Tell us briefly what is wrong.'); return }
    setSubmitting(true)
    setError('')
    try {
      const text = [target.context, details.trim()].filter(Boolean).join('\n\n').slice(0, DETAILS_LIMIT)
      await api.post('/reports', { targetType: target.type, targetId: target.id, reason, ...(text ? { details: text } : {}) })
      setSent(true)
    } catch (err) {
      setError((err as { message?: string }).message || 'Could not send your report. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={s.overlay}>
      <View style={[s.sheet, { backgroundColor: c.white }]} accessibilityViewIsModal>
        <View style={s.header}>
          <Text accessibilityRole="header" style={[s.title, { color: c.primaryDark }]}>
            {sent ? 'Report sent' : `Report ${target.noun}`}
          </Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close report" hitSlop={8}>
            <Ionicons name="close" size={24} color={c.muted} />
          </TouchableOpacity>
        </View>

        {sent ? (
          <View style={s.body}>
            <View style={s.sentRow}>
              <Ionicons name="checkmark-circle" size={22} color={c.accent} />
              <Text accessibilityLiveRegion="polite" style={[s.text, { color: c.text, flex: 1 }]}>
                Thanks. Our moderation team will review this {target.noun} and act on it if it breaks the RentOS rules.
              </Text>
            </View>
            <TouchableOpacity style={[s.primary, { backgroundColor: c.primary }]} onPress={onClose} accessibilityRole="button">
              <Text style={s.primaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
            <Text style={[s.text, { color: c.textLight }]}>Why are you reporting this {target.noun}?</Text>
            <View style={s.reasons} accessibilityRole="radiogroup">
              {reasons.map((r) => {
                const selected = reason === r.value
                return (
                  <TouchableOpacity
                    key={r.value}
                    style={[s.reason, { borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primary + '10' : 'transparent' }]}
                    onPress={() => { setReason(r.value); setError('') }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={r.label}
                  >
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? c.primary : c.muted} />
                    <Text style={[s.reasonText, { color: c.text }]}>{r.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <Text style={[s.label, { color: c.text }]}>Details {reason === 'other' ? '(required)' : '(optional)'}</Text>
            <TextInput
              style={[s.input, neuInset(c), { color: c.text }]}
              value={details}
              onChangeText={setDetails}
              placeholder="What should our team know?"
              placeholderTextColor={c.muted}
              accessibilityLabel="Report details"
              multiline
              maxLength={1500}
              textAlignVertical="top"
            />
            {error ? <Text accessibilityLiveRegion="polite" style={[s.error, { color: c.danger }]}>{error}</Text> : null}
            <TouchableOpacity
              style={[s.primary, { backgroundColor: c.danger, opacity: canSubmit ? 1 : 0.5 }]}
              onPress={submit}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel="Submit report"
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Submit report</Text>}
            </TouchableOpacity>
            <Text style={[s.note, { color: c.muted }]}>
              Reports are confidential. The person you report is not told who reported them.
            </Text>
          </ScrollView>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', paddingBottom: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 18, fontFamily: 'Outfit_700Bold' },
  body: { paddingHorizontal: spacing.lg },
  text: { fontSize: 14, fontFamily: 'Outfit_400Regular', lineHeight: 20 },
  sentRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginBottom: spacing.md },
  reasons: { gap: spacing.xs, marginTop: spacing.sm },
  reason: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  reasonText: { fontSize: 14, fontFamily: 'Outfit_500Medium', flex: 1 },
  label: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', marginTop: spacing.md, marginBottom: spacing.xs },
  input: { minHeight: 80, padding: spacing.md, fontSize: 14, fontFamily: 'Outfit_400Regular' },
  error: { fontSize: 13, fontFamily: 'Outfit_500Medium', marginTop: spacing.sm },
  primary: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  primaryText: { color: '#fff', fontSize: 15, fontFamily: 'Outfit_600SemiBold' },
  note: { fontSize: 12, fontFamily: 'Outfit_400Regular', marginTop: spacing.sm, textAlign: 'center' },
})
