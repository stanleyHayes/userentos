import { useEffect, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Pressable, Alert } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../../lib/theme'
import { api } from '../../lib/api'
import { useAuthStore, type User } from '../../stores/authStore'
import { Logo } from '../../components/Logo'
import {
  authenticateWithBiometric,
  biometricIconName,
  biometricLabel,
  enableBiometricLogin,
  exchangeRefreshToken,
  getBiometricCapability,
  isBiometricEnabled,
  readStoredRefreshToken,
  type BiometricCapability,
} from '../../lib/biometric'

export default function LoginScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [bioLoading, setBioLoading] = useState(false)
  const [capability, setCapability] = useState<BiometricCapability | null>(null)
  const [bioEnabled, setBioEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [cap, enabled] = await Promise.all([getBiometricCapability(), isBiometricEnabled()])
      if (cancelled) return
      setCapability(cap)
      setBioEnabled(enabled)
      // Auto-prompt on mount if biometric is enabled and available
      if (cap.available && enabled) {
        void runBiometricLogin(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function loginWithCredentials(emailInput: string, passwordInput: string) {
    const data = await api.post<{ user: User; token: string; refreshToken?: string }>('/auth/login', {
      email: emailInput, password: passwordInput,
    })
    // Persist the refresh token so the 401 auto-refresh works and password users
    // aren't logged out the moment the short-lived access token expires.
    login(data.user, data.token, data.refreshToken)
    router.replace('/(tabs)')
    return data
  }

  async function handleLogin() {
    if (!email || !password) { setError('Please fill in all fields'); return }
    setError(''); setLoading(true)
    try {
      await loginWithCredentials(email, password)
      // After a successful password login, offer to enable biometric (only if available + not yet enabled)
      if (capability?.available && !bioEnabled) {
        Alert.alert(
          `Enable ${biometricLabel(capability.primary)} login?`,
          `Sign in faster next time using ${biometricLabel(capability.primary).toLowerCase()}. A long-lived refresh token is stored encrypted on this device — your password is not.`,
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Enable',
              onPress: async () => {
                const ok = await authenticateWithBiometric(`Enable ${biometricLabel(capability.primary)} login`)
                if (!ok) return
                try {
                  await enableBiometricLogin()
                  setBioEnabled(true)
                } catch (err) {
      const _err = err as { message?: string }
      Alert.alert('Could not enable', (err as { message?: string }).message ?? 'Try again later.')
    }
              },
            },
          ],
        )
      }
    } catch (e) {
      const _err = e as { message?: string }
      setError((e as { message?: string }).message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function runBiometricLogin(silentOnFail = false) {
    setError('')
    setBioLoading(true)
    try {
      const ok = await authenticateWithBiometric(
        capability?.primary === 'face' ? 'Sign in with Face ID' : 'Sign in with fingerprint',
      )
      if (!ok) {
        if (!silentOnFail) setError('Biometric authentication failed')
        return
      }
      const refreshToken = await readStoredRefreshToken()
      if (!refreshToken) {
        if (!silentOnFail) setError('No saved session. Sign in with email + password first.')
        return
      }
      const result = await exchangeRefreshToken(refreshToken)
      login(result.user as unknown as User, result.token)
      router.replace('/(tabs)')
    } catch (e) {
      const _err = e as { message?: string }
      if (!silentOnFail) setError((e as { message?: string }).message || 'Biometric login failed')
    } finally {
      setBioLoading(false)
    }
  }

  const showBio = capability?.available && bioEnabled
  const bioIcon = biometricIconName(capability?.primary ?? 'fingerprint')
  const bioName = biometricLabel(capability?.primary ?? 'fingerprint')

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: c.white }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logo}>
          <Logo size={48} theme="dark" />
          <Text style={[s.subtitle, { color: c.muted }]}>Sign in to your account</Text>
        </View>

        {error ? <View style={s.errorBox}><Text style={[s.errorText, { color: c.danger }]}>{error}</Text></View> : null}

        {showBio ? (
          <View style={s.bioPanel}>
            <TouchableOpacity
              style={[s.bioButton, { backgroundColor: c.primary }]}
              onPress={() => runBiometricLogin(false)}
              disabled={bioLoading || loading}
              accessibilityLabel={`Sign in with ${bioName}`}
              accessibilityRole="button"
            >
              {bioLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name={bioIcon} size={28} color="#ffffff" />
                  <Text style={s.bioButtonText}>Sign in with {bioName}</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={s.divider}>
              <View style={[s.dividerLine, { backgroundColor: c.border }]} />
              <Text style={[s.dividerText, { color: c.muted }]}>or use password</Text>
              <View style={[s.dividerLine, { backgroundColor: c.border }]} />
            </View>
          </View>
        ) : null}

        <View style={s.form}>
          <Text style={[s.label, { color: c.text }]}>Email</Text>
          <TextInput style={[s.input, { borderColor: c.border, backgroundColor: c.white, color: c.text }]} placeholder="you@example.com" placeholderTextColor={c.muted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

          <Text style={[s.label, { color: c.text }]}>Password</Text>
          <View style={[s.passwordWrap, { borderColor: c.border, backgroundColor: c.white }]}>
            <TextInput style={[s.passwordInput, { color: c.text }]} placeholder="Enter your password" placeholderTextColor={c.muted} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
            <Pressable onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.muted} />
            </Pressable>
          </View>

          <Link href="/auth/forgot-password" style={[s.forgotLink, { color: c.primary }]}>Forgot password?</Link>

          <TouchableOpacity style={[s.button, { backgroundColor: c.primary }]} onPress={handleLogin} disabled={loading || bioLoading}>
            {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={s.buttonText}>Sign In</Text>}
          </TouchableOpacity>

          {capability?.available && !bioEnabled ? (
            <View style={[s.bioHint, { borderColor: c.border, backgroundColor: c.card }]}>
              <Ionicons name={bioIcon} size={18} color={c.primary} />
              <Text style={[s.bioHintText, { color: c.muted }]}>
                Tip: enable {bioName} after signing in for one-tap access.
              </Text>
            </View>
          ) : null}

          <View style={s.footer}>
            <Text style={[s.footerText, { color: c.muted }]}>Don't have an account? </Text>
            <Link href="/auth/register" style={[s.link, { color: c.primary }]}>Create one</Link>
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
  form: { gap: spacing.sm },
  label: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.sm },
  input: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Manrope_400Regular' },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, height: 52 },
  passwordInput: { flex: 1, height: '100%', paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Manrope_400Regular' },
  eyeBtn: { paddingHorizontal: 14, height: '100%', justifyContent: 'center' },
  button: { height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: spacing.md },
  buttonText: { color: '#ffffff', fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { fontSize: 14, fontFamily: 'Manrope_400Regular' },
  link: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  forgotLink: { fontSize: 13, fontFamily: 'Manrope_500Medium', textAlign: 'right', marginTop: spacing.xs },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 10, padding: spacing.md, marginBottom: spacing.md },
  errorText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
  bioPanel: { marginBottom: spacing.lg },
  bioButton: { height: 64, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  bioButtonText: { color: '#ffffff', fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  divider: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontFamily: 'Manrope_500Medium' },
  bioHint: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: 12, borderWidth: 1, marginTop: spacing.md },
  bioHintText: { flex: 1, fontSize: 13, fontFamily: 'Manrope_400Regular' },
})
