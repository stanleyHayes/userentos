import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native'
import { useGoogleBillingStore } from '../stores/googleBillingStore'
import { useThemeColors } from '../lib/theme'
import { neuCard } from '../lib/neu'
export default function StoreSubscriptions() {
  const c = useThemeColors()
  const billing = useGoogleBillingStore()
  return <View style={{ gap: 16, marginBottom: 20 }}>
    <Text style={{ color: c.text, fontFamily: 'Outfit_700Bold', fontSize: 20 }}>Google Play plans</Text>
    {billing.busy && <ActivityIndicator color={c.primary} />}
    {!!billing.error && <Text accessibilityRole="alert" style={{ color: c.text }}>{billing.error}</Text>}
    {!!billing.message && <Text accessibilityLiveRegion="polite" style={{ color: c.text }}>{billing.message}</Text>}
    {billing.ready && !billing.offers.length && <Text style={{ color: c.muted }}>No Google Play plans are available right now.</Text>}
    {billing.offers.map(offer => <View key={offer.key} style={[neuCard(c), { padding: 20, gap: 10 }]}>
      <Text style={{ color: c.primaryDark, fontFamily: 'Outfit_700Bold', fontSize: 18 }}>{offer.name}</Text>
      <Text style={{ color: c.primary, fontFamily: 'Outfit_600SemiBold' }}>{offer.terms}</Text>
      <Text style={{ color: c.text }}>{offer.maxProperties === -1 ? 'Unlimited properties' : `Up to ${offer.maxProperties} properties`}</Text>
      {offer.benefits.map((benefit, index) => <Text key={index} style={{ color: c.text }}>✓ {benefit}</Text>)}
      <TouchableOpacity accessibilityRole="button" disabled={billing.busy || !billing.ready} onPress={() => void billing.buy(offer)} style={{ backgroundColor: c.primary, padding: 14, borderRadius: 10, opacity: billing.busy ? 0.5 : 1 }}><Text style={{ color: '#fff', textAlign: 'center' }}>Subscribe with Google Play</Text></TouchableOpacity>
    </View>)}
    <Text style={{ color: c.muted }}>Charges and renewal terms are shown above and confirmed by Google Play. Manage or cancel your subscription in Google Play.</Text>
    <TouchableOpacity accessibilityRole="button" disabled={billing.busy || !billing.ready} onPress={() => void billing.restore()}><Text style={{ color: c.primary, padding: 10 }}>Restore purchases</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" disabled={billing.busy} onPress={() => void billing.reload().catch(() => {})}><Text style={{ color: c.primary, padding: 10 }}>Reload plans</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL('https://play.google.com/store/account/subscriptions').catch(() => {})}><Text style={{ color: c.primary, padding: 10 }}>Manage Google Play subscription</Text></TouchableOpacity>
  </View>
}
