import { useEffect, useState } from 'react'
import { View, Text, TextInput, StyleSheet, ActivityIndicator, Pressable, Alert } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../../lib/theme'
import { neuCard } from '../../lib/neu'
import { api } from '../../lib/api'
import { useAuthStore, type User } from '../../stores/authStore'
import { AuthShell, authInset } from '../../components/AuthShell'
import { PressScale } from '../../components/Motion'
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

interface LoginResponse {
  user?: User
  token?: string
  refreshToken?: string
  mfaRequired?: boolean
  mfaToken?: string
}

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
  // Second login step for accounts with two-factor authentication. The
  // short-lived challenge token stays in memory only — never in a route param.
  const [mfaToken, setMfaToken] = useState('')
  const [mfaCode, setMfaCode] = useState('')

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

  /** Only a response carrying a real user and access token may start a session. */
  function completeSignIn(data: LoginResponse) {
    if (!data?.user?.id || !data.token) throw new Error('Unexpected response from the server. Please try again.')
    // Persist the refresh token so the 401 auto-refresh works and password users
    // aren't logged out the moment the short-lived access token expires.
    login(data.user, data.token, data.refreshToken)
    router.replace('/(tabs)')
  }

  async function loginWithCredentials(emailInput: string, passwordInput: string): Promise<'signed-in' | 'mfa'> {
    const data = await api.post<LoginResponse>('/auth/login', {
      email: emailInput, password: passwordInput,
    })
    // MFA accounts answer { mfaRequired, mfaToken } with no session yet; the
    // session only exists after the TOTP code is verified at /auth/login/mfa.
    if (data?.mfaRequired) {
      if (!data.mfaToken) throw new Error('Two-factor sign-in could not start. Please try again.')
      setMfaCode('')
      setMfaToken(data.mfaToken)
      return 'mfa'
    }
    completeSignIn(data)
    return 'signed-in'
  }

  function offerBiometricEnrollment() {
    // After a successful password login, offer to enable biometric (only if available + not yet enabled)
    if (!capability?.available || bioEnabled) return
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
              await enableBiometricLogin(password)
              setBioEnabled(true)
            } catch (err) {
              Alert.alert('Could not enable', (err as { message?: string }).message ?? 'Try again later.')
            }
          },
        },
      ],
    )
  }

  async function handleLogin() {
    if (!email || !password) { setError('Please fill in all fields'); return }
    setError(''); setLoading(true)
    try {
      if (await loginWithCredentials(email, password) === 'signed-in') offerBiometricEnrollment()
    } catch (e) {
      setError((e as { message?: string }).message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyMfa() {
    if (mfaCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app'); return }
    setError(''); setLoading(true)
    try {
      completeSignIn(await api.post<LoginResponse>('/auth/login/mfa', { mfaToken, code: mfaCode }))
      offerBiometricEnrollment()
    } catch (e) {
      const message = (e as { message?: string }).message || 'Verification failed'
      setError(message)
      // The challenge lasts five minutes; once it has expired only a fresh
      // password step can issue a new one.
      if (/expired/i.test(message)) { setMfaToken(''); setMfaCode('') }
      else setMfaCode('')
    } finally {
      setLoading(false)
    }
  }

  function cancelMfa() {
    setMfaToken(''); setMfaCode(''); setError('')
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
      // Biometric sessions must mark biometricSession so the 401 auto-refresh
      // uses the biometric exchange path — and the rotated token must be passed
      // along, or refresh fails the moment the access token expires.
      login(result.user as unknown as User, result.token, result.refreshToken, { biometricSession: true })
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
    <AuthShell
      eyebrow="Ghana's connected rental operating system"
      title="The keys to your housing world."
      subtitle="Manage homes, payments, people, and services from one trusted workspace built for Ghana."
      formEyebrow="Secure workspace access"
      formTitle={mfaToken ? 'Two-factor authentication' : 'Welcome back'}
      formSubtitle={mfaToken ? 'Enter the 6-digit code from your authenticator app to finish signing in.' : 'Sign in to continue to your RentOS workspace.'}
    >
        {error ? <View style={s.errorBox}><Text accessibilityLiveRegion="polite" style={[s.errorText, { color: c.danger }]}>{error}</Text></View> : null}

        {mfaToken ? (
          <View style={s.form}>
            <Text style={[s.label, { color: c.text }]}>Authentication code</Text>
            <View style={[s.inputWrap, authInset(c)]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={c.muted} />
              <TextInput
                style={[s.input, s.codeInput, { color: c.text }]}
                accessibilityLabel="Authentication code"
                placeholder="000000"
                placeholderTextColor={c.muted}
                value={mfaCode}
                onChangeText={(text) => setMfaCode(text.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                onSubmitEditing={handleVerifyMfa}
              />
            </View>
            <PressScale
              style={[s.button, { backgroundColor: c.primary, opacity: mfaCode.length === 6 ? 1 : 0.6 }]}
              onPress={handleVerifyMfa}
              disabled={loading || mfaCode.length !== 6}
              accessibilityRole="button"
              accessibilityLabel="Verify code"
            >
              {loading ? <ActivityIndicator color="#ffffff" /> : (
                <>
                  <Text style={s.buttonText}>Verify</Text>
                  <Ionicons name="arrow-forward" size={17} color="#ffffff" />
                </>
              )}
            </PressScale>
            <Pressable onPress={cancelMfa} accessibilityRole="button" style={s.backLink}>
              <Text style={[s.link, { color: c.primary }]}>Back to sign in</Text>
            </Pressable>
          </View>
        ) : <>
        {showBio ? (
          <View style={s.bioPanel}>
            <PressScale
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
            </PressScale>
            <View style={s.divider}>
              <View style={[s.dividerLine, { backgroundColor: c.border }]} />
              <Text style={[s.dividerText, { color: c.muted }]}>or use password</Text>
              <View style={[s.dividerLine, { backgroundColor: c.border }]} />
            </View>
          </View>
        ) : null}

        <View style={s.form}>
          <Text style={[s.label, { color: c.text }]}>Email</Text>
          <View style={[s.inputWrap, authInset(c)]}>
            <Ionicons name="mail-outline" size={18} color={c.muted} />
            <TextInput
              style={[s.input, { color: c.text }]}
              placeholder="you@example.com"
              placeholderTextColor={c.muted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={s.passwordLabelRow}>
            <Text style={[s.label, { color: c.text }]}>Password</Text>
            <Link href="/auth/forgot-password" style={[s.forgotLink, { color: c.primary }]}>Forgot password?</Link>
          </View>
          <View style={[s.passwordWrap, authInset(c)]}>
            <Ionicons name="lock-closed-outline" size={18} color={c.muted} style={s.leadingIcon} />
            <TextInput style={[s.passwordInput, { color: c.text }]} placeholder="Enter your password" placeholderTextColor={c.muted} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
            <Pressable onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.muted} />
            </Pressable>
          </View>

          <PressScale style={[s.button, { backgroundColor: c.primary }]} onPress={handleLogin} disabled={loading || bioLoading}>
            {loading ? <ActivityIndicator color="#ffffff" /> : (
              <>
                <Text style={s.buttonText}>Sign in</Text>
                <Ionicons name="arrow-forward" size={17} color="#ffffff" />
              </>
            )}
          </PressScale>

          {capability?.available && !bioEnabled ? (
            <View style={[s.bioHint, neuCard(c)]}>
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

          {/*
            Reachable WITHOUT an account, on purpose. Someone being pushed out
            of their home should not have to register before finding out
            whether it is legal. The endpoint behind it is public too.
          */}
          <View style={s.footer}>
            <Text style={[s.footerText, { color: c.muted }]}>Landlord trouble? </Text>
            <Link href="/rights-check" style={[s.link, { color: c.primary }]}>Check if it&apos;s legal</Link>
          </View>
        </View>
        </>}
    </AuthShell>
  )
}

const s = StyleSheet.create({
  form: { gap: spacing.sm },
  label: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', marginTop: spacing.sm },
  inputWrap: { height: 54, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, height: '100%', fontSize: 15, fontFamily: 'Outfit_400Regular' },
  codeInput: { fontSize: 20, letterSpacing: 6, fontFamily: 'Outfit_600SemiBold' },
  backLink: { alignSelf: 'center', paddingVertical: spacing.sm, marginTop: spacing.sm },
  passwordLabelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', height: 52 },
  leadingIcon: { marginLeft: spacing.md },
  passwordInput: { flex: 1, height: '100%', paddingHorizontal: 10, fontSize: 15, fontFamily: 'Outfit_400Regular' },
  eyeBtn: { paddingHorizontal: 14, height: '100%', justifyContent: 'center' },
  button: { height: 54, borderRadius: 12, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: spacing.md },
  buttonText: { color: '#ffffff', fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  footerText: { fontSize: 14, fontFamily: 'Outfit_400Regular' },
  link: { fontSize: 14, fontFamily: 'Outfit_600SemiBold' },
  forgotLink: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', marginBottom: 1 },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.09)', borderColor: 'rgba(239,68,68,0.2)', borderWidth: 1, borderRadius: 10, padding: spacing.md, marginBottom: spacing.md },
  errorText: { fontSize: 14, fontFamily: 'Outfit_500Medium' },
  bioPanel: { marginBottom: spacing.lg },
  bioButton: { height: 58, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  bioButtonText: { color: '#ffffff', fontSize: 16, fontFamily: 'Outfit_600SemiBold' },
  divider: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontFamily: 'Outfit_500Medium' },
  bioHint: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, marginTop: spacing.md },
  bioHintText: { flex: 1, fontSize: 13, fontFamily: 'Outfit_400Regular' },
})
