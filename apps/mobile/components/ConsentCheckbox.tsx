import { View, Text, Pressable, StyleSheet, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../lib/theme'
import { LEGAL_URLS } from '../../../packages/shared/legalVersions'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

function openDoc(url: string) {
  Linking.openURL(url).catch(() => {})
}

/**
 * "I am 18 or older and agree to the Terms of Service and Privacy Policy"
 * (CONSENT_STATEMENT in packages/shared/legalVersions.ts). Unticked by
 * default; the two documents open in the browser at the published web pages.
 */
export function ConsentCheckbox({ checked, onChange, disabled }: Props) {
  const c = useThemeColors()
  return (
    <View style={[s.wrap, { borderColor: c.border, backgroundColor: c.surface }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        accessibilityLabel="I am 18 or older and agree to the Terms of Service and Privacy Policy"
        onPress={() => !disabled && onChange(!checked)}
        hitSlop={8}
        style={s.box}
      >
        <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? c.primary : c.muted} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={[s.text, { color: c.text }]} onPress={() => !disabled && onChange(!checked)}>
          I am 18 or older and agree to the{' '}
          <Text accessibilityRole="link" style={[s.link, { color: c.primary }]} onPress={() => openDoc(LEGAL_URLS.terms)}>Terms of Service</Text>
          {' '}and{' '}
          <Text accessibilityRole="link" style={[s.link, { color: c.primary }]} onPress={() => openDoc(LEGAL_URLS.privacy)}>Privacy Policy</Text>
        </Text>
        <Text style={[s.note, { color: c.muted }]}>We record the versions you accepted, when, and the device details sent with this request.</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  box: { paddingTop: 1 },
  text: { fontSize: 13, fontFamily: 'Outfit_500Medium', lineHeight: 19 },
  link: { fontFamily: 'Outfit_600SemiBold', textDecorationLine: 'underline' },
  note: { fontSize: 11, fontFamily: 'Outfit_400Regular', marginTop: 4, lineHeight: 15 },
})
