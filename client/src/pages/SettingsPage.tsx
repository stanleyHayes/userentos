import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import { useUpdateProfile, useSettings, useUpdateSettings } from '@/hooks/useApi'
import { api } from '@/lib/api'
import { useThemeStore } from '@/stores/themeStore'
import {
  Sun, Moon, Monitor, User, Shield, Bell, Palette, Globe,
  Check, Copy, ChevronRight, Mail, Phone, CreditCard, Clock,
  ShieldCheck, BadgeCheck, Sparkles, LogOut,
} from 'lucide-react'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { DoodleStars } from '@/components/ui/Doodles'
import { useOnboardingStore } from '@/stores/onboardingStore'

const languages = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'tw', label: 'Twi', native: 'Twi' },
  { code: 'ga', label: 'Ga', native: 'Ga' },
  { code: 'ee', label: 'Ewe', native: 'Ewe' },
]

const tabs = [
  { id: 'profile', label: 'Profile', icon: <User size={16} /> },
  { id: 'security', label: 'Security', icon: <Shield size={16} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
] as const

type TabId = (typeof tabs)[number]['id']

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('profile')

  return (
    <div className="space-y-5">
      <div className="relative">
        <DoodleStars className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
        <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">Settings</h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-1">Manage your account preferences</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1.5 p-1 rounded-full bg-surface dark:bg-[#0c0e1a] border border-border/40 dark:border-[#252a3a]/40 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-[#161927] text-primary dark:text-blue-400 shadow-sm'
                : 'text-muted dark:text-gray-400 hover:text-primary-dark dark:hover:text-white'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="max-w-3xl animate-fade-up">
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'appearance' && <AppearanceTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
      </div>
    </div>
  )
}

/* ─── Profile Tab ─── */

function ProfileTab() {
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


/* ─── Password Strength Helpers ─── */

const passwordRequirements = [
  { key: 'length', label: 'At least 8 characters', test: (pw: string) => pw.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter', test: (pw: string) => /[A-Z]/.test(pw) },
  { key: 'lowercase', label: 'One lowercase letter', test: (pw: string) => /[a-z]/.test(pw) },
  { key: 'number', label: 'One number', test: (pw: string) => /\d/.test(pw) },
  { key: 'special', label: 'One special character (!@#$...)', test: (pw: string) => /[^A-Za-z0-9]/.test(pw) },
]

function getPasswordStrength(pw: string): { score: number; label: string; color: string; barColor: string } {
  if (!pw) return { score: 0, label: '', color: '', barColor: 'bg-gray-200 dark:bg-[#252a3a]' }
  const passed = passwordRequirements.filter((r) => r.test(pw)).length
  if (passed <= 1) return { score: 20, label: 'Weak', color: 'text-red-500', barColor: 'bg-red-500' }
  if (passed <= 2) return { score: 40, label: 'Fair', color: 'text-orange-500', barColor: 'bg-orange-500' }
  if (passed <= 3) return { score: 60, label: 'Good', color: 'text-yellow-500', barColor: 'bg-yellow-500' }
  if (passed <= 4) return { score: 80, label: 'Strong', color: 'text-green-500', barColor: 'bg-green-500' }
  return { score: 100, label: 'Very Strong', color: 'text-emerald-500', barColor: 'bg-emerald-500' }
}

/* ─── Security Tab ─── */

function SecurityTab() {
  const { logout } = useAuthStore()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [logoutAllStatus, setLogoutAllStatus] = useState<'idle' | 'loading' | 'success'>('idle')

  const strength = getPasswordStrength(form.newPassword)
  const allRequirementsMet = passwordRequirements.every((r) => r.test(form.newPassword))
  const passwordsMatch = form.newPassword === form.confirmPassword && form.confirmPassword.length > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (form.newPassword !== form.confirmPassword) { setErrorMsg('Passwords do not match'); setStatus('error'); return }
    if (!allRequirementsMet) { setErrorMsg('Please meet all password requirements'); setStatus('error'); return }

    setStatus('loading')
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword })
      setStatus('success')
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to change password')
      setStatus('error')
    }
  }

  async function handleLogoutAll() {
    setLogoutAllStatus('loading')
    try {
      await api.post('/auth/logout-all', {})
      setLogoutAllStatus('success')
      // Give the user a moment to see the success message, then log them out
      setTimeout(() => logout(), 1500)
    } catch {
      setLogoutAllStatus('idle')
    }
  }

  return (
    <div className="space-y-5">
    <Card>
      <CardContent>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 dark:bg-blue-500/15 flex items-center justify-center">
            <Shield size={20} className="text-primary dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-primary-dark dark:text-white">Change Password</h3>
            <p className="text-xs text-muted dark:text-gray-500 mt-0.5">Update your password to keep your account secure</p>
          </div>
        </div>

        {/* Success animation overlay */}
        {status === 'success' && (
          <div className="mb-6 rounded-xl border-2 border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center animate-bounce">
                <ShieldCheck size={20} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Password Updated Successfully!</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">Your account is now secured with the new password.</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Current password */}
          <div>
            <PasswordInput
              id="currentPassword"
              label="Current Password"
              value={form.currentPassword}
              onChange={(e) => { setForm((f) => ({ ...f, currentPassword: e.target.value })); setStatus('idle') }}
              required
              placeholder="Enter your current password"
            />
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/40 dark:border-[#252a3a]/40" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-[#161927] px-3 text-muted dark:text-gray-500 font-medium">New Password</span>
            </div>
          </div>

          {/* New password with strength indicator */}
          <div className="space-y-3">
            <PasswordInput
              id="newPassword"
              label="New Password"
              value={form.newPassword}
              onChange={(e) => { setForm((f) => ({ ...f, newPassword: e.target.value })); setStatus('idle') }}
              required
              minLength={8}
              placeholder="Create a strong password"
            />

            {/* Strength meter */}
            {form.newPassword.length > 0 && (
              <div className="space-y-2 animate-fade-up">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted dark:text-gray-500">Password strength</span>
                  <span className={`text-xs font-semibold ${strength.color}`}>{strength.label}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-[#0c0e1a] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${strength.barColor}`}
                    style={{ width: `${strength.score}%` }}
                  />
                </div>

                {/* Requirements checklist */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                  {passwordRequirements.map((req) => {
                    const met = req.test(form.newPassword)
                    return (
                      <div key={req.key} className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300 ${
                          met
                            ? 'bg-emerald-500 scale-100'
                            : 'bg-gray-200 dark:bg-[#252a3a] scale-90'
                        }`}>
                          {met && <Check size={10} className="text-white" />}
                        </div>
                        <span className={`text-xs transition-colors duration-300 ${
                          met
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-muted dark:text-gray-500'
                        }`}>
                          {req.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-2">
            <PasswordInput
              id="confirmPassword"
              label="Confirm New Password"
              value={form.confirmPassword}
              onChange={(e) => { setForm((f) => ({ ...f, confirmPassword: e.target.value })); setStatus('idle') }}
              required
              placeholder="Re-enter your new password"
            />
            {form.confirmPassword.length > 0 && (
              <div className="flex items-center gap-2 animate-fade-up">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300 ${
                  passwordsMatch ? 'bg-emerald-500' : 'bg-red-500'
                }`}>
                  {passwordsMatch ? <Check size={10} className="text-white" /> : (
                    <span className="text-white text-[10px] font-bold">&times;</span>
                  )}
                </div>
                <span className={`text-xs font-medium ${
                  passwordsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                }`}>
                  {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                </span>
              </div>
            )}
          </div>

          {/* Error message */}
          {status === 'error' && (
            <div className="rounded-xl bg-danger/10 border border-danger/20 p-3.5 text-sm text-danger flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-danger/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold">&times;</span>
              </div>
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-[11px] text-muted dark:text-gray-500 hidden sm:block">
              You will need to sign in again after changing your password.
            </p>
            <Button
              type="submit"
              disabled={status === 'loading' || !allRequirementsMet || !passwordsMatch || !form.currentPassword}
            >
              {status === 'loading' ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Updating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Shield size={14} />
                  Update Password
                </span>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    {/* Log out all devices */}
    <Card>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-danger/10 dark:bg-danger/15 text-danger flex items-center justify-center shrink-0">
              <LogOut size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-primary-dark dark:text-white">Log out all devices</h3>
              <p className="text-xs text-muted dark:text-gray-500 mt-0.5">
                End all active sessions across all browsers and devices. You will need to sign in again.
              </p>
              {logoutAllStatus === 'success' && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">All sessions ended. Logging you out...</p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-danger border-danger hover:bg-danger/10"
            onClick={handleLogoutAll}
            disabled={logoutAllStatus !== 'idle'}
          >
            {logoutAllStatus === 'loading' ? 'Ending sessions...' : 'Log out all'}
          </Button>
        </div>
      </CardContent>
    </Card>
    </div>
  )
}

/* ─── Appearance Tab ─── */

function AppearanceTab() {
  const { i18n } = useTranslation()
  const { theme, setTheme } = useThemeStore()
  const updateSettings = useUpdateSettings()
  const { user } = useAuthStore()
  const resetTour = useOnboardingStore((s) => s.resetTour)
  const startTour = useOnboardingStore((s) => s.startTour)

  function handleReplayTour() {
    if (!user?.activeRole) return
    resetTour(user.activeRole)
    startTour(user.activeRole)
  }

  const themeOptions = [
    { value: 'light' as const, label: 'Light', desc: 'Clean & bright', icon: <Sun size={20} /> },
    { value: 'dark' as const, label: 'Dark', desc: 'Easy on the eyes', icon: <Moon size={20} /> },
    { value: 'system' as const, label: 'System', desc: 'Match your OS', icon: <Monitor size={20} /> },
  ]

  return (
    <div className="space-y-5">
      {/* Theme */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-2 mb-5">
            <Palette size={16} className="text-primary dark:text-blue-400" />
            <h3 className="text-sm font-bold text-primary-dark dark:text-white">Theme</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setTheme(opt.value); updateSettings.mutate({ theme: opt.value }) }}
                className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                  theme === opt.value
                    ? 'border-primary dark:border-blue-500 bg-primary/5 dark:bg-blue-500/10 shadow-sm'
                    : 'border-border/60 dark:border-[#252a3a]/60 hover:border-primary/40 dark:hover:border-blue-500/40'
                }`}
              >
                {theme === opt.value && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary dark:bg-blue-500 flex items-center justify-center">
                    <Check size={12} className="text-white" />
                  </div>
                )}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  theme === opt.value ? 'bg-primary/15 dark:bg-blue-500/20 text-primary dark:text-blue-400' : 'bg-surface dark:bg-[#0c0e1a] text-muted dark:text-gray-500'
                }`}>
                  {opt.icon}
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-primary-dark dark:text-white">{opt.label}</p>
                  <p className="text-[10px] text-muted dark:text-gray-500 mt-0.5">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Onboarding tour replay */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Sparkles size={16} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-primary-dark dark:text-white">Onboarding tour</h3>
                <p className="text-xs text-muted dark:text-gray-500 mt-0.5">
                  Replay Ama&apos;s walkthrough for your current role.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReplayTour}
              disabled={!user?.activeRole}
            >
              Replay tour
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-2 mb-5">
            <Globe size={16} className="text-primary dark:text-blue-400" />
            <h3 className="text-sm font-bold text-primary-dark dark:text-white">Language</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => { i18n.changeLanguage(lang.code); updateSettings.mutate({ language: lang.code }) }}
                className={`relative flex items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all ${
                  i18n.language === lang.code
                    ? 'border-primary dark:border-blue-500 bg-primary/5 dark:bg-blue-500/10'
                    : 'border-border/60 dark:border-[#252a3a]/60 hover:border-primary/40 dark:hover:border-blue-500/40'
                }`}
              >
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-primary-dark dark:text-white">{lang.label}</p>
                  <p className="text-[10px] text-muted dark:text-gray-500">{lang.native}</p>
                </div>
                {i18n.language === lang.code && (
                  <Check size={16} className="text-primary dark:text-blue-400 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ─── Notifications Tab ─── */

const notificationPrefs = [
  { key: 'email', label: 'Email Notifications', desc: 'Receive updates via email', icon: <Mail size={16} /> },
  { key: 'sms', label: 'SMS Notifications', desc: 'Get text message alerts', icon: <Phone size={16} /> },
  { key: 'push', label: 'Push Notifications', desc: 'Browser push alerts', icon: <Bell size={16} /> },
  { key: 'payment', label: 'Payment Reminders', desc: 'Rent due date reminders', icon: <CreditCard size={16} /> },
  { key: 'savings', label: 'Savings Alerts', desc: 'Goal progress & milestones', icon: <ChevronRight size={16} /> },
]

function NotificationsTab() {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const [prefs, setPrefs] = useState<Record<string, boolean>>(
    Object.fromEntries(notificationPrefs.map((p) => [p.key, true]))
  )

  // Sync from server
  useState(() => {
    if (settings?.notifications) {
      setPrefs(settings.notifications as unknown as Record<string, boolean>)
    }
  })

  function toggle(key: string) {
    const updated = { ...prefs, [key]: !prefs[key] }
    setPrefs(updated)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateSettings.mutate({ notifications: updated as any })
  }

  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-2 mb-5">
          <Bell size={16} className="text-primary dark:text-blue-400" />
          <h3 className="text-sm font-bold text-primary-dark dark:text-white">Notification Preferences</h3>
        </div>
        <div className="divide-y divide-border/30 dark:divide-[#252a3a]/30">
          {notificationPrefs.map((pref) => (
            <label key={pref.key} className="flex items-center gap-4 py-4 cursor-pointer first:pt-0 last:pb-0">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                prefs[pref.key] ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400' : 'bg-surface dark:bg-[#0c0e1a] text-muted dark:text-gray-500'
              }`}>
                {pref.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary-dark dark:text-white">{pref.label}</p>
                <p className="text-xs text-muted dark:text-gray-500">{pref.desc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[pref.key]}
                onClick={() => toggle(pref.key)}
                className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${
                  prefs[pref.key] ? 'bg-primary dark:bg-blue-500' : 'bg-gray-200 dark:bg-[#252a3a]'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  prefs[pref.key] ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
