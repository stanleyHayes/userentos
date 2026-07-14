import { useState, type FormEvent } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Shield, Check, Copy, ShieldCheck, LogOut } from 'lucide-react'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { passwordRequirements, getPasswordStrength } from './passwordStrength'

export function SecurityTab() {
  const { logout, user, updateUser } = useAuthStore()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [logoutAllStatus, setLogoutAllStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  const strength = getPasswordStrength(form.newPassword)
  const allRequirementsMet = passwordRequirements.every((r) => r.test(form.newPassword))
  const passwordsMatch = form.newPassword === form.confirmPassword && form.confirmPassword.length > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (form.newPassword !== form.confirmPassword) { setErrorMsg('Passwords do not match'); setStatus('error'); return }
    if (!allRequirementsMet) { setErrorMsg('Please meet all password requirements'); setStatus('error'); return }

    setStatus('loading')
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword })
      setStatus('success')
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to change password')
      setStatus('error')
    }
  }

  async function handleLogoutAll() {
    setLogoutAllStatus('loading')
    try {
      await api.post('/auth/logout-all', {})
      setLogoutAllStatus('success')
      // Give the user a moment to see the success message, then log them out
      setTimeout(() => logout(), 1500)
    } catch {
      setLogoutAllStatus('idle')
    }
  }

  return (
    <div className="space-y-5">
    <Card>
      <CardContent>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-blue-500/15 flex items-center justify-center">
            <Shield size={20} className="text-primary dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-primary-dark dark:text-white">Change Password</h3>
            <p className="text-xs text-muted dark:text-gray-500 mt-0.5">Update your password to keep your account secure</p>
          </div>
        </div>

        {/* Success animation overlay */}
        {status === 'success' && (
          <div className="mb-6 rounded-xl border-2 border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center animate-bounce">
                <ShieldCheck size={20} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Password Updated Successfully!</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">Your account is now secured with the new password.</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Current password */}
          <div>
            <PasswordInput
              id="currentPassword"
              label="Current Password"
              value={form.currentPassword}
              onChange={(e) => { setForm((f) => ({ ...f, currentPassword: e.target.value })); setStatus('idle') }}
              required
              placeholder="Enter your current password"
            />
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/40 dark:border-[#252a3a]/40" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-[#161927] px-3 text-muted dark:text-gray-500 font-medium">New Password</span>
            </div>
          </div>

          {/* New password with strength indicator */}
          <div className="space-y-3">
            <PasswordInput
              id="newPassword"
              label="New Password"
              value={form.newPassword}
              onChange={(e) => { setForm((f) => ({ ...f, newPassword: e.target.value })); setStatus('idle') }}
              required
              minLength={8}
              placeholder="Create a strong password"
            />

            {/* Strength meter */}
            {form.newPassword.length > 0 && (
              <div className="space-y-2 animate-fade-up">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted dark:text-gray-500">Password strength</span>
                  <span className={`text-xs font-semibold ${strength.color}`}>{strength.label}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-[#0c0e1a] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${strength.barColor}`}
                    style={{ width: `${strength.score}%` }}
                  />
                </div>

                {/* Requirements checklist */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                  {passwordRequirements.map((req) => {
                    const met = req.test(form.newPassword)
                    return (
                      <div key={req.key} className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300 ${
                          met
                            ? 'bg-emerald-500 scale-100'
                            : 'bg-gray-200 dark:bg-[#252a3a] scale-90'
                        }`}>
                          {met && <Check size={10} className="text-white" />}
                        </div>
                        <span className={`text-xs transition-colors duration-300 ${
                          met
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-muted dark:text-gray-500'
                        }`}>
                          {req.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-2">
            <PasswordInput
              id="confirmPassword"
              label="Confirm New Password"
              value={form.confirmPassword}
              onChange={(e) => { setForm((f) => ({ ...f, confirmPassword: e.target.value })); setStatus('idle') }}
              required
              placeholder="Re-enter your new password"
            />
            {form.confirmPassword.length > 0 && (
              <div className="flex items-center gap-2 animate-fade-up">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300 ${
                  passwordsMatch ? 'bg-emerald-500' : 'bg-red-500'
                }`}>
                  {passwordsMatch ? <Check size={10} className="text-white" /> : (
                    <span className="text-white text-[10px] font-bold">&times;</span>
                  )}
                </div>
                <span className={`text-xs font-medium ${
                  passwordsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                }`}>
                  {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                </span>
              </div>
            )}
          </div>

          {/* Error message */}
          {status === 'error' && (
            <div className="rounded-xl bg-danger/10 border border-danger/20 p-3.5 text-sm text-danger flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-danger/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold">&times;</span>
              </div>
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-[11px] text-muted dark:text-gray-500 hidden sm:block">
              You will need to sign in again after changing your password.
            </p>
            <Button
              type="submit"
              disabled={status === 'loading' || !allRequirementsMet || !passwordsMatch || !form.currentPassword}
            >
              {status === 'loading' ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Updating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Shield size={14} />
                  Update Password
                </span>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    {/* Two-factor authentication (MFA) */}
    <MfaCard enabled={!!user?.mfaEnabled} onChange={(enabled) => updateUser({ mfaEnabled: enabled })} />

    {/* Log out all devices */}
    <Card>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-danger/10 dark:bg-danger/15 text-danger flex items-center justify-center shrink-0">
              <LogOut size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-primary-dark dark:text-white">Log out all devices</h3>
              <p className="text-xs text-muted dark:text-gray-500 mt-0.5">
                End all active sessions across all browsers and devices. You will need to sign in again.
              </p>
              {logoutAllStatus === 'success' && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">All sessions ended. Logging you out...</p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-danger border-danger hover:bg-danger/10"
            onClick={handleLogoutAll}
            disabled={logoutAllStatus !== 'idle'}
          >
            {logoutAllStatus === 'loading' ? 'Ending sessions...' : 'Log out all'}
          </Button>
        </div>
      </CardContent>
    </Card>
    </div>
  )
}

/* ─── MFA (TOTP) Card ─── */

function MfaCard({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null)
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [copied, setCopied] = useState(false)

  async function startSetup() {
    setStatus('loading')
    setErrorMsg('')
    try {
      const data = await api.post<{ secret: string; qrDataUrl: string }>('/auth/mfa/setup', {})
      setSetup(data)
      setStatus('idle')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start MFA setup')
      setStatus('error')
    }
  }

  async function handleEnable(e: FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')
    try {
      await api.post('/auth/mfa/enable', { code })
      onChange(true)
      setSetup(null)
      setCode('')
      setStatus('idle')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Verification failed')
      setStatus('error')
    }
  }

  async function handleDisable(e: FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')
    try {
      await api.post('/auth/mfa/disable', { code })
      onChange(false)
      setCode('')
      setStatus('idle')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Verification failed')
      setStatus('error')
    }
  }

  function copySecret() {
    if (!setup) return
    navigator.clipboard.writeText(setup.secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${enabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400'}`}>
            <ShieldCheck size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-primary-dark dark:text-white">Two-Factor Authentication</h3>
              <Badge variant={enabled ? 'success' : 'default'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
            </div>
            <p className="text-xs text-muted dark:text-gray-500 mt-0.5">
              Require a code from an authenticator app (Google Authenticator, Authy, 1Password) at login.
            </p>
          </div>
        </div>

        {status === 'error' && (
          <div className="mb-4 rounded-xl bg-danger/10 border border-danger/20 p-3 text-sm text-danger">{errorMsg}</div>
        )}

        {/* Enabled — allow disabling with a current code */}
        {enabled && (
          <form onSubmit={handleDisable} className="flex flex-col sm:flex-row items-end gap-3">
            <div className="flex-1 w-full">
              <Input
                id="mfa-disable-code"
                label="Confirm with authenticator code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
            <Button type="submit" variant="outline" className="text-danger border-danger hover:bg-danger/10" disabled={status === 'loading' || code.length !== 6}>
              Disable 2FA
            </Button>
          </form>
        )}

        {/* Not enabled, setup not started */}
        {!enabled && !setup && (
          <Button onClick={startSetup} disabled={status === 'loading'}>
            {status === 'loading' ? 'Preparing...' : 'Enable two-factor authentication'}
          </Button>
        )}

        {/* Setup in progress — QR + manual key + confirm code */}
        {!enabled && setup && (
          <div className="space-y-4 animate-fade-up">
            <ol className="space-y-3 text-sm text-muted dark:text-gray-400">
              <li className="flex gap-2"><span className="font-bold text-primary dark:text-blue-400">1.</span> Scan this QR code with your authenticator app:</li>
            </ol>
            <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
              <img src={setup.qrDataUrl} alt="MFA setup QR code" className="w-44 h-44 rounded-xl border border-border/40 dark:border-[#252a3a]/40 bg-white p-2" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs text-muted dark:text-gray-500">Can't scan? Enter this key manually:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg bg-surface dark:bg-[#0c0e1a] border border-border/40 dark:border-[#252a3a]/40 px-3 py-2 text-xs font-mono text-primary-dark dark:text-gray-300 tracking-wider">
                    {setup.secret}
                  </code>
                  <button type="button" onClick={copySecret} className="shrink-0 p-2 rounded-lg hover:bg-surface dark:hover:bg-white/5 text-muted dark:text-gray-400" aria-label="Copy secret key">
                    {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            </div>
            <form onSubmit={handleEnable} className="space-y-3">
              <p className="text-sm text-muted dark:text-gray-400"><span className="font-bold text-primary dark:text-blue-400">2.</span> Enter the 6-digit code shown in the app to confirm:</p>
              <div className="flex flex-col sm:flex-row items-end gap-3">
                <div className="flex-1 w-full">
                  <Input
                    id="mfa-enable-code"
                    label="Authentication code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => { setSetup(null); setCode(''); setStatus('idle') }}>Cancel</Button>
                  <Button type="submit" disabled={status === 'loading' || code.length !== 6}>
                    {status === 'loading' ? 'Verifying...' : 'Verify & enable'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
