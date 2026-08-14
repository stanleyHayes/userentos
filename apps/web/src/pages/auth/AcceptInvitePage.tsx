import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Loader2, CheckCircle, AlertCircle, Check, X, ShieldCheck } from 'lucide-react'
import TextField from '@mui/material/TextField'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { describeRoles } from '@/lib/roles'
import { phoneDigits } from '@/lib/ghana'
import { passwordRequirements } from '@/pages/settings/passwordStrength'
import type { UserRole } from '@/types'

interface InviteDetails {
  email: string
  roles: UserRole[]
  expiresAt: string
}

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [lookupError, setLookupError] = useState('')
  // Nothing to look up without a token, so start settled rather than spinning.
  const [loadingInvite, setLoadingInvite] = useState(Boolean(token))

  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', password: '', confirm: '' })
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    api.get<InviteDetails>(`/invitations/verify?token=${encodeURIComponent(token)}`)
      .then((data) => { if (!cancelled) setInvite(data) })
      .catch((err) => { if (!cancelled) setLookupError(err instanceof Error ? err.message : 'This invitation could not be verified') })
      .finally(() => { if (!cancelled) setLoadingInvite(false) })
    return () => { cancelled = true }
  }, [token])

  const passwordChecks = passwordRequirements.map((r) => ({ ...r, ok: r.test(form.password) }))
  const passwordValid = passwordChecks.every((c) => c.ok)
  const phoneValid = phoneDigits(form.phone).length >= 10
  const canSubmit = Boolean(
    form.firstName.trim() && form.lastName.trim() && phoneValid && passwordValid && form.password === form.confirm,
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    setError('')
    setStatus('submitting')
    try {
      await api.post('/invitations/accept', {
        token,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: phoneDigits(form.phone),
        password: form.password,
      })
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept this invitation')
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <div className="text-center animate-scale-in">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 dark:bg-accent/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={32} className="text-accent" />
        </div>
        <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">Account ready</h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-3">
          Your {invite ? describeRoles(invite.roles) : ''} account has been created. Sign in with{' '}
          <strong className="text-primary-dark dark:text-white">{invite?.email}</strong>.
        </p>
        <Link to="/login" className="inline-flex items-center justify-center gap-2 mt-6 h-12 px-7 rounded-full bg-gradient-to-r from-[#1e3a5f] to-[#2d5a8e] dark:from-blue-600 dark:to-blue-500 text-white font-semibold text-sm hover:opacity-90 shadow-lg shadow-primary/20 hover:shadow-md hover:-translate-y-[1px] transition-all">
          Sign In <ArrowRight size={16} />
        </Link>
      </div>
    )
  }

  if (loadingInvite) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted dark:text-gray-400">
        <Loader2 size={28} className="animate-spin" />
        <p className="mt-4 text-sm">Checking your invitation...</p>
      </div>
    )
  }

  if (!token || !invite) {
    return (
      <div className="text-center animate-scale-in">
        <div className="w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-6">
          <AlertCircle size={32} className="text-danger" />
        </div>
        <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">Invitation unavailable</h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-3 max-w-xs mx-auto">
          {lookupError || 'This invitation link is missing its token. Ask whoever invited you to send a fresh link.'}
        </p>
        <Link to="/login" className="inline-block mt-6 text-sm text-primary dark:text-blue-400 font-semibold hover:underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 animate-fade-up">
        <h1 className="text-3xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
          Accept your invitation
        </h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-2">
          Set a password to activate your account.
        </p>
      </div>

      <div className="mb-6 rounded-2xl bg-primary/5 dark:bg-blue-500/10 p-4 animate-fade-up">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="text-primary dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-primary-dark dark:text-white">
              You have been invited as {describeRoles(invite.roles)}
            </p>
            <p className="text-muted dark:text-gray-400 mt-1">
              {invite.email} · expires {new Date(invite.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-danger/10 border border-danger/20 p-4 text-sm text-danger flex items-center gap-2 animate-scale-in">
          <div className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <TextField
            id="firstName" label="First Name" size="small" fullWidth required
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            id="lastName" label="Last Name" size="small" fullWidth required
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '0.15s' }}>
          <TextField
            id="phone" label="Phone Number" size="small" fullWidth required
            placeholder="024 123 4567"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            error={Boolean(form.phone) && !phoneValid}
            helperText={form.phone && !phoneValid ? 'Enter a valid Ghanaian phone number' : ' '}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { inputMode: 'tel' } }}
          />
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <PasswordInput
            id="password" label="Password" required minLength={8} placeholder="Choose a strong password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
          {form.password && (
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {passwordChecks.map((c) => (
                <li key={c.key} className={`flex items-center gap-1.5 text-xs ${c.ok ? 'text-accent' : 'text-muted dark:text-gray-500'}`}>
                  {c.ok ? <Check size={13} /> : <X size={13} />}
                  {c.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '0.25s' }}>
          <PasswordInput
            id="confirm" label="Confirm Password" required placeholder="Repeat your password"
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          />
          {form.confirm && form.password !== form.confirm && (
            <p className="mt-2 text-xs text-danger">Passwords do not match</p>
          )}
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <Button type="submit" disabled={!canSubmit || status === 'submitting'} size="lg" className="w-full">
            {status === 'submitting' ? <Loader2 size={18} className="animate-spin" /> : <>Create My Account <ArrowRight size={16} /></>}
          </Button>
        </div>
      </form>
    </div>
  )
}
