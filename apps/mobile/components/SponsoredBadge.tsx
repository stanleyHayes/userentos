import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, useIsDark } from '../lib/theme'

/**
 * The label every paid placement carries — the same amber pill and wording as
 * the web's SponsoredBadge.
 *
 * The apps do not ask the API for paid placements today (no placement=
 * parameter is sent), so nothing renders this yet and the stores are answered
 * "Contains ads: No". Screens that could show a paid item already render it
 * when the API flags one, so turning placements on is one query parameter per
 * screen — plus the store declarations and privacy policy, in the same release.
 */
export function SponsoredBadge({ label = 'Sponsored' }: { label?: string }) {
  const c = useThemeColors()
  // amber-700 on light, amber-400 on dark: readable on the tinted pill.
  const tint = useIsDark() ? '#fbbf24' : '#b45309'
  return (
    <View
      style={[s.pill, { backgroundColor: c.warning + '22' }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      testID="sponsored-badge"
    >
      <Ionicons name="megaphone-outline" size={11} color={tint} />
      <Text style={[s.text, { color: tint }]}>Sponsored</Text>
    </View>
  )
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, flexShrink: 0 },
  text: { fontSize: 10, fontFamily: 'Outfit_700Bold' },
})
