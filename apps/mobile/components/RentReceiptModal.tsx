import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, ScrollView, Share, Text, TouchableOpacity, View } from 'react-native'
import { api } from '../lib/api'
import { rentReceiptText, type RentReceiptCopy } from '../lib/rentReceipt'
import { useThemeColors, spacing } from '../lib/theme'
import { useAuthStore } from '../stores/authStore'

export function RentReceiptModal({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const c = useThemeColors()
  const version = useAuthStore(s => s.sessionVersion)
  const request = useRef<AbortController | null>(null)
  const [state, setState] = useState<{ version: number; loading?: boolean; text?: string; error?: string }>({ version })
  const current = state.version === version ? state : { version }
  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setState({ version, loading: true })
    const timeout = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort()
        setState({ version, error: 'The receipt request timed out. Please try again.' })
      }
    }, 20_000)
    try {
      const copy = await api.post<RentReceiptCopy>(`/payments/${encodeURIComponent(paymentId)}/receipt`, {}, { signal: controller.signal })
      if (!controller.signal.aborted && useAuthStore.getState().sessionVersion === version) {
        setState({ version, text: rentReceiptText(copy, new Date().toISOString()) })
      }
    } catch (failure) {
      if (!controller.signal.aborted) setState({ version, error: failure instanceof Error ? failure.message : 'Could not retrieve the receipt.' })
    } finally { clearTimeout(timeout) }
  }, [version, paymentId])
  useEffect(() => { void load(); return () => request.current?.abort() }, [load])
  async function share() {
    if (!current.text || useAuthStore.getState().sessionVersion !== version) return
    try { await Share.share({ title: 'Rent payment receipt', message: current.text }) }
    catch { setState(previous => ({ ...previous, error: 'Could not open sharing. Please try again.' })) }
  }
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: c.surface, padding: spacing.lg, paddingTop: 60 }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close receipt" onPress={onClose} style={{ padding: spacing.md }}><Text style={{ color: c.primary }}>Close receipt</Text></TouchableOpacity>
      <Text accessibilityRole="header" style={{ color: c.text, fontSize: 24, fontFamily: 'Outfit_600SemiBold', marginBottom: spacing.md }}>Rent payment receipt</Text>
      <TouchableOpacity accessibilityRole="button" disabled={current.loading} onPress={() => void load()} style={{ padding: spacing.md, backgroundColor: c.primary, borderRadius: 12 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>{current.loading ? 'Loading receipt…' : current.text ? 'Refresh receipt status' : 'Load receipt'}</Text>
      </TouchableOpacity>
      {!!current.error && <Text accessibilityRole="alert" style={{ color: c.danger, marginVertical: spacing.md }}>{current.error}</Text>}
      {!!current.text && <>
        <TouchableOpacity accessibilityRole="button" onPress={() => void share()} style={{ padding: spacing.md }}><Text style={{ color: c.primary, textAlign: 'center' }}>Share receipt</Text></TouchableOpacity>
        <Text style={{ color: c.muted, marginBottom: spacing.md }}>Sharing includes tenant, landlord and premises details. Choose where to send the copy.</Text>
        <ScrollView><Text selectable style={{ color: c.text, fontSize: 16, lineHeight: 24 }}>{current.text}</Text></ScrollView>
      </>}
    </View>
  </Modal>
}
