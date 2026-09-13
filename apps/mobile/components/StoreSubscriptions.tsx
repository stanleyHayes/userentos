import { Text, View } from 'react-native'
import { useThemeColors } from '../lib/theme'
export default function StoreSubscriptions() {
  const c = useThemeColors()
  return <View style={{ padding: 16 }}><Text style={{ color: c.text }}>App Store subscriptions are not available yet.</Text></View>
}
