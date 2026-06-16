import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../../lib/theme'
import { api } from '../../lib/api'

export default function ResetPasswordScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { token } = useLocalSearchParams<{ token: string }>()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit() {
    if (!password || password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (!token) { setError('Invalid reset link. Please request a new one.'); return }
    setError(''); setStatus('loading')
    try {
      await api.post('/auth/reset-password', { token, newPassword: password })
      setStatus('done')
    } catch (e) {      const _err = e as { message?: string }

      setError((e as { message?: string }).message || 'Failed to reset password')
      setStatus('idle')}
  }

  if (status === 'done') {
    return (
      <View style={[s.container, { backgroundColor: c.white }]}>
        <View style={s.centered}>
          <Ionicons name="checkmark-circle" size={48} color={c.accent} />
          <Text style={[s.successTitle, { color: c.primaryDark }]}>Password Reset!</Text>
          <Text style={[s.successDesc, { color: c.muted }]}>Your password has been updated. You can now sign in with your new password.</Text>
          <TouchableOpacity style={[s.button, { backgroundColor: c.primary }]} onPress={() => router.replace('/auth/login')}>
            <Text style={s.buttonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: c.white }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[s.title, { color: c.primaryDark }]}>Reset Password</Text>
        <Text style={[s.subtitle, { color: c.muted }]}>Create a new password for your account.</Text>

        {error ? <View style={[s.errorBox, { backgroundColor: c.danger + '10' }]}><Text style={{ color: c.danger, fontSize: 13, fontFamily: 'Manrope_500Medium' }}>{error}</Text></View> : null}

        <View style={s.form}>
          <Text style={[s.label, { color: c.text }]}>New Password</Text>
          <View style={[s.inputWrap, { borderColor: c.border, backgroundColor: c.white }]}>
            <TextInput
              style={[s.input, { color: c.text }]}
              placeholder="Min 8 characters"
              placeholderTextColor={c.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.muted} />
            </TouchableOpacity>
          </View>

          <Text style={[s.label, { color: c.text }]}>Confirm Password</Text>
          <TextInput
            style={[s.inputPlain, { borderColor: c.border, backgroundColor: c.white, color: c.text }]}
            placeholder="Re-enter password"
            placeholderTextColor={c.muted}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!showPassword}
          />
          {confirm.length > 0 && (
            <View style={s.matchRow}>
              <Ionicons name={password === confirm ? 'checkmark-circle' : 'close-circle'} size={14} color={password === confirm ? c.accent : c.danger} />
              <Text style={{ color: password === confirm ? c.accent : c.danger, fontSize: 11, fontFamily: 'Manrope_500Medium' }}>
                {password === confirm ? 'Passwords match' : 'Passwords do not match'}
              </Text>
            </View>
          )}

          <TouchableOpacity style={[s.button, { backgroundColor: c.primary }, status === 'loading' && s.buttonDisabled]} onPress={handleSubmit} disabled={status === 'loading'}>
            {status === 'loading' ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Reset Password</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 28, fontFamily: 'Manrope_800ExtraBold', marginBottom: spacing.xs },
  subtitle: { fontSize: 14, fontFamily: 'Manrope_400Regular', marginBottom: spacing.lg },
  successTitle: { fontSize: 22, fontFamily: 'Manrope_800ExtraBold' },
  successDesc: { fontSize: 14, fontFamily: 'Manrope_400Regular', textAlign: 'center', lineHeight: 22 },
  form: { gap: spacing.sm },
  label: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', marginTop: spacing.sm },
  inputWrap: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, fontSize: 15, fontFamily: 'Manrope_400Regular' },
  inputPlain: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md, fontSize: 15, fontFamily: 'Manrope_400Regular' },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  button: { height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: spacing.md },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  errorBox: { borderRadius: 10, padding: spacing.md, marginBottom: spacing.md },
})
