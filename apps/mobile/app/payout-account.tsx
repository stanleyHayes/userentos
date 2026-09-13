import { useEffect, useState } from 'react'
import { ScrollView, View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native'
import { api } from '../lib/api'
import { useThemeColors, spacing } from '../lib/theme'

type Destination = { type: 'mobile_money' | 'ghipss'; code: string; name: string }
type Account = { type: Destination['type']; bankCode: string; bankName: string; accountNumber: string; accountName: string; verified: boolean }
const emptyForm = { type: 'mobile_money' as Destination['type'], bankCode: '', accountNumber: '', accountName: '' }
function validAccount(value: Account | null): boolean {
  return value === null || Boolean(value && ['mobile_money', 'ghipss'].includes(value.type) && typeof value.bankCode === 'string' && typeof value.bankName === 'string' && typeof value.accountName === 'string' && typeof value.accountNumber === 'string' && typeof value.verified === 'boolean')
}

export default function PayoutAccountScreen() {
  const c = useThemeColors()
  const [account, setAccount] = useState<Account | null>(null)
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    setLoading(true); setLoadError(false)
    Promise.all([api.get<Account | null>('/payouts/account'), api.get<{ items: Destination[] }>('/payouts/destinations')]).then(([saved, list]) => {
      if (!validAccount(saved) || !Array.isArray(list?.items) || list.items.some(d => !d || !['mobile_money', 'ghipss'].includes(d.type) || typeof d.code !== 'string' || typeof d.name !== 'string')) throw new Error('Incomplete payout data')
      if (!cancelled) { setAccount(saved); setDestinations(list.items) }
    }).catch(() => { if (!cancelled) setLoadError(true) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [retry])
  const canSave = !loading && !loadError && !busy && destinations.some(d => d.type === form.type && d.code === form.bankCode) && form.accountNumber.trim().length >= 6 && form.accountNumber.trim().length <= 24 && form.accountName.trim().length >= 2 && form.accountName.trim().length <= 120
  async function save() {
    if (!canSave) return
    setBusy(true); setMessage('')
    try {
      const saved = await api.put<Account>('/payouts/account', { ...form, accountNumber: form.accountNumber.trim(), accountName: form.accountName.trim() })
      if (!saved || !validAccount(saved) || !saved.verified) throw new Error('Verification was not confirmed. Retry loading your payout account.')
      setAccount(saved); setEditing(false); setForm(emptyForm); setMessage('Payout account verified and saved.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not verify your payout account.') } finally { setBusy(false) }
  }
  async function remove() {
    if (busy) return
    setBusy(true); setMessage('')
    try { await api.delete('/payouts/account'); setAccount(null); setForm(emptyForm); setEditing(false); setRemoving(false); setMessage('Payout account removed.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not remove your payout account.') } finally { setBusy(false) }
  }
  function button(label: string, onPress: () => void, disabled = false) {
    return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ padding: 14, borderRadius: 10, backgroundColor: c.primary, opacity: disabled ? 0.45 : 1 }}><Text style={{ color: '#fff', textAlign: 'center' }}>{label}</Text></TouchableOpacity>
  }
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
    <Text style={{ color: c.text, fontSize: 22 }}>Payout account</Text>
    <Text style={{ color: c.muted }}>Withdrawals are sent to your saved verified account. Check the destination carefully before saving.</Text>
    {message !== '' && <Text accessibilityRole="alert" style={{ color: c.text }}>{message}</Text>}
    {loading ? <ActivityIndicator accessibilityLabel="Loading payout account" color={c.primary} /> : loadError ? <View style={{ gap: spacing.md }}><Text accessibilityRole="alert" style={{ color: c.danger }}>Could not load payout account details.</Text>{button('Retry payout account', () => setRetry(value => value + 1))}</View> : account && !editing ? <View style={{ gap: spacing.md }}>
      <Text style={{ color: c.text }}>{account.accountName}</Text><Text style={{ color: c.text }}>{account.bankName} · {account.accountNumber}</Text><Text style={{ color: c.text }}>{account.verified ? 'Verified' : 'Not verified'}</Text>
      {button('Change account', () => { setForm({ type: account.type, bankCode: account.bankCode, accountNumber: account.accountNumber, accountName: account.accountName }); setEditing(true); setRemoving(false); setMessage('') }, busy)}
      {removing ? <><Text style={{ color: c.text }}>Remove this payout account? You cannot withdraw until you add another. Existing payouts keep their original destination.</Text>{button('Confirm removal', () => void remove(), busy)}{button('Keep account', () => setRemoving(false), busy)}</> : button('Remove account', () => setRemoving(true), busy)}
    </View> : <View style={{ gap: spacing.md }}>
      <Text style={{ color: c.text }}>Payout to</Text>
      {(['mobile_money', 'ghipss'] as const).map(type => <View key={type}>{button(`${form.type === type ? '✓ ' : ''}${type === 'mobile_money' ? 'Mobile money' : 'Bank account'}`, () => setForm(value => ({ ...value, type, bankCode: '' })), busy)}</View>)}
      <Text style={{ color: c.text }}>Choose a network or bank</Text>
      {destinations.filter(d => d.type === form.type).map(d => <View key={d.code}>{button(`${form.bankCode === d.code ? '✓ ' : ''}${d.name}`, () => setForm(value => ({ ...value, bankCode: d.code })), busy)}</View>)}
      {!destinations.some(d => d.type === form.type) && <Text style={{ color: c.muted }}>No destinations are available for this account type.</Text>}
      <Text style={{ color: c.text }}>Account or mobile money number</Text>
      <TextInput accessibilityLabel="Payout account number" keyboardType="phone-pad" editable={!busy} maxLength={24} value={form.accountNumber} onChangeText={accountNumber => setForm(value => ({ ...value, accountNumber }))} style={{ borderWidth: 1, borderColor: c.muted, color: c.text, padding: 14, borderRadius: 10 }} />
      <Text style={{ color: c.text }}>Account name</Text>
      <TextInput accessibilityLabel="Payout account name" editable={!busy} maxLength={120} value={form.accountName} onChangeText={accountName => setForm(value => ({ ...value, accountName }))} style={{ borderWidth: 1, borderColor: c.muted, color: c.text, padding: 14, borderRadius: 10 }} />
      <Text style={{ color: c.muted }}>Your provider verifies this account before it is saved.</Text>
      {button(busy ? 'Verifying…' : 'Verify and save', () => void save(), !canSave)}
      {account && button('Cancel changes', () => { setEditing(false); setForm(emptyForm) }, busy)}
    </View>}
  </ScrollView>
}
