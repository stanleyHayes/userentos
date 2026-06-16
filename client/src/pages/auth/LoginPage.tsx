import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/authStore'
import type { User } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Mail, ArrowRight, Loader2 } from 'lucide-react'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { DoodleStars } from '@/components/ui/Doodles'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await api.post<{ user: User; token: string; refreshToken: string }>('/auth/login', { email, password })
      login(data.user, data.token, data.refreshToken)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8 animate-fade-up relative">
        <h1 className="text-3xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
          {t('auth.loginPage.title')}
        </h1>
        <DoodleStars className="absolute -top-2 -right-2 text-primary/10 dark:text-blue-400/10 w-14 h-14 pointer-events-none" />
        <p className="text-sm text-muted dark:text-gray-400 mt-2">{t('auth.loginPage.subtitle')}</p>
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
            label={t('auth.loginPage.emailLabel')}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            slotProps={{
              inputLabel: { shrink: true },
              input: {
                startAdornment: (
                  <InputAdornment position="start"><Mail size={18} className="text-gray-400" /></InputAdornment>
                ),
              },
            }}
          />
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-end mb-1">
            <Link to="/forgot-password" className="text-xs text-primary dark:text-blue-400 hover:underline">{t('auth.loginPage.forgotPassword')}</Link>
          </div>
          <PasswordInput
            id="password"
            label={t('auth.loginPage.passwordLabel')}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <Button type="submit" disabled={loading} size="lg" className="w-full">
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>{t('auth.loginPage.submitBtn')} <ArrowRight size={16} /></>
            )}
          </Button>
        </div>
      </form>

      <div className="animate-fade-up" style={{ animationDelay: '0.4s' }}>
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border dark:bg-[#252a3a]" />
          <span className="text-xs text-muted dark:text-gray-500">or</span>
          <div className="flex-1 h-px bg-border dark:bg-[#252a3a]" />
        </div>

        <p className="text-center text-sm text-muted dark:text-gray-400">
          {t('auth.loginPage.noAccount')}{' '}
          <Link to="/register" className="text-primary dark:text-blue-400 font-semibold hover:underline">
            {t('auth.loginPage.signupLink')}
          </Link>
        </p>
      </div>
    </div>
  )
}
