import type { UserRole } from '@/types'
import { Home, Briefcase, Building2, Banknote, Users as UsersIcon, Wrench, Store, Check, Clock } from 'lucide-react'
import { useRegulatedFeatures, useSignupRoles } from '@/hooks/useApi'
import { isRoleOffered } from '../../../../../../packages/shared/regulatedFeatures'
import { COMING_SOON_ACCOUNT_TYPES, PROFESSIONAL_TYPES, type ProfessionalType } from '../../../../../../packages/shared/productScope'

// The two journeys this phase runs end to end get the large cards.
const PRIMARY: { value: UserRole; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'tenant', label: 'Tenant', icon: <Home size={22} />, desc: 'Find a place to rent, buy or stay, and message agents on RentOS.' },
  { value: 'property_manager', label: 'Agent / Agency / Property Manager', icon: <Briefcase size={22} />, desc: 'List properties, get your own website and handle enquiries in one place.' },
]

// Account types an operator can reopen (SIGNUP_ROLES on the API) without a deploy.
const OTHER: { value: UserRole; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'landlord', label: 'Landlord', icon: <Building2 size={20} />, desc: 'List & manage properties' },
  { value: 'service_provider', label: 'Service Provider', icon: <Wrench size={20} />, desc: 'Offer trade, repair & home services' },
  { value: 'financier', label: 'Financier', icon: <Banknote size={20} />, desc: 'Lend rent advance & deposit loans' },
  { value: 'employer', label: 'Employer', icon: <UsersIcon size={20} />, desc: 'Run payroll deductions for employees' },
  { value: 'business', label: 'Local Business', icon: <Store size={20} />, desc: 'Advertise products & services to renters' },
  { value: 'developer', label: 'Property Developer', icon: <Building2 size={20} />, desc: 'Publish off-plan opportunities' },
]

interface RoleStepProps {
  value: UserRole
  onChange: (role: UserRole) => void
  professionalType: ProfessionalType
  onProfessionalTypeChange: (type: ProfessionalType) => void
}

export function RoleStep({ value, onChange, professionalType, onProfessionalTypeChange }: RoleStepProps) {
  const { data: features } = useRegulatedFeatures()
  const open = useSignupRoles()
  const offered = (role: UserRole) => open.includes(role) && isRoleOffered(role, features ?? null)
  const primary = PRIMARY.filter((r) => offered(r.value))
  const other = OTHER.filter((r) => offered(r.value))

  return (
    <div className="animate-fade-up space-y-4" style={{ animationDelay: '0.05s' }}>
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300" id="account-type-label">How will you use RentOS?</p>
      <div role="radiogroup" aria-labelledby="account-type-label" className="grid grid-cols-1 gap-3">
        {primary.map((r) => {
          const selected = value === r.value
          return (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(r.value)}
              className={`group relative flex items-start gap-4 rounded-2xl border p-4 text-left transition-[transform,border-color,background-color,box-shadow] duration-200 active:scale-[0.99] motion-reduce:transform-none ${
                selected
                  ? 'border-primary/40 bg-primary/8 shadow-[inset_3px_3px_8px_rgba(30,58,95,0.10)] dark:border-cyan-300/35 dark:bg-cyan-300/8'
                  : 'neumorphic-icon border-border/70 hover:-translate-y-0.5 hover:border-primary/25 dark:hover:border-cyan-300/25'
              }`}
            >
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${selected ? 'bg-primary text-white dark:bg-cyan-300 dark:text-[#071018]' : 'bg-surface text-primary dark:bg-white/5 dark:text-cyan-300'}`}>
                {r.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-extrabold ${selected ? 'text-primary dark:text-cyan-200' : 'text-primary-dark dark:text-white'}`}>{r.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted dark:text-gray-400">{r.desc}</span>
              </span>
              <span className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors ${selected ? 'border-primary bg-primary text-white dark:border-cyan-300 dark:bg-cyan-300 dark:text-[#071018]' : 'border-border dark:border-white/20'}`}>
                {selected && <Check size={12} strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>

      {value === 'property_manager' && (
        <div className="animate-fade-up rounded-2xl border border-border/70 bg-surface/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="mb-2 px-1 text-xs font-bold text-primary-dark dark:text-gray-200" id="professional-type-label">Which describes you best?</p>
          <div role="radiogroup" aria-labelledby="professional-type-label" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PROFESSIONAL_TYPES.map((t) => {
              const selected = professionalType === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onProfessionalTypeChange(t.value)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? 'border-primary/40 bg-white text-primary shadow-sm dark:border-cyan-300/35 dark:bg-[#0c1626] dark:text-cyan-200'
                      : 'border-transparent text-primary-dark hover:bg-white/70 dark:text-gray-300 dark:hover:bg-white/5'
                  }`}
                >
                  <span className="block text-xs font-extrabold">{t.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted dark:text-gray-500">{t.description}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {other.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {other.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => onChange(r.value)}
              className={`min-h-[88px] rounded-2xl border p-3 text-center transition-colors ${value === r.value ? 'border-primary/35 bg-primary/8 text-primary dark:border-cyan-300/30 dark:text-cyan-300' : 'neumorphic-icon border-border/70'}`}
            >
              <span className="mx-auto mb-1 block w-fit text-muted dark:text-gray-500">{r.icon}</span>
              <span className="block text-xs font-bold">{r.label}</span>
              <span className="block text-[10px] text-muted dark:text-gray-500">{r.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Visible but not selectable: these journeys are not finished yet. */}
      <div aria-label="Account types coming later" className="rounded-2xl border border-dashed border-border/80 px-4 py-3 dark:border-white/10">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted dark:text-gray-500">
          <Clock size={12} /> Coming later
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {COMING_SOON_ACCOUNT_TYPES.filter((t) => !offered(t.role)).map((t) => (
            <li key={t.role} aria-disabled="true" className="cursor-not-allowed select-none rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted/80 dark:bg-white/5 dark:text-gray-500">
              {t.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
