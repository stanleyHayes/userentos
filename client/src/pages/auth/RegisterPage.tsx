import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { useSubscriptionPackages } from '@/hooks/useApi'
import type { UserRole, User as UserType, SubscriptionPackage } from '@/types'
import { ArrowLeft, ArrowRight, Loader2, Users, Lock, Briefcase, Crown, Check, Sparkles } from 'lucide-react'
import { DoodleSpiral } from '@/components/ui/Doodles'
import { passwordRequirements } from '@/pages/settings/passwordStrength'
import { phoneDigits } from '@/lib/ghana'
import toast from 'react-hot-toast'
import { RoleStep } from './steps/RoleStep'
import { AccountStep } from './steps/AccountStep'
import { RoleDetailsStep } from './steps/RoleDetailsStep'
import { PlanStep } from './steps/PlanStep'
import { emptyRoleDetails, type AccountForm, type RoleDetails } from './steps/types'

const STEPS = [
  { label: 'Role', icon: <Users size={16} /> },
  { label: 'Account', icon: <Lock size={16} /> },
  { label: 'Details', icon: <Briefcase size={16} /> },
  { label: 'Plan', icon: <Crown size={16} /> },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Best-effort persistence of the step-3 role details, run after registration
 * and login. Throws on failure — the caller catches and toasts, so a failure
 * here never blocks the user from entering the app.
 *
 * Not everything is persistable:
 * - landlord: only ghanaCardId is accepted by PATCH /users/me; the rest is
 *   informational.
 * - property_manager / financier: no endpoint accepts these fields today.
 */
async function persistRoleProfile(role: UserRole, account: AccountForm, details: RoleDetails): Promise<void> {
  switch (role) {
    case 'tenant': {
      // GET auto-creates the profile server-side; only PATCH when the user
      // actually entered something, and only keys profilePatchSchema accepts.
      await api.get('/tenant-profile/me')
      const searchPreferences: Record<string, unknown> = {}
      if (details.searchCity.trim()) searchPreferences.preferredCities = [details.searchCity.trim().slice(0, 60)]
      if (details.monthlyBudget && Number(details.monthlyBudget) > 0) searchPreferences.maxBudget = Number(details.monthlyBudget)
      if (details.bedrooms && Number(details.bedrooms) > 0) searchPreferences.minBedrooms = Math.floor(Number(details.bedrooms))
      if (Object.keys(searchPreferences).length > 0) {
        await api.patch('/tenant-profile/me', { searchPreferences })
      }
      break
    }
    case 'landlord': {
      if (details.ghanaCardId.trim()) {
        await api.patch('/users/me', { ghanaCardId: details.ghanaCardId.trim() })
      }
      break
    }
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
      // property_manager & financier details are informational only.
      break
  }
}

/** Plan used when the user skips: the default package, else the cheapest free one. */
function pickFreePackage(packages: SubscriptionPackage[]): SubscriptionPackage | null {
  return (
    packages.find((p) => p.isDefault) ??
    packages.filter((p) => p.price <= 0).sort((a, b) => a.price - b.price)[0] ??
    null
  )
}

export function RegisterPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const { data: packagesData, isLoading: pkgLoading } = useSubscriptionPackages()
  const packages = packagesData?.items ?? []

  const [step, setStep] = useState(0)
  const [role, setRole] = useState<UserRole>('tenant')
  const [account, setAccount] = useState<AccountForm>({
    firstName: '', lastName: '', email: '', phone: '', password: '',
  })
  const [details, setDetails] = useState<RoleDetails>(emptyRoleDetails)
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Free Starter plan is preselected — derived (not synced state) so the user
  // can still override it before packages finish loading.
  const effectivePackageId = selectedPackageId ?? (packages.length > 0 ? (pickFreePackage(packages)?.id ?? packages[0].id) : null)

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

  /** Register, then run the best-effort chain: role profile → subscription. */
  async function finish(skipPlan: boolean) {
    setError('')
    setLoading(true)
    let auth: { user: UserType; token: string; refreshToken: string }
    try {
      auth = await api.post<{ user: UserType; token: string; refreshToken: string }>('/auth/register', {
        ...account,
        email: account.email.trim(),
        phone: phoneDigits(account.phone),
        role,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
      setLoading(false)
      return
    }
    login(auth.user, auth.token, auth.refreshToken)

    // 1) Role profile — best-effort; failure must not strand the user here.
    try {
      await persistRoleProfile(role, account, details)
    } catch (err) {
      toast.error(`Account created, but your ${role.replace('_', ' ')} profile could not be saved — you can complete it later. ${err instanceof Error ? err.message : ''}`)
    }

    // 2) Subscription — free plans activate instantly; paid plans are paid on
    //    the Subscription page (MoMo), never inside the wizard.
    const chosen = skipPlan
      ? pickFreePackage(packages)
      : (packages.find((p) => p.id === effectivePackageId) ?? pickFreePackage(packages))

    let dest = '/dashboard'
    if (chosen && chosen.price > 0 && !skipPlan) {
      dest = '/subscription'
    } else if (chosen) {
      try {
        await api.post('/subscriptions/subscribe', { packageId: chosen.id })
      } catch {
        toast.error('Account created, but plan activation failed — pick a plan from the Subscription page.')
      }
    }

    navigate(dest)
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
        {STEPS.map((s, i) => (
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

      <div>
        {step === 0 && <RoleStep value={role} onChange={setRole} />}
        {step === 1 && <AccountStep form={account} update={updateAccount} />}
        {step === 2 && <RoleDetailsStep role={role} details={details} update={updateDetails} toggleTrade={toggleTrade} />}
        {step === 3 && <PlanStep packages={packages} selectedId={effectivePackageId} onSelect={setSelectedPackageId} isLoading={pkgLoading} />}

        {/* Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-5 animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            className="whitespace-nowrap"
            onClick={() => (step === 0 ? navigate('/login') : setStep(step - 1))}
          >
            <ArrowLeft size={14} /> Back
          </Button>

          <div className="flex flex-wrap items-center gap-3">
            {step === 2 && role !== 'service_provider' && role !== 'business' && (
              <Button type="button" variant="ghost" className="whitespace-nowrap" onClick={() => setStep(3)}>
                Skip for now
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" className="whitespace-nowrap" onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                Continue <ArrowRight size={14} />
              </Button>
            ) : (
              <>
                <Button type="button" variant="ghost" className="whitespace-nowrap" disabled={loading} onClick={() => void finish(true)}>
                  Skip — Starter (free)
                </Button>
                <Button type="button" className="whitespace-nowrap" disabled={loading || pkgLoading} onClick={() => void finish(false)}>
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>Create account <ArrowRight size={16} /></>
                  )}
                </Button>
              </>
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
