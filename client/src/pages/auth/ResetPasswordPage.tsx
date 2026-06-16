import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')


  if (!token) {
    return (
      <div className="text-center animate-scale-in">
        <div className="w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-6">
          <AlertCircle size={32} className="text-danger" />
        </div>
        <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">Invalid Reset Link</h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-3">This password reset link is invalid or has expired.</p>
        <Link to="/forgot-password" className="inline-block mt-6 text-sm text-primary dark:text-blue-400 font-semibold hover:underline">
          Request a new one
        </Link>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="text-center animate-scale-in">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 dark:bg-accent/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={32} className="text-accent" />
        </div>
        <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">Password Reset</h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-3">Your password has been reset successfully.</p>
        <Link to="/login" className="inline-flex items-center justify-center gap-2 mt-6 h-12 px-7 rounded-full bg-gradient-to-r from-[#1e3a5f] to-[#2d5a8e] dark:from-blue-600 dark:to-blue-500 text-white font-semibold text-sm hover:opacity-90 shadow-lg shadow-primary/20 hover:shadow-md hover:-translate-y-[1px] transition-all">
          Sign In <ArrowRight size={16} />
        </Link>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setError('')
    setStatus('loading')
    try {
      await api.post('/auth/reset-password', { token, newPassword: password })
      setStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
      setStatus('error')
    }
  }

  return (
    <div>
      <div className="mb-8 animate-fade-up">
        <h1 className="text-3xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
          Set new password
        </h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-2">
          Choose a strong password for your account.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-danger/10 border border-danger/20 p-4 text-sm text-danger flex items-center gap-2 animate-scale-in">
          <div className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <PasswordInput id="password" label="New Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="Min 8 characters" />
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <PasswordInput id="confirm" label="Confirm Password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required placeholder="Confirm your password" />
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <Button type="submit" disabled={status === 'loading'} size="lg" className="w-full">
            {status === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <>Reset Password <ArrowRight size={16} /></>}
          </Button>
        </div>
      </form>
    </div>
  )
}
