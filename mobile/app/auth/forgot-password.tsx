import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native'
import { Link } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../../lib/theme'
import { api } from '../../lib/api'

export default function ForgotPasswordScreen() {
  const c = useThemeColors()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!email) { setError('Please enter your email address'); return }
    setError(''); setStatus('loading')
    try { await api.post('/auth/forgot-password', { email }); setStatus('sent') }
    catch (e) {
      const _err = e as { message?: string }
      setError((e as { message?: string }).message || 'Failed to send reset link'); setStatus('idle')
    }
  }

  if (status === 'sent') {
    return (
      <View style={[s.container, { backgroundColor: c.white }]}>
        <View style={s.centeredContent}>
          <View style={s.successIcon}>
            <Ionicons name="checkmark-circle" size={48} color={c.accent} />
          </View>
          <Text style={[s.successTitle, { color: c.primaryDark }]}>Check your email</Text>
          <Text style={[s.successDesc, { color: c.muted }]}>
            If <Text style={[s.successEmail, { color: c.primaryDark }]}>{email}</Text> is registered, we've sent a password reset link. Check your inbox and spam folder.
          </Text>
          <TouchableOpacity style={s.tryAgainBtn} onPress={() => { setStatus('idle'); setEmail('') }} activeOpacity={0.7}>
            <Text style={[s.tryAgainText, { color: c.primary }]}>Try a different email</Text>
          </TouchableOpacity>
          <Link href="/auth/login" style={[s.backLink, { color: c.muted }]}>Back to sign in</Link>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: c.white }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.topNav}>
          <Link href="/auth/login" asChild>
            <TouchableOpacity style={s.backRow} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={18} color={c.muted} />
              <Text style={[s.backRowText, { color: c.muted }]}>Back to sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <Text style={[s.title, { color: c.primaryDark }]}>Forgot password?</Text>
        <Text style={[s.subtitle, { color: c.muted }]}>Enter your email and we'll send you a reset link.</Text>

        {error ? <View style={s.errorBox}><Text style={[s.errorText, { color: c.danger }]}>{error}</Text></View> : null}

        <View style={s.form}>
          <Text style={[s.label, { color: c.text }]}>Email</Text>
          <TextInput style={[s.input, { borderColor: c.border, backgroundColor: c.white, color: c.text }]} placeholder="you@example.com" placeholderTextColor={c.muted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

          <TouchableOpacity style={[s.button, { backgroundColor: c.primary }, status === 'loading' && s.buttonDisabled]} onPress={handleSubmit} disabled={status === 'loading'} activeOpacity={0.85}>
            {status === 'loading' ? <ActivityIndicator color="#ffffff" /> : (
              <><Text style={s.buttonText}>Send Reset Link</Text><Ionicons name="arrow-forward" size={18} color="#ffffff" /></>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  centeredContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  topNav: { marginBottom: spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backRowText: { fontSize: 14, fontFamily: 'Manrope_400Regular' },
  title: { fontSize: 28, fontFamily: 'Manrope_800ExtraBold', marginBottom: spacing.xs },
  subtitle: { fontSize: 14, fontFamily: 'Manrope_400Regular', marginBottom: spacing.lg },
  form: { gap: spacing.sm },
  label: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.sm },
  input: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Manrope_400Regular' },
  button: { height: 52, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: spacing.md },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 10, padding: spacing.md, marginBottom: spacing.md },
  errorText: { fontSize: 14, fontFamily: 'Manrope_500Medium' },
  successIcon: { marginBottom: spacing.lg },
  successTitle: { fontSize: 24, fontFamily: 'Manrope_800ExtraBold', marginBottom: spacing.sm },
  successDesc: { fontSize: 14, fontFamily: 'Manrope_400Regular', textAlign: 'center', lineHeight: 22, maxWidth: 300, marginBottom: spacing.lg },
  successEmail: { fontFamily: 'Manrope_700Bold' },
  tryAgainBtn: { marginBottom: spacing.md },
  tryAgainText: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  backLink: { fontSize: 14, fontFamily: 'Manrope_400Regular' },
})
