import { useState, type FormEvent } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import { useUpdateProfile } from '@/hooks/useApi'
import {
  User, Check, Copy, Mail, CreditCard, Clock,
  ShieldCheck, BadgeCheck,
} from 'lucide-react'

export function ProfileTab() {
  const { user, updateUser } = useAuthStore()
  const updateProfile = useUpdateProfile()
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    ghanaCardId: user?.ghanaCardId ?? '',
  })
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    const updated = await updateProfile.mutateAsync({
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      ghanaCardId: form.ghanaCardId || undefined,
    })
    updateUser(updated)
    setSaved(true)
  }

  function copyId() {
    if (user?.id) {
      navigator.clipboard.writeText(user.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-5">
      {/* Account overview card */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent dark:from-primary/20 dark:via-primary/10 px-5 py-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/15 dark:bg-blue-500/20 flex items-center justify-center text-primary dark:text-blue-400 font-bold text-xl">
              {(user?.firstName?.[0] ?? '').toUpperCase()}{(user?.lastName?.[0] ?? '').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-primary-dark dark:text-white truncate">
                {user?.firstName} {user?.lastName}
              </h2>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-xs text-muted dark:text-gray-400 flex items-center gap-1">
                  <Mail size={12} /> {user?.email}
                </span>
                <Badge variant={user?.isVerified ? 'success' : 'warning'}>
                  {user?.isVerified ? 'Verified' : 'Unverified'}
                </Badge>
              </div>
            </div>
          </div>
        </div>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            {[
              { icon: <CreditCard size={16} />, label: 'User ID', value: user?.id?.slice(0, 8) + '...', color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-500/10 dark:bg-blue-500/15', action: <button onClick={copyId} className="text-muted hover:text-primary dark:hover:text-blue-400 transition-colors"><span>{copied ? <Check size={12} /> : <Copy size={12} />}</span></button> },
              { icon: <ShieldCheck size={16} />, label: 'Active Role', value: user?.activeRole?.replace('_', ' ') ?? '-', color: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-500/10 dark:bg-emerald-500/15', capitalize: true },
              { icon: <BadgeCheck size={16} />, label: 'Roles', value: user?.roles?.join(', ').replace(/_/g, ' ') ?? '-', color: 'text-violet-500 dark:text-violet-400', bg: 'bg-violet-500/10 dark:bg-violet-500/15', capitalize: true },
              { icon: <Clock size={16} />, label: 'Member Since', value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GH', { month: 'short', year: 'numeric' }) : '-', color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-500/10 dark:bg-amber-500/15' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 p-3 flex flex-col items-center text-center gap-2">
                <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center ${item.color}`}>{item.icon}</div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted dark:text-gray-500 uppercase tracking-wider mb-0.5">{item.label}</p>
                  <div className="flex items-center justify-center gap-1">
                    <p className={`text-sm font-semibold text-primary-dark dark:text-white truncate ${item.capitalize ? 'capitalize' : ''}`}>{item.value}</p>
                    {item.action}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit profile form */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-2 mb-5">
            <User size={16} className="text-primary dark:text-blue-400" />
            <h3 className="text-sm font-bold text-primary-dark dark:text-white">Edit Profile</h3>
          </div>
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input id="firstName" label="First Name" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required />
              <Input id="lastName" label="Last Name" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required />
            </div>
            <Input id="email" label="Email" type="email" value={form.email} disabled />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input id="phone" label="Phone" type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} required />
              <Input id="ghanaCard" label="Ghana Card ID" value={form.ghanaCardId} onChange={(e) => update('ghanaCardId', e.target.value)} placeholder="GHA-XXXXXXXXX-X" />
            </div>

            {updateProfile.isError && (
              <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{(updateProfile.error as Error).message}</div>
            )}
            {saved && (
              <div className="rounded-xl bg-accent/10 p-3 text-sm text-accent flex items-center gap-2">
                <Check size={14} /> Profile saved successfully!
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
