import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import type { UserRole, User as UserType } from '@/types'
import { ArrowLeft, ArrowRight, Loader2, Users, Lock, Briefcase, Check, Sparkles } from 'lucide-react'
import { DoodleSpiral } from '@/components/ui/Doodles'
import { passwordRequirements } from '@/pages/settings/passwordStrength'
import { phoneDigits } from '@/lib/ghana'
import toast from 'react-hot-toast'
import { RoleStep } from './steps/RoleStep'
import { AccountStep } from './steps/AccountStep'
import { RoleDetailsStep } from './steps/RoleDetailsStep'
import { emptyRoleDetails, type AccountForm, type RoleDetails } from './steps/types'
import { ConsentCheckbox } from '@/components/legal/ConsentCheckbox'
import { buildAcceptance } from '../../../../../packages/shared/legalVersions'
import type { ProfessionalType } from '../../../../../packages/shared/productScope'

const ROLE_STEP = { label: 'Account type', icon: <Users size={16} /> }
const ACCOUNT_STEP = { label: 'Your details', icon: <Lock size={16} /> }
const DETAILS_STEP = { label: 'Profile', icon: <Briefcase size={16} /> }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Sign-up asks only for what an account needs. Tenants and agents go straight
 * in (agents finish their business profile and website in onboarding); the
 * profile step survives only for account types an operator may reopen whose
 * profile is created at sign-up. Plans are chosen later — the API assigns the
 * free default plan to a new agent.
 */
const DETAILS_ROLES: UserRole[] = ['service_provider', 'business', 'employer', 'financier']

/** Where a new account lands: agents set up their business; tenants start finding a home. */
function landingFor(role: UserRole): string {
  if (role === 'property_manager') return '/onboarding'
  if (role === 'tenant') return '/properties'
  return '/dashboard'
}

/**
 * Best-effort persistence of the profile step, run after registration and
 * login. Throws on failure — the caller catches and toasts, so a failure here
 * never blocks the user from entering the app. Financier details are
 * informational: no endpoint accepts them today.
 */
async function persistRoleProfile(role: UserRole, account: AccountForm, details: RoleDetails): Promise<void> {
  switch (role) {
    case 'service_provider': {
      await api.post('/workers', {
        name: `${account.firstName} ${account.lastName}`.trim(),
        phone: phoneDigits(account.phone),
        email: account.email,
        trades: details.trades,
        location: details.location.trim(),
        serviceRadiusKm: Number(details.serviceRadiusKm) > 0 ? Number(details.serviceRadiusKm) : 10,
        ...(details.hourlyRate && Number(details.hourlyRate) > 0 ? { hourlyRate: Number(details.hourlyRate) } : {}),
        ...(details.bio.trim() ? { bio: details.bio.trim() } : {}),
      })
      break
    }
    case 'employer': {
      // Server requires legalName ≥2, tin ≥5, and an address object — skip the
      // call entirely when name/TIN are missing; the dashboard nudges completion.
      const legalName = details.legalName.trim()
      const tin = details.tin.trim()
      if (legalName.length >= 2 && tin.length >= 5) {
        const cityRegion = details.cityRegion.trim()
        await api.post('/employers/me', {
          legalName,
          tin,
          ...(details.tradingName.trim() ? { tradingName: details.tradingName.trim() } : {}),
          ...(details.industry.trim() ? { industry: details.industry.trim() } : {}),
          address: {
            street: details.businessAddress.trim(),
            city: cityRegion,
            region: cityRegion,
          },
          contactEmail: account.email,
          contactPhone: phoneDigits(account.phone),
        })
      }
      break
    }
    case 'business': {
      // Server requires name ≥2, phone ≥7, and a city — the wizard step already
      // enforces name/city; the dashboard offers full profile setup otherwise.
      const name = details.businessName.trim()
      const city = details.businessCity.trim()
      if (name.length >= 2 && city) {
        await api.post('/businesses/me', {
          name,
          category: details.businessCategory,
          phone: phoneDigits(account.phone),
          email: account.email.trim(),
          city,
          ...(details.businessDescription.trim() ? { description: details.businessDescription.trim() } : {}),
        })
      }
      break
    }
    default:
      break
  }
}

export function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const login = useAuthStore((s) => s.login)

  const [step, setStep] = useState(0)
  const [role, setRole] = useState<UserRole>('tenant')
  const [professionalType, setProfessionalType] = useState<ProfessionalType>('agent')
  const [account, setAccount] = useState<AccountForm>({
    firstName: '', lastName: '', email: '', phone: '', password: '',
  })
  const [details, setDetails] = useState<RoleDetails>(emptyRoleDetails)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [consented, setConsented] = useState(false)

  const hasDetailsStep = DETAILS_ROLES.includes(role)
  const steps = hasDetailsStep ? [ROLE_STEP, ACCOUNT_STEP, DETAILS_STEP] : [ROLE_STEP, ACCOUNT_STEP]
  const lastStep = steps.length - 1

  // Invitations issued before the accept screen existed pointed here as
  // /register?invite=<token>. Self-service signup can't honour the invited role,
  // so hand those links to the accept flow instead.
  const legacyInviteToken = searchParams.get('invite')

  function updateAccount(field: keyof AccountForm, value: string) {
    setAccount((prev) => ({ ...prev, [field]: value }))
  }

  function updateDetails(field: keyof RoleDetails, value: string) {
    setDetails((prev) => ({ ...prev, [field]: value }))
  }

  function toggleTrade(trade: string) {
    setDetails((prev) => ({
      ...prev,
      trades: prev.trades.includes(trade) ? prev.trades.filter((t) => t !== trade) : [...prev.trades, trade],
    }))
  }

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return !!role
      case 1:
        return !!(
          account.firstName.trim() &&
          account.lastName.trim() &&
          EMAIL_RE.test(account.email.trim()) &&
          phoneDigits(account.phone).length >= 10 &&
          passwordRequirements.every((r) => r.test(account.password))
        )
      case 2:
        // Service providers need trades + location — they create the worker profile.
        if (role === 'service_provider') return details.trades.length >= 1 && !!details.location.trim()
        // Businesses need name + city — they create the public business profile.
        if (role === 'business') return details.businessName.trim().length >= 2 && !!details.businessCity.trim()
        return true
      default:
        return true
    }
  }

  /** Register, then (for the reopenable account types) save the profile step. */
  async function finish() {
    if (!consented) {
      setError('Please confirm you are 18 or older and accept the Terms of Service and Privacy Policy')
      return
    }
    setError('')
    setLoading(true)
    let auth: { user: UserType; token: string; refreshToken: string }
    try {
      auth = await api.post<{ user: UserType; token: string; refreshToken: string }>('/auth/register', {
        ...account,
        email: account.email.trim(),
        phone: phoneDigits(account.phone),
        role,
        ...(role === 'property_manager' ? { professionalType } : {}),
        acceptance: buildAcceptance(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
      setLoading(false)
      return
    }

    // AuthLayout redirects as soon as the session exists, so the destination is
    // set first. A tenant who signed up from a listing goes back to it.
    const dest = landingFor(role)
    try {
      if (role !== 'tenant' || !sessionStorage.getItem('postAuthRedirect')) sessionStorage.setItem('postAuthRedirect', dest)
    } catch { /* storage blocked: AuthLayout falls back to the dashboard */ }
    login(auth.user, auth.token, auth.refreshToken)

    if (hasDetailsStep) {
      // Best-effort; failure must not strand the user here.
      try {
        await persistRoleProfile(role, account, details)
      } catch (err) {
        toast.error(`Account created, but your ${role.replace('_', ' ')} profile could not be saved — you can complete it later. ${err instanceof Error ? err.message : ''}`)
      }
    }
    navigate(dest)
  }

  if (legacyInviteToken) {
    return <Navigate to={`/accept-invite?token=${encodeURIComponent(legacyInviteToken)}`} replace />
  }

  return (
    <div>
      <div className="mb-6 animate-fade-up relative">
        <div className="mb-4 flex items-center gap-3">
          <span className="neumorphic-icon flex h-11 w-11 items-center justify-center rounded-2xl text-secondary"><Sparkles size={19} /></span>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/55 dark:text-cyan-300/60">Create your RentOS identity</p>
        </div>
        <h1 className="text-4xl font-extrabold font-display text-primary-dark dark:text-white tracking-[-0.035em]">
          Create your account
        </h1>
        <DoodleSpiral className="absolute -top-2 -right-2 text-primary/10 dark:text-blue-400/10 w-14 h-14 pointer-events-none" />
        <p className="text-sm text-muted dark:text-gray-400 mt-2">Join RentOS Ghana today</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-4 animate-fade-up" style={{ animationDelay: '0.05s' }}>
        {steps.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => i < step && setStep(i)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              i === step
                ? 'bg-primary dark:bg-blue-600 text-white'
                : i < step
                  ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400 cursor-pointer'
                  : 'text-muted dark:text-gray-500'
            }`}
          >
            {i < step ? <Check size={14} /> : s.icon}
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-danger/10 border border-danger/20 p-4 text-sm text-danger flex items-center gap-2 animate-scale-in">
          <div className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
          {error}
        </div>
      )}

      <div key={step} className="auth-step-enter">
        {step === 0 && <RoleStep value={role} onChange={setRole} professionalType={professionalType} onProfessionalTypeChange={setProfessionalType} />}
        {step === 1 && <AccountStep form={account} update={updateAccount} />}
        {step === 2 && hasDetailsStep && <RoleDetailsStep role={role} details={details} update={updateDetails} toggleTrade={toggleTrade} />}

        {step === lastStep && (
          <div className="mt-5">
            <ConsentCheckbox checked={consented} onChange={setConsented} disabled={loading} />
          </div>
        )}

        {/* Navigation */}
        <div className="auth-nav-rail mt-5 flex items-center gap-2.5 rounded-2xl p-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            className="auth-back-button h-9 shrink-0 whitespace-nowrap px-3.5"
            onClick={() => (step === 0 ? navigate('/login') : setStep(step - 1))}
          >
            <ArrowLeft size={14} /> Back
          </Button>

          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
            {step < lastStep ? (
              <Button type="button" size="lg" className="auth-primary-action min-w-0 flex-1 whitespace-nowrap px-5 sm:min-w-44 sm:flex-none" onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                Continue <ArrowRight size={14} />
              </Button>
            ) : (
              <Button type="button" size="lg" className="auth-primary-action min-w-0 flex-1 whitespace-nowrap px-5 sm:min-w-48 sm:flex-none" disabled={loading || !consented || !canProceed()} onClick={() => void finish()}>
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>Create account <ArrowRight size={16} /></>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

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
