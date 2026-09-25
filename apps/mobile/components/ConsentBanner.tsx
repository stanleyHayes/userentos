import { useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { useThemeColors } from '../lib/theme'
import { api } from '../lib/api'
import { useAuthStore, type User } from '../stores/authStore'
import { ConsentCheckbox } from './ConsentCheckbox'
import { buildAcceptance } from '../../../packages/shared/legalVersions'

/** Server-computed on every safe user view (login and /users/me). */
type UserWithConsent = User & { consentRequired?: boolean; consents?: unknown }

/**
 * Re-prompt for Terms/Privacy acceptance when the server reports the stored
 * versions are out of date (new version published, or the account predates
 * consent capture). A persistent notice, not a blocking modal, so rent and
 * agreements stay reachable; it stays until the user accepts.
 */
export function ConsentBanner() {
  const c = useThemeColors()
  const user = useAuthStore((st) => st.user) as UserWithConsent | null
  const updateUser = useAuthStore((st) => st.updateUser)
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!user || user.suspendedAt || user.consentRequired !== true) return null

  async function accept() {
    setSaving(true)
    setError('')
    try {
      const result = await api.post<{ consents: unknown; consentRequired: boolean }>('/auth/consents', buildAcceptance())
      updateUser({ consentRequired: result.consentRequired, consents: result.consents } as Partial<User>)
    } catch (e) {
      setError((e as { message?: string }).message || 'Could not record your acceptance. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={[s.wrap, { backgroundColor: c.card, borderTopColor: c.border }]} accessibilityLabel="Updated terms">
      <Text style={[s.title, { color: c.text }]}>Please review our Terms of Service and Privacy Policy</Text>
      <Text style={[s.body, { color: c.muted }]}>
        {user.consents ? 'We have updated these documents since you last accepted them.' : 'We need your acceptance on record to continue providing your account.'}
      </Text>
      <ConsentCheckbox checked={checked} onChange={setChecked} disabled={saving} />
      {!!error && <Text style={[s.body, { color: c.danger }]}>{error}</Text>}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: !checked || saving }}
        disabled={!checked || saving}
        onPress={() => void accept()}
        style={[s.button, { backgroundColor: c.primary, opacity: !checked || saving ? 0.5 : 1 }]}
      >
        {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={s.buttonText}>Accept and continue</Text>}
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { padding: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 14, fontFamily: 'Outfit_700Bold' },
  body: { fontSize: 12, fontFamily: 'Outfit_400Regular', lineHeight: 17 },
  button: { minHeight: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#ffffff', fontSize: 14, fontFamily: 'Outfit_700Bold' },
})
