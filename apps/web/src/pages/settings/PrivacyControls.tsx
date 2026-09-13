import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

export function PrivacyControls() {
  const authenticated = useAuthStore(state => state.isAuthenticated)
  const cache = useQueryClient()
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const closed = !authenticated && location.state?.accountClosed === true

  async function exportData() {
    setBusy(true); setMessage('')
    try {
      const data = await api.get('/users/me/export')
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url; link.download = 'rentos-personal-data.json'; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('Your data export has been downloaded. Store it securely; it contains personal information.')
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Export failed. Please try again.') }
    finally { setBusy(false) }
  }

  async function deleteAccount() {
    if (confirmation !== 'DELETE') return
    setBusy(true); setMessage('')
    try {
      await api.delete('/users/me')
      cache.clear()
      // History state survives the session-bound provider remount on logout.
      navigate('/delete-account', { replace: true, state: { accountClosed: true } })
      useAuthStore.getState().logout()
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Deletion failed. Please try again.') }
    finally { setBusy(false) }
  }

  return <Card><CardContent className="space-y-4">
    <h2 className="text-xl font-bold">Your account and personal data</h2>
    {closed ? <p role="status">Your account is closed and core profile erased. Related personal records are scheduled for deletion after 30 days. Records required for legal obligations or disputes may be retained.</p> : <>
      <p>Download your data or permanently close your RentOS account. Closing erases your core profile immediately and schedules related personal records for deletion after 30 days. Financial, agreement and dispute records may be retained for legal obligations. Closing does not settle balances or terminate a tenancy, and cannot be undone.</p>
      {authenticated ? <>
        <Button variant="outline" disabled={busy} onClick={exportData}>Download my data</Button>
        <label className="block space-y-2">
          <span>To permanently delete your account, type DELETE</span>
          <input className="block w-full rounded-lg border border-border bg-transparent p-3" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" disabled={busy} />
        </label>
        <Button variant="danger" disabled={busy || confirmation !== 'DELETE'} onClick={deleteAccount}>{busy ? 'Please wait…' : 'Delete my account'}</Button>
      </> : <Link className="underline" to="/login">Sign in to delete your account or download your data</Link>}
    </>}
    {message && <p role="status">{message}</p>}
    <p><Link className="underline" to="/privacy">Privacy policy</Link> · <Link className="underline" to="/terms">Terms of service</Link></p>
  </CardContent></Card>
}
