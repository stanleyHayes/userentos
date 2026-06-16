import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, ArrowRight, Loader2, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setStatus('loading')
    try {
      await api.post('/auth/forgot-password', { email })
      setStatus('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      setStatus('idle')
    }
  }

  if (status === 'sent') {
    return (
      <div className="text-center animate-scale-in">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 dark:bg-accent/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={32} className="text-accent" />
        </div>
        <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white">Check your email</h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-3 leading-relaxed max-w-xs mx-auto">
          If <strong className="text-primary-dark dark:text-white">{email}</strong> is registered, we've sent a password reset link. Check your inbox and spam folder.
        </p>
        <div className="mt-8 space-y-3">
          <button onClick={() => { setStatus('idle'); setEmail('') }} className="text-sm text-primary dark:text-blue-400 font-semibold hover:underline">
            Try a different email
          </button>
          <div>
            <Link to="/login" className="text-sm text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8 animate-fade-up">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white mb-6 transition-colors">
          <ArrowLeft size={16} /> Back to sign in
        </Link>
        <h1 className="text-3xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
          Forgot password?
        </h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-2">
          Enter your email and we'll send you a reset link.
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
          <TextField
            id="email"
            label="Email address"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            slotProps={{
              inputLabel: { shrink: true },
              input: { startAdornment: <InputAdornment position="start"><Mail size={18} className="text-gray-400" /></InputAdornment> },
            }}
          />
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <Button type="submit" disabled={status === 'loading'} size="lg" className="w-full">
            {status === 'loading' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>Send Reset Link <ArrowRight size={16} /></>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
