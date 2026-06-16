import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, spacing } from '../lib/theme'
import { api } from '../lib/api'
import { authenticateWithBiometric, getDeviceId } from '../lib/biometric'

interface BiometricDevice {
  id: string
  deviceId: string
  deviceLabel?: string
  lastUsedAt?: string
  expiresAt: string
  createdAt: string
}

function relativeTime(iso?: string): string {
  if (!iso) return 'Never'
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return '—'
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function expiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
  if (days <= 1) return 'Expires today'
  return `Expires in ${days}d`
}

export default function BiometricDevicesScreen() {
  const c = useThemeColors()
  const [devices, setDevices] = useState<BiometricDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [thisDeviceId, setThisDeviceId] = useState<string>('')

  const load = useCallback(async () => {
    try {
      const [data, did] = await Promise.all([
        api.get<{ items: BiometricDevice[]; total: number }>('/auth/biometric/devices'),
        getDeviceId(),
      ])
      setDevices(data.items)
      setThisDeviceId(did)
    } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message ?? 'Could not load devices')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleRevoke(d: BiometricDevice) {
    const isThis = d.deviceId === thisDeviceId
    Alert.alert(
      isThis ? 'Revoke this device?' : `Revoke ${d.deviceLabel ?? 'device'}?`,
      isThis
        ? 'Biometric login will be disabled on THIS device. You will need to sign in with your password and re-enable biometric.'
        : 'That device will need to sign in with a password and re-enable biometric to use it again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            const ok = await authenticateWithBiometric('Confirm revoke')
            if (!ok) return
            setBusyId(d.id)
            try {
              await api.post(`/auth/biometric/devices/${d.id}/revoke`, {})
              setDevices((prev) => prev.filter((x) => x.id !== d.id))
            } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message ?? 'Could not revoke')
    } finally { setBusyId(null) }
          },
        },
      ],
    )
  }

  function handleRevokeAll() {
    if (devices.length === 0) return
    Alert.alert(
      'Revoke ALL devices?',
      'Every device will be signed out of biometric login. Use this if your account may be compromised.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke all',
          style: 'destructive',
          onPress: async () => {
            const ok = await authenticateWithBiometric('Confirm revoke all')
            if (!ok) return
            try {
              await api.post('/auth/biometric/revoke-all', {})
              setDevices([])
              Alert.alert('Done', 'All biometric sessions revoked.')
            } catch (e) {
      const _err = e as { message?: string }
      Alert.alert('Error', (e as { message?: string }).message ?? 'Could not revoke all')
    }
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    )
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={s.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={c.primary} />}
    >
      <View style={s.header}>
        <Ionicons name="phone-portrait-outline" size={20} color={c.primary} />
        <Text style={[s.title, { color: c.primaryDark }]}>Biometric Devices</Text>
      </View>
      <Text style={[s.subtitle, { color: c.muted }]}>
        Devices currently authorized to sign in with fingerprint or face. Revoke any device you don't recognise.
      </Text>

      {devices.length === 0 ? (
        <View style={[s.empty, { backgroundColor: c.white, borderColor: c.border }]}>
          <Ionicons name="finger-print" size={32} color={c.muted} />
          <Text style={[s.emptyTitle, { color: c.primaryDark }]}>No devices enrolled</Text>
          <Text style={[s.emptyDesc, { color: c.muted }]}>
            Enable biometric login on this device from Settings → Security to see it here.
          </Text>
        </View>
      ) : (
        <>
          {devices.map((d) => {
            const isThis = d.deviceId === thisDeviceId
            return (
              <View key={d.id} style={[s.card, { backgroundColor: c.white, borderColor: c.border }]}>
                <View style={s.cardRow}>
                  <View style={[s.icon, { backgroundColor: c.primary + '15' }]}>
                    <Ionicons name="phone-portrait-outline" size={20} color={c.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.labelRow}>
                      <Text style={[s.deviceLabel, { color: c.primaryDark }]}>{d.deviceLabel ?? 'Unknown device'}</Text>
                      {isThis ? (
                        <View style={[s.thisBadge, { backgroundColor: c.primary + '15' }]}>
                          <Text style={[s.thisBadgeText, { color: c.primary }]}>This device</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[s.meta, { color: c.muted }]}>
                      Last used {relativeTime(d.lastUsedAt)} · {expiresIn(d.expiresAt)}
                    </Text>
                    <Text style={[s.deviceIdText, { color: c.muted }]} numberOfLines={1}>
                      ID: {d.deviceId.slice(0, 16)}{d.deviceId.length > 16 ? '…' : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRevoke(d)}
                    disabled={busyId === d.id}
                    style={[s.revokeBtn, { borderColor: c.danger }]}
                  >
                    {busyId === d.id ? (
                      <ActivityIndicator color={c.danger} size="small" />
                    ) : (
                      <Text style={[s.revokeText, { color: c.danger }]}>Revoke</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )
          })}

          <TouchableOpacity
            style={[s.revokeAllBtn, { backgroundColor: c.danger + '12', borderColor: c.danger + '40' }]}
            onPress={handleRevokeAll}
          >
            <Ionicons name="alert-circle-outline" size={18} color={c.danger} />
            <Text style={[s.revokeAllText, { color: c.danger }]}>Revoke all devices</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontFamily: 'Manrope_700Bold' },
  subtitle: { fontSize: 13, fontFamily: 'Manrope_400Regular', marginBottom: spacing.sm },
  empty: { borderWidth: 1, borderRadius: 14, padding: spacing.xl, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  emptyDesc: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
  card: { borderWidth: 1, borderRadius: 14, padding: spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  deviceLabel: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  thisBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  thisBadgeText: { fontSize: 10, fontFamily: 'Manrope_700Bold', textTransform: 'uppercase' },
  meta: { fontSize: 12, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  deviceIdText: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 1 },
  revokeBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  revokeText: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  revokeAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 14, marginTop: spacing.md },
  revokeAllText: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
})
