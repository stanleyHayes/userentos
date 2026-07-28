import type { UserRole } from '@/types'
import { Home, Building2, Briefcase, Banknote, Users as UsersIcon, Wrench, Store } from 'lucide-react'

const roles: { value: UserRole; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'tenant', label: 'Tenant', icon: <Home size={20} />, desc: 'Find & rent properties' },
  { value: 'landlord', label: 'Landlord', icon: <Building2 size={20} />, desc: 'List & manage properties' },
  { value: 'property_manager', label: 'Manager / Agent', icon: <Briefcase size={20} />, desc: 'Manage properties & close deals for owners' },
  { value: 'service_provider', label: 'Service Provider', icon: <Wrench size={20} />, desc: 'Offer trade, repair & home services' },
  { value: 'financier', label: 'Financier', icon: <Banknote size={20} />, desc: 'Lend rent advance & deposit loans' },
  { value: 'employer', label: 'Employer', icon: <UsersIcon size={20} />, desc: 'Run payroll deductions for employees' },
  { value: 'business', label: 'Local Business', icon: <Store size={20} />, desc: 'Advertise products & services to renters' },
]

export function RoleStep({ value, onChange }: { value: UserRole; onChange: (role: UserRole) => void }) {
  return (
    <div className="animate-fade-up" style={{ animationDelay: '0.05s' }}>
      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">I am a...</label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {roles.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => onChange(r.value)}
            className={`min-h-[104px] rounded-2xl border p-3 flex flex-col items-center justify-center transition-all ${
              value === r.value
                ? 'border-primary/35 bg-primary/8 text-primary shadow-[inset_3px_3px_8px_rgba(30,58,95,0.12)] dark:border-cyan-300/30 dark:bg-cyan-300/8 dark:text-cyan-300'
                : 'neumorphic-icon border-border/70 hover:-translate-y-0.5 hover:border-primary/25 dark:hover:border-cyan-300/25'
            }`}
          >
            <div className={`mb-1.5 ${value === r.value ? 'text-primary dark:text-blue-400' : 'text-muted dark:text-gray-500'}`}>
              {r.icon}
            </div>
            <p className={`text-xs font-bold ${value === r.value ? 'text-primary dark:text-blue-400' : 'text-primary-dark dark:text-gray-300'}`}>{r.label}</p>
            <p className="text-[10px] text-muted dark:text-gray-500 mt-0.5">{r.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
