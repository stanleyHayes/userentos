import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors } from '../lib/theme'

export default function NotFoundScreen() {
  const c = useThemeColors()
  const router = useRouter()

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <View style={[styles.iconWrap, { backgroundColor: c.primary + '15' }]}>
        <Ionicons name="home-outline" size={48} color={c.primary} />
      </View>
      <Text style={[styles.code, { color: c.primaryDark }]}>404</Text>
      <Text style={[styles.title, { color: c.primaryDark }]}>Page not found</Text>
      <Text style={[styles.desc, { color: c.muted }]}>This screen doesn't exist in RentOS.</Text>
      <Pressable style={[styles.btn, { backgroundColor: c.primary }]} onPress={() => router.replace('/(tabs)')}>
        <Ionicons name="arrow-back" size={18} color="#fff" />
        <Text style={styles.btnText}>Go Home</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  iconWrap: { width: 80, height: 80, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  code: { fontSize: 64, fontFamily: 'Manrope_800ExtraBold', letterSpacing: -2 },
  title: { fontSize: 20, fontFamily: 'Manrope_700Bold', marginTop: 8 },
  desc: { fontSize: 14, fontFamily: 'Manrope_400Regular', marginTop: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, marginTop: 32 },
  btnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
})
