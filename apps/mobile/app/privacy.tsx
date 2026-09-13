import { useState } from 'react'
import { ScrollView, Text, TextInput, TouchableOpacity, View, Linking, Share } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import { clearBiometricCredential } from '../lib/credentialStorage'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'

export default function PrivacyScreen() {
  const c = useThemeColors()
  const cache = useQueryClient()
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [closed, setClosed] = useState(false)

  async function exportData() {
    setBusy(true); setMessage('')
    try {
      const data = await api.get('/users/me/export')
      await Share.share({ title: 'RentOS personal data', message: JSON.stringify(data, null, 2) })
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Unable to export data. Please try again.') }
    finally { setBusy(false) }
  }

  async function deleteAccount() {
    if (confirmation !== 'DELETE') return
    setBusy(true); setMessage('')
    try {
      await api.delete('/users/me')
      setClosed(true)
      cache.clear()
      useAuthStore.getState().logout()
      const closedSession = useAuthStore.getState().sessionVersion
      useNotificationStore.getState().pushToast({ title: 'Your account is closed', body: 'Core profile erased. See the privacy policy for retained records and deletion timelines.', type: 'system', persistent: true })
      // Closure already revoked server credentials. Only clear this device here.
      try { await clearBiometricCredential() }
      catch {
        if (useAuthStore.getState().sessionVersion === closedSession) useNotificationStore.getState().pushToast({ title: 'Device cleanup needs attention', body: 'Your account is closed, but removal of saved biometric credentials could not be confirmed.', type: 'system', persistent: true })
      }
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Unable to delete account. Please try again.') }
    finally { setBusy(false) }
  }

  async function openPolicy(path: string) {
    try { await Linking.openURL(`https://userentos.com/${path}`) }
    catch { setMessage('Unable to open the policy. Visit userentos.com in your browser.') }
  }

  const button = { padding: spacing.md, borderRadius: 16, backgroundColor: c.primary, opacity: busy ? 0.5 : 1 }
  return <ScrollView style={{ backgroundColor: c.surface }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
    <Text style={{ color: c.text, fontSize: 26, fontWeight: '700' }}>Privacy and personal data</Text>
    <View style={[neuCard(c), { padding: spacing.lg, gap: spacing.md }]}>
      {closed ? <Text accessibilityLiveRegion="polite" style={{ color: c.text }}>Your account is closed. Core profile details have been erased and related personal records are scheduled for deletion after 30 days.</Text> : <>
        <Text style={{ color: c.text }}>Your export contains personal information. Choose a secure destination when saving or sharing it.</Text>
        <TouchableOpacity accessibilityRole="button" style={button} disabled={busy} onPress={exportData}><Text style={{ color: '#fff' }}>Export my personal data</Text></TouchableOpacity>
        <Text style={{ color: c.text }}>Deleting your account immediately erases your core profile and schedules related personal records for deletion after 30 days. Financial, agreement and dispute records may be retained for legal obligations. Deletion cannot be undone. It does not settle balances or end a tenancy.</Text>
        <Text style={{ color: c.text }}>Type DELETE to confirm permanent account closure</Text>
        <TextInput accessibilityLabel="Type DELETE to confirm account deletion" style={[neuInset(c), { padding: spacing.md, color: c.text }]} value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} editable={!busy} />
        <TouchableOpacity accessibilityRole="button" style={{ ...button, backgroundColor: '#b42318', opacity: busy || confirmation !== 'DELETE' ? 0.5 : 1 }} disabled={busy || confirmation !== 'DELETE'} onPress={deleteAccount}><Text style={{ color: '#fff' }}>{busy ? 'Please wait…' : 'Delete my account'}</Text></TouchableOpacity>
      </>}
      {!!message && <Text accessibilityLiveRegion="polite" style={{ color: c.text }}>{message}</Text>}
    </View>
    <TouchableOpacity accessibilityRole="link" onPress={() => openPolicy('privacy')}><Text style={{ color: c.primary }}>Privacy policy</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="link" onPress={() => openPolicy('terms')}><Text style={{ color: c.primary }}>Terms of service</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="link" onPress={() => openPolicy('delete-account')}><Text style={{ color: c.primary }}>Deletion requests and support</Text></TouchableOpacity>
  </ScrollView>
}
