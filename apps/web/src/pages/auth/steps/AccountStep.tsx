import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import { User, Mail, Phone, Check } from 'lucide-react'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { passwordRequirements } from '@/pages/settings/passwordStrength'
import { formatPhoneGH } from '@/lib/ghana'
import type { AccountForm } from './types'

export function AccountStep({ form, update }: { form: AccountForm; update: (field: keyof AccountForm, value: string) => void }) {
  return (
    <div className="space-y-5">
      {/* Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-up" style={{ animationDelay: '0.05s' }}>
        <TextField id="firstName" label="First Name" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required fullWidth placeholder="Kwame" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><User size={18} className="text-gray-400" /></InputAdornment> } }} />
        <TextField id="lastName" label="Last Name" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required fullWidth placeholder="Asante" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><User size={18} className="text-gray-400" /></InputAdornment> } }} />
      </div>

      {/* Email */}
      <div className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
        <TextField id="email" label="Email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required fullWidth placeholder="you@example.com" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><Mail size={18} className="text-gray-400" /></InputAdornment> } }} />
      </div>

      {/* Phone */}
      <div className="animate-fade-up" style={{ animationDelay: '0.15s' }}>
        <TextField id="phone" label="Phone" type="tel" value={form.phone} onChange={(e) => update('phone', formatPhoneGH(e.target.value))} required fullWidth placeholder="024 412 3456" slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <InputAdornment position="start"><Phone size={18} className="text-gray-400" /></InputAdornment> } }} />
      </div>

      {/* Password */}
      <div className="animate-fade-up" style={{ animationDelay: '0.2s' }}>
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
    </div>
  )
}
