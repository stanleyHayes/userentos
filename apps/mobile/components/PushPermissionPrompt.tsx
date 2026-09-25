import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Linking, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard } from '../lib/neu'
import { getPushPermissionState, requestPushPermissionInContext, type PushPermissionState } from '../lib/push'

/**
 * In-context pre-prompt for push notifications. The OS permission dialog only
 * appears after the user taps "Turn on notifications" here, never on sign-in.
 * Renders nothing when permission is granted or push is unsupported (web,
 * simulators).
 */
export function PushPermissionPrompt() {
  const c = useThemeColors()
  const [state, setState] = useState<PushPermissionState | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    let active = true
    void getPushPermissionState().then((next) => { if (active) setState(next) })
    return () => { active = false }
  }, [])

  if (dismissed || !state || state === 'granted' || state === 'unsupported') return null

  async function turnOn() {
    setAsking(true)
    try {
      const granted = await requestPushPermissionInContext()
      setState(granted ? 'granted' : await getPushPermissionState())
    } finally {
      setAsking(false)
    }
  }

  const blocked = state === 'blocked'
  return (
    <View style={[s.card, neuCard(c)]}>
      <View style={s.row}>
        <Ionicons name={blocked ? 'notifications-off-outline' : 'notifications-outline'} size={20} color={c.primary} />
        <Text style={[s.title, { color: c.primaryDark }]}>{blocked ? 'Notifications are off' : 'Get notified about what matters'}</Text>
      </View>
      <Text style={[s.body, { color: c.textLight }]}>
        {blocked
          ? 'To hear about rent due dates, new messages and agreement updates, turn on notifications for RentOS in your device settings.'
          : 'Rent due dates, new messages, agreement and payment updates. You can change this anytime in your device settings.'}
      </Text>
      <View style={s.actions}>
        <TouchableOpacity
          style={[s.primary, { backgroundColor: c.primary }]}
          onPress={blocked ? () => { void Linking.openSettings() } : turnOn}
          disabled={asking}
          accessibilityRole="button"
        >
          {asking ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>{blocked ? 'Open settings' : 'Turn on notifications'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setDismissed(true)} accessibilityRole="button" style={s.secondary}>
          <Text style={[s.secondaryText, { color: c.muted }]}>Not now</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 15, fontFamily: 'Outfit_700Bold', flex: 1 },
  body: { fontSize: 13, fontFamily: 'Outfit_400Regular', lineHeight: 19 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  primary: { paddingHorizontal: spacing.md, height: 40, borderRadius: 10, justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 14, fontFamily: 'Outfit_600SemiBold' },
  secondary: { paddingVertical: spacing.sm },
  secondaryText: { fontSize: 14, fontFamily: 'Outfit_500Medium' },
})
