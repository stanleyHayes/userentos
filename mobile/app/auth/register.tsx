import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Pressable } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../../lib/theme'
import { api } from '../../lib/api'
import { useAuthStore, type User } from '../../stores/authStore'
import { Logo } from '../../components/Logo'

const roles = [
  { value: 'tenant', label: 'Tenant', icon: 'home-outline' as const },
  { value: 'landlord', label: 'Landlord', icon: 'business-outline' as const },
  { value: 'property_manager', label: 'Manager', icon: 'briefcase-outline' as const },
]

export default function RegisterScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', role: 'tenant' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field: string, value: string) { setForm((prev) => ({ ...prev, [field]: value })) }

  async function handleRegister() {
    if (!form.firstName || !form.email || !form.password) { setError('Please fill in required fields'); return }
    setError(''); setLoading(true)
    try {
      const data = await api.post<{ user: User; token: string; refreshToken?: string }>('/auth/register', form)
      login(data.user as User, data.token, data.refreshToken); router.replace('/(tabs)')
    } catch (e) {
      const _err = e as { message?: string }
      setError((e as { message?: string }).message || 'Registration failed')
    } finally { setLoading(false) }
  }

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: c.white }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logo}>
          <Logo size={40} theme="dark" />
          <Text style={[s.subtitle, { color: c.muted }]}>Join RentOS Ghana</Text>
        </View>

        {error ? <View style={s.errorBox}><Text style={[s.errorText, { color: c.danger }]}>{error}</Text></View> : null}

        <View style={s.form}>
          <View style={s.row}>
            <View style={s.half}>
              <Text style={[s.label, { color: c.text }]}>First Name</Text>
              <TextInput style={[s.input, { borderColor: c.border, color: c.text }]} value={form.firstName} onChangeText={(v) => update('firstName', v)} placeholder="Kwame" placeholderTextColor={c.muted} />
            </View>
            <View style={s.half}>
              <Text style={[s.label, { color: c.text }]}>Last Name</Text>
              <TextInput style={[s.input, { borderColor: c.border, color: c.text }]} value={form.lastName} onChangeText={(v) => update('lastName', v)} placeholder="Asante" placeholderTextColor={c.muted} />
            </View>
          </View>

          <Text style={[s.label, { color: c.text }]}>Email</Text>
          <TextInput style={[s.input, { borderColor: c.border, color: c.text }]} value={form.email} onChangeText={(v) => update('email', v)} placeholder="you@example.com" placeholderTextColor={c.muted} keyboardType="email-address" autoCapitalize="none" />

          <Text style={[s.label, { color: c.text }]}>Phone</Text>
          <TextInput style={[s.input, { borderColor: c.border, color: c.text }]} value={form.phone} onChangeText={(v) => update('phone', v)} placeholder="024 XXX XXXX" placeholderTextColor={c.muted} keyboardType="phone-pad" />

          <Text style={[s.label, { color: c.text }]}>Password</Text>
          <View style={[s.passwordWrap, { borderColor: c.border, backgroundColor: c.white }]}>
            <TextInput style={[s.passwordInput, { color: c.text }]} value={form.password} onChangeText={(v) => update('password', v)} placeholder="Min 8 characters" placeholderTextColor={c.muted} secureTextEntry={!showPassword} />
            <Pressable onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.muted} />
            </Pressable>
          </View>

          <Text style={[s.label, { color: c.text }]}>I am a...</Text>
          <View style={s.roleRow}>
            {roles.map((r) => (
              <TouchableOpacity key={r.value} style={[s.roleBtn, { borderColor: c.border }, form.role === r.value && { borderColor: c.primary, backgroundColor: c.primary + '10' }]} onPress={() => update('role', r.value)}>
                <Ionicons name={r.icon} size={18} color={form.role === r.value ? c.primary : c.muted} style={{ marginBottom: 4 }} />
                <Text style={[s.roleBtnText, { color: c.muted }, form.role === r.value && { color: c.primary, fontFamily: 'Manrope_600SemiBold' }]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[s.button, { backgroundColor: c.primary }]} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={s.buttonText}>Create Account</Text>}
          </TouchableOpacity>

          <View style={s.footer}>
            <Text style={[s.footerText, { color: c.muted }]}>Already have an account? </Text>
            <Link href="/auth/login" style={[s.link, { color: c.primary }]}>Sign in</Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  logo: { alignItems: 'center', marginBottom: spacing.xl },
  subtitle: { fontSize: 14, fontFamily: 'Manrope_400Regular', marginTop: 12 },
  form: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  label: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.sm },
  input: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Manrope_400Regular' },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, height: 52 },
  passwordInput: { flex: 1, height: '100%', paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Manrope_400Regular' },
  eyeBtn: { paddingHorizontal: 14, height: '100%', justifyContent: 'center' },
  roleRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  roleBtn: { flex: 1, paddingVertical: 12, borderWidth: 1.5, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  roleBtnText: { fontSize: 12, fontFamily: 'Manrope_500Medium' },
  button: { height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: spacing.md },
  buttonText: { color: '#ffffff', fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { fontSize: 14, fontFamily: 'Manrope_400Regular' },
  link: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  errorText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
})
