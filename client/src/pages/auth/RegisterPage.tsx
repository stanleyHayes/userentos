import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import type { UserRole, User as UserType } from '@/types'
import { User, Mail, Phone, ArrowRight, Loader2, Home, Building2, Briefcase, Banknote, Users as UsersIcon, Wrench, Check } from 'lucide-react'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { DoodleSpiral } from '@/components/ui/Doodles'
import { passwordRequirements } from '@/pages/settings/passwordStrength'

// 'essential_worker' is a registration-only choice, not an auth role: it signs the
// user up with a tenant base account and routes them to the worker-profile setup.
type RoleOption = UserRole | 'essential_worker'

const roles: { value: RoleOption; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'tenant', label: 'Tenant', icon: <Home size={20} />, desc: 'Find & rent properties' },
  { value: 'landlord', label: 'Landlord', icon: <Building2 size={20} />, desc: 'List & manage properties' },
  { value: 'property_manager', label: 'Manager', icon: <Briefcase size={20} />, desc: 'Manage for landlords' },
  { value: 'financier', label: 'Financier', icon: <Banknote size={20} />, desc: 'Lend rent advance & deposit loans' },
  { value: 'employer', label: 'Employer', icon: <UsersIcon size={20} />, desc: 'Run payroll deductions for employees' },
  { value: 'essential_worker', label: 'Essential Worker', icon: <Wrench size={20} />, desc: 'Offer trade & repair services' },
]

export function RegisterPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
    role: 'tenant' as RoleOption,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Essential Worker isn't a server role — register a tenant base account, then
      // send them to complete their worker profile.
      const isWorker = form.role === 'essential_worker'
      const data = await api.post<{ user: UserType; token: string; refreshToken: string }>('/auth/register', {
        ...form,
        role: isWorker ? 'tenant' : form.role,
      })
      // AuthLayout redirects authenticated users away from auth pages; hand it the
      // worker-setup destination so login() below doesn't bounce us to /dashboard.
      if (isWorker) sessionStorage.setItem('postAuthRedirect', '/workers/join')
      login(data.user, data.token, data.refreshToken)
      navigate(isWorker ? '/workers/join' : '/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6 animate-fade-up relative">
        <h1 className="text-3xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">
          Create your account
        </h1>
        <DoodleSpiral className="absolute -top-2 -right-2 text-primary/10 dark:text-blue-400/10 w-14 h-14 pointer-events-none" />
        <p className="text-sm text-muted dark:text-gray-400 mt-2">Join RentOS Ghana today</p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-danger/10 border border-danger/20 p-4 text-sm text-danger flex items-center gap-2 animate-scale-in">
          <div className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Role selector */}
        <div className="animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">I am a...</label>
          <div className="grid grid-cols-3 gap-2">
            {roles.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, role: r.value }))}
                className={`rounded-xl border-2 p-3 flex flex-col items-center justify-center transition-all ${
                  form.role === r.value
                    ? 'border-primary dark:border-blue-500 bg-primary/5 dark:bg-blue-500/10 scale-[1.02] shadow-md shadow-primary/10'
                    : 'border-border dark:border-[#252a3a] hover:border-primary/30 dark:hover:border-blue-500/30'
                }`}
              >
                <div className={`mb-1.5 ${form.role === r.value ? 'text-primary dark:text-blue-400' : 'text-muted dark:text-gray-500'}`}>
                  {r.icon}
                </div>
                <p className={`text-xs font-bold ${form.role === r.value ? 'text-primary dark:text-blue-400' : 'text-primary-dark dark:text-gray-300'}`}>{r.label}</p>
                <p className="text-[10px] text-muted dark:text-gray-500 mt-0.5">{r.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="grid grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <TextField id="firstName" label="First Name" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required fullWidth placeholder="Kwame" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><User size={18} className="text-gray-400" /></InputAdornment> } }} />
          <TextField id="lastName" label="Last Name" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required fullWidth placeholder="Asante" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><User size={18} className="text-gray-400" /></InputAdornment> } }} />
        </div>

        {/* Email */}
        <div className="animate-fade-up" style={{ animationDelay: '0.15s' }}>
          <TextField id="email" label="Email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required fullWidth placeholder="you@example.com" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><Mail size={18} className="text-gray-400" /></InputAdornment> } }} />
        </div>

        {/* Phone */}
        <div className="animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <TextField id="phone" label="Phone" type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} required fullWidth placeholder="024 XXX XXXX" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><Phone size={18} className="text-gray-400" /></InputAdornment> } }} />
        </div>

        {/* Password */}
        <div className="animate-fade-up" style={{ animationDelay: '0.25s' }}>
          <PasswordInput id="password" label="Password" value={form.password} onChange={(e) => update('password', e.target.value)} required minLength={8} placeholder="Min 8 characters" />
          {/* Same checklist the security settings enforce — weak passwords must
              not be creatable here and rejected there later. */}
          {form.password.length > 0 && (
            <ul className="mt-2 space-y-1">
              {passwordRequirements.map((req) => {
                const met = req.test(form.password)
                return (
                  <li key={req.key} className={`flex items-center gap-1.5 text-xs ${met ? 'text-emerald-500' : 'text-muted dark:text-gray-500'}`}>
                    <Check size={12} className={met ? 'opacity-100' : 'opacity-30'} />
                    {req.label}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Submit */}
        <div className="animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <Button type="submit" disabled={loading || !passwordRequirements.every((r) => r.test(form.password))} size="lg" className="w-full">
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>Create Account <ArrowRight size={16} /></>
            )}
          </Button>
        </div>
      </form>

      <div className="animate-fade-up" style={{ animationDelay: '0.35s' }}>
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border dark:bg-[#252a3a]" />
          <span className="text-xs text-muted dark:text-gray-500">or</span>
          <div className="flex-1 h-px bg-border dark:bg-[#252a3a]" />
        </div>

        <p className="text-center text-sm text-muted dark:text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="text-primary dark:text-blue-400 font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
