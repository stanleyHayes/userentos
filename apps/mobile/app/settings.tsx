import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Switch,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useThemeColors, spacing } from '../lib/theme'
import { neuCard, neuInset } from '../lib/neu'
import { api } from '../lib/api'
import { useAuthStore, type User } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import {
  authenticateWithBiometric,
  biometricIconName,
  biometricLabel,
  disableBiometricLogin,
  enableBiometricLogin,
  getBiometricCapability,
  isBiometricEnabled,
  type BiometricCapability,
} from '../lib/biometric'
import { PushPermissionPrompt } from '../components/PushPermissionPrompt'
import { parseNotificationPreferences, type NotificationPreferenceKey, type NotificationPreferences } from '../../../packages/shared/notificationPreferences'

const themeOptions = [
  { value: 'light' as const, label: 'Light', desc: 'Clean & bright', icon: 'sunny-outline' as const },
  { value: 'dark' as const, label: 'Dark', desc: 'Easy on the eyes', icon: 'moon-outline' as const },
  { value: 'system' as const, label: 'System', desc: 'Match your OS', icon: 'phone-portrait-outline' as const },
]

const notificationPrefs: { key: NotificationPreferenceKey; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'email', label: 'Email Notifications', desc: 'Receive updates via email', icon: 'mail-outline' as const },
  { key: 'sms', label: 'SMS Notifications', desc: 'Get text message alerts', icon: 'chatbubble-outline' as const },
  { key: 'push', label: 'Push Notifications', desc: 'Mobile push alerts', icon: 'notifications-outline' as const },
  { key: 'payment', label: 'Payment Reminders', desc: 'Rent due date reminders', icon: 'card-outline' as const },
  { key: 'savings', label: 'Savings Alerts', desc: 'Goal progress & milestones', icon: 'trending-up-outline' as const },
]

type Tab = 'profile' | 'security' | 'appearance' | 'notifications'

const tabs: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'profile', label: 'Profile', icon: 'person-outline' },
  { id: 'security', label: 'Security', icon: 'shield-outline' },
  { id: 'appearance', label: 'Theme', icon: 'color-palette-outline' },
  { id: 'notifications', label: 'Alerts', icon: 'notifications-outline' },
]

export default function SettingsScreen() {
  const router = useRouter()
  const c = useThemeColors()
  const [activeTab, setActiveTab] = useState<Tab>('profile')

  return (
    <View style={[s.container, { backgroundColor: c.surface }]}>
      {/* Tab bar */}
      <View style={[s.tabBar, { backgroundColor: c.white, borderBottomColor: c.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBarInner}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[s.tab, activeTab === tab.id && { backgroundColor: c.primary + '14' }]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              <Ionicons name={tab.icon} size={16} color={activeTab === tab.id ? c.primary : c.muted} />
              <Text style={[s.tabLabel, { color: activeTab === tab.id ? c.primary : c.muted }]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {activeTab === 'profile' && <ProfileTab c={c} />}
        {activeTab === 'security' && <SecurityTab c={c} />}
        {activeTab === 'appearance' && <AppearanceTab c={c} />}
        {activeTab === 'notifications' && <NotificationsTab c={c} />}
        <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/privacy')} style={[neuCard(c), { padding: spacing.md, marginTop: spacing.md }]}>
          <Text style={{ color: c.primary, fontWeight: '600' }}>Privacy, data export and account deletion</Text>
        </TouchableOpacity>
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  )
}

/* ─── Profile Tab ─── */
function ProfileTab({ c }: { c: ReturnType<typeof useThemeColors> }) {
  const { user } = useAuthStore()
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [ghanaCardId, setGhanaCardId] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!firstName.trim()) { Alert.alert('Error', 'First name is required'); return }
    if (!lastName.trim()) { Alert.alert('Error', 'Last name is required'); return }
    setSaving(true)
    try {
      const body: Record<string, string> = { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() }
      if (ghanaCardId.trim()) body.ghanaCardId = ghanaCardId.trim()
      const updated = await api.patch<Record<string, unknown>>('/users/me', body)
      // Update auth store so UI reflects changes (updateUser preserves the
      // session tokens — login() without refreshToken would wipe them)
      useAuthStore.getState().updateUser(updated as Partial<User>)
      Alert.alert('Success', 'Profile updated successfully')
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to update profile')
    } finally { setSaving(false) }
  }

  return (
    <View style={[s.section, neuCard(c)]}>
      <View style={s.sectionHeader}>
        <Ionicons name="person-outline" size={20} color={c.primary} />
        <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Edit Profile</Text>
      </View>
      <Field label="First Name" value={firstName} onChangeText={setFirstName} c={c} />
      <Field label="Last Name" value={lastName} onChangeText={setLastName} c={c} />
      <Field label="Phone Number" value={phone} onChangeText={setPhone} c={c} keyboardType="phone-pad" placeholder="e.g. 0241234567" />
      <Field label="Ghana Card ID" value={ghanaCardId} onChangeText={setGhanaCardId} c={c} placeholder="GHA-XXXXXXXXX-X" autoCapitalize="characters" />
      <ActionButton label="Save Profile" icon="checkmark-circle" loading={saving} onPress={handleSave} bg={c.primary} />
    </View>
  )
}

/* ─── Security Tab ─── */
function SecurityTab({ c }: { c: ReturnType<typeof useThemeColors> }) {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changing, setChanging] = useState(false)
  const [capability, setCapability] = useState<BiometricCapability | null>(null)
  const [bioEnabled, setBioEnabled] = useState(false)
  const [bioBusy, setBioBusy] = useState(false)
  const [bioPassword, setBioPassword] = useState('')
  const [bioMessage, setBioMessage] = useState('')
  const [revocationPending, setRevocationPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [cap, enabled] = await Promise.all([getBiometricCapability(), isBiometricEnabled()])
      if (cancelled) return
      setCapability(cap)
      setBioEnabled(enabled)
    })()
    return () => { cancelled = true }
  }, [])

  async function handleChange() {
    if (!currentPassword) { Alert.alert('Error', 'Please enter your current password'); return }
    if (!newPassword || newPassword.length < 6) { Alert.alert('Error', 'New password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword) { Alert.alert('Error', 'Passwords do not match'); return }
    setChanging(true)
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword })
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      Alert.alert('Success', 'Password changed successfully')
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message || 'Failed to change password')
    } finally { setChanging(false) }
  }

  async function confirmBiometricDisable() {
    const result = await disableBiometricLogin()
    setBioEnabled(false)
    setRevocationPending(!result.serverRevoked)
    setBioMessage(result.serverRevoked
      ? 'Biometric login is off on this device and your biometric sessions have been revoked.'
      : 'Biometric login is off on this device. Server revocation could not be confirmed. Reconnect and retry to revoke your other biometric sessions.')
  }
  async function retryBiometricRevocation() {
    setBioBusy(true)
    try { await confirmBiometricDisable() }
    catch (error) { setBioMessage(error instanceof Error ? error.message : 'Could not finish disabling biometric login. Please retry.') }
    finally { setBioBusy(false) }
  }

  async function handleToggleBiometric(next: boolean) {
    if (!capability?.available) {
      Alert.alert(
        'Not available',
        capability?.hasHardware
          ? 'Set up a fingerprint or face unlock in your device settings first.'
          : 'This device does not support biometric authentication.',
      )
      return
    }
    if (!next) {
      // disable: prompt biometric, then revoke server-side + clear local
      setBioBusy(true)
      try {
        const ok = await authenticateWithBiometric('Disable biometric login')
        if (!ok) return
        await confirmBiometricDisable()
      } catch (e) {
        setBioMessage((e as { message?: string }).message || 'Could not disable biometric login. Please retry.')
    } finally { setBioBusy(false) }
      return
    }
    // enable: re-verify password against API, then enroll a refresh token
    const user = useAuthStore.getState().user
    if (!user?.email) { Alert.alert('Error', 'You must be signed in.'); return }
    if (!bioPassword) { Alert.alert('Password required', 'Enter your account password to enable biometric login.'); return }
    setBioBusy(true)
    try {
      const ok = await authenticateWithBiometric(`Enable ${biometricLabel(capability.primary)} login`)
      if (!ok) return
      // Enroll: server issues a long-lived refresh token (requires password re-auth);
      // we store the token, never the password
      await enableBiometricLogin(bioPassword)
      setBioEnabled(true)
      setBioPassword('')
      setRevocationPending(false)
      setBioMessage(`${biometricLabel(capability.primary)} login is now active. Your password is not stored on this device.`)
    } catch (e) {
      setBioMessage((e as { message?: string }).message || 'Could not enable biometric login. Please retry.')
    } finally { setBioBusy(false) }
  }

  const bioName = biometricLabel(capability?.primary ?? 'fingerprint')
  const bioIcon = biometricIconName(capability?.primary ?? 'fingerprint')

  return (
    <>
      {/* Biometric login */}
      <View style={[s.section, neuCard(c)]}>
        <View style={s.sectionHeader}>
          <Ionicons name={bioIcon} size={20} color={c.primary} />
          <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Biometric Login</Text>
        </View>
        <View style={s.bioRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.bioRowTitle, { color: c.primaryDark }]}>{bioName} sign-in</Text>
            <Text style={[s.bioRowDesc, { color: c.muted }]}>
              {!capability?.hasHardware
                ? 'Not supported on this device'
                : !capability.isEnrolled
                  ? `Set up ${bioName.toLowerCase()} in device settings to enable`
                  : bioEnabled
                    ? 'Active — sign in with one tap'
                    : 'Enter your password below, then enable'}
            </Text>
          </View>
          {bioBusy ? <ActivityIndicator color={c.primary} /> : (
            <Switch
              value={bioEnabled}
              onValueChange={handleToggleBiometric}
              disabled={!capability?.available}
              trackColor={{ false: c.border, true: c.primary }}
            />
          )}
        </View>
        {!!bioMessage && <Text accessibilityRole="alert" style={{ color: c.text, marginTop: spacing.sm }}>{bioMessage}</Text>}
        {revocationPending && <TouchableOpacity accessibilityRole="button" disabled={bioBusy} onPress={() => void retryBiometricRevocation()}><Text style={{ color: c.primary, paddingVertical: spacing.md }}>Retry server revocation</Text></TouchableOpacity>}
        {capability?.available && !bioEnabled ? (
          <Field
            label="Account password"
            value={bioPassword}
            onChangeText={setBioPassword}
            c={c}
            secureTextEntry
            placeholder="Enter password to enable biometric login"
          />
        ) : null}
          <TouchableOpacity
            style={[s.manageDevicesBtn, { borderColor: c.border }]}
            onPress={() => router.push('/biometric-devices')}
          >
            <Ionicons name="phone-portrait-outline" size={18} color={c.primary} />
            <Text style={[s.manageDevicesText, { color: c.primaryDark }]}>Manage biometric devices</Text>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </TouchableOpacity>
      </View>

      {/* Change Password */}
      <View style={[s.section, neuCard(c)]}>
        <View style={s.sectionHeader}>
          <Ionicons name="lock-closed-outline" size={20} color={c.primary} />
          <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Change Password</Text>
        </View>
        <Field label="Current Password" value={currentPassword} onChangeText={setCurrentPassword} c={c} secureTextEntry placeholder="Enter current password" />
        <Field label="New Password" value={newPassword} onChangeText={setNewPassword} c={c} secureTextEntry placeholder="Enter new password" />
        <Field label="Confirm New Password" value={confirmPassword} onChangeText={setConfirmPassword} c={c} secureTextEntry placeholder="Confirm new password" />
        <ActionButton label="Change Password" icon="key" loading={changing} onPress={handleChange} bg={c.primaryLight} />
      </View>
    </>
  )
}

/* ─── Appearance Tab ─── */
function AppearanceTab({ c }: { c: ReturnType<typeof useThemeColors> }) {
  const mounted = useMounted()
  const { mode, setMode } = useThemeStore()
  const [syncFailed, setSyncFailed] = useState(false)

  async function handleTheme(value: 'light' | 'dark' | 'system') {
    // The theme applies on this device immediately; account sync is best effort
    // but a failure is reported rather than silently implying it was saved.
    setMode(value)
    setSyncFailed(false)
    try { await api.patch('/settings', { theme: value }) }
    catch { if (mounted.current) setSyncFailed(true) }
  }

  return (
    <View style={[s.section, neuCard(c)]}>
      <View style={s.sectionHeader}>
        <Ionicons name="color-palette-outline" size={20} color={c.primary} />
        <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Theme</Text>
      </View>
      <View style={s.optionGrid}>
        {themeOptions.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === opt.value }}
            style={[
              s.themeCard,
              { borderColor: c.border },
              mode === opt.value && { borderColor: c.primary, backgroundColor: c.primary + '08' },
            ]}
            onPress={() => void handleTheme(opt.value)}
            activeOpacity={0.7}
          >
            {mode === opt.value && (
              <View style={[s.checkBadge, { backgroundColor: c.primary }]}>
                <Ionicons name="checkmark" size={10} color="#fff" />
              </View>
            )}
            <View style={[s.themeIcon, { backgroundColor: mode === opt.value ? c.primary + '18' : c.surface }]}>
              <Ionicons name={opt.icon} size={22} color={mode === opt.value ? c.primary : c.muted} />
            </View>
            <Text style={[s.themeLabel, { color: c.primaryDark }]}>{opt.label}</Text>
            <Text style={[s.themeDesc, { color: c.muted }]}>{opt.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {syncFailed && (
        <Text accessibilityRole="alert" style={{ color: c.text, marginTop: spacing.md }}>
          Theme changed on this device, but it could not be saved to your account.
        </Text>
      )}
    </View>
  )
}

/* ─── Notifications Tab ─── */
type PendingPreference = { key: NotificationPreferenceKey; value: boolean }

function NotificationsTab({ c }: { c: ReturnType<typeof useThemeColors> }) {
  const mounted = useMounted()
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'failed' | 'ready'>('loading')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<PendingPreference | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      // Only a complete saved snapshot is shown; defaults would misstate choices.
      const next = parseNotificationPreferences(await api.get('/settings'))
      if (!mounted.current) return
      setPrefs(next)
      setLoadState(next ? 'ready' : 'failed')
    } catch {
      if (mounted.current) setLoadState('failed')
    }
  }, [mounted])
  useEffect(() => { void load() }, [load])

  async function save(change: PendingPreference) {
    setSaving(true); setFailed(null); setSaved(false)
    try {
      // Send only the changed channel so a stale snapshot cannot overwrite another save.
      const next = parseNotificationPreferences(await api.patch('/settings', { notifications: { [change.key]: change.value } }))
      if (!next) throw new Error('Incomplete settings response')
      if (!mounted.current) return
      setPrefs(next); setSaved(true)
    } catch {
      if (mounted.current) setFailed(change)
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  return (
    <View style={[s.section, neuCard(c)]}>
      <View style={s.sectionHeader}>
        <Ionicons name="notifications-outline" size={20} color={c.primary} />
        <Text style={[s.sectionTitle, { color: c.primaryDark }]}>Notification Preferences</Text>
      </View>
      {/* Asks the OS only after the user opts in; renders nothing once granted. */}
      <PushPermissionPrompt />
      {loadState === 'loading' && <ActivityIndicator accessibilityLabel="Loading notification preferences" color={c.primary} />}
      {loadState === 'failed' && (
        <View accessibilityRole="alert">
          <Text style={{ color: c.text }}>Could not load notification preferences.</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry notification preferences" onPress={() => void load()}>
            <Text style={[s.retryText, { color: c.primary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
      {loadState === 'ready' && prefs && notificationPrefs.map((pref, i) => (
        <View key={pref.key} style={[s.notifRow, i < notificationPrefs.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border + '40' }]}>
          <View style={[s.notifIcon, { backgroundColor: prefs[pref.key] ? c.primary + '14' : c.surface }]}>
            <Ionicons name={pref.icon} size={16} color={prefs[pref.key] ? c.primary : c.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.notifLabel, { color: c.primaryDark }]}>{pref.label}</Text>
            <Text style={[s.notifDesc, { color: c.muted }]}>{pref.desc}</Text>
          </View>
          <Switch
            accessibilityLabel={pref.label}
            value={prefs[pref.key]}
            disabled={saving}
            onValueChange={(value) => void save({ key: pref.key, value })}
            trackColor={{ false: c.border, true: c.primary + '60' }}
            thumbColor={prefs[pref.key] ? c.primary : '#f4f3f4'}
          />
        </View>
      ))}
      {failed && (
        <View accessibilityRole="alert">
          <Text style={{ color: c.text, marginTop: spacing.sm }}>Could not save notification preference.</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry saving preference" disabled={saving} onPress={() => void save(failed)}>
            <Text style={[s.retryText, { color: c.primary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
      {saved && <Text accessibilityLiveRegion="polite" style={{ color: c.text, marginTop: spacing.sm }}>Notification preference saved.</Text>}
    </View>
  )
}

function useMounted() {
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  return mounted
}

/* ─── Shared Components ─── */

function Field({ label, value, onChangeText, c, ...props }: {
  label: string; value: string; onChangeText: (t: string) => void; c: ReturnType<typeof useThemeColors>
} & Partial<React.ComponentProps<typeof TextInput>>) {
  return (
    <>
      <Text style={[s.fieldLabel, { color: c.text }]}>{label}</Text>
      <TextInput
        style={[s.input, neuInset(c), { color: c.text }]}
        placeholderTextColor={c.muted}
        value={value}
        onChangeText={onChangeText}
        {...props}
      />
    </>
  )
}

function ActionButton({ label, icon, loading, onPress, bg }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; loading: boolean; onPress: () => void; bg: string
}) {
  return (
    <TouchableOpacity style={[s.saveBtn, { backgroundColor: bg }, loading && s.saveBtnDisabled]} onPress={onPress} disabled={loading} activeOpacity={0.85}>
      {loading ? <ActivityIndicator color="#ffffff" /> : (
        <>
          <Ionicons name={icon} size={18} color="#ffffff" />
          <Text style={s.saveBtnText}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabBarInner: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 10 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  tabLabel: { fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  scroll: { padding: spacing.md },
  section: { padding: spacing.lg, marginBottom: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Outfit_600SemiBold', marginBottom: 6, marginTop: spacing.md },
  input: { paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 14, fontFamily: 'Outfit_500Medium' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 16, marginTop: spacing.lg },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#ffffff' },
  // Theme
  optionGrid: { flexDirection: 'row', gap: 10 },
  themeCard: { flex: 1, alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 2, paddingVertical: 16, paddingHorizontal: 8, position: 'relative' },
  checkBadge: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  themeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  themeLabel: { fontSize: 13, fontFamily: 'Outfit_700Bold' },
  themeDesc: { fontSize: 10, fontFamily: 'Outfit_400Regular', textAlign: 'center' },
  // Notifications
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  notifIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  notifLabel: { fontSize: 14, fontFamily: 'Outfit_600SemiBold' },
  notifDesc: { fontSize: 11, fontFamily: 'Outfit_400Regular', marginTop: 1 },
  retryText: { fontFamily: 'Outfit_600SemiBold', paddingVertical: spacing.sm },
  // Biometric
  bioRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bioRowTitle: { fontSize: 14, fontFamily: 'Outfit_700Bold' },
  bioRowDesc: { fontSize: 12, fontFamily: 'Outfit_400Regular', marginTop: 2 },
  manageDevicesBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: spacing.md, marginTop: spacing.md },
  manageDevicesText: { flex: 1, fontSize: 14, fontFamily: 'Outfit_600SemiBold' },
})
