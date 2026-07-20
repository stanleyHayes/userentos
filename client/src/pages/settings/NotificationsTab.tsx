import { Card, CardContent } from '@/components/ui/Card'
import { useSettings, useUpdateSettings } from '@/hooks/useApi'
import { Bell, Mail, Phone, CreditCard, ChevronRight } from 'lucide-react'

const notificationPrefs = [
  { key: 'email', label: 'Email Notifications', desc: 'Receive updates via email', icon: <Mail size={16} /> },
  { key: 'sms', label: 'SMS Notifications', desc: 'Get text message alerts', icon: <Phone size={16} /> },
  { key: 'push', label: 'Push Notifications', desc: 'Browser push alerts', icon: <Bell size={16} /> },
  { key: 'payment', label: 'Payment Reminders', desc: 'Rent due date reminders', icon: <CreditCard size={16} /> },
  { key: 'savings', label: 'Savings Alerts', desc: 'Goal progress & milestones', icon: <ChevronRight size={16} /> },
]

export function NotificationsTab() {
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()

  // Derive from the server (defaults fill keys the server has never stored) so
  // toggles start from the user's real saved prefs; the update invalidates the
  // settings query, re-rendering with the new values.
  const prefs: Record<string, boolean> = {
    ...Object.fromEntries(notificationPrefs.map((p) => [p.key, true])),
    ...((settings?.notifications ?? {}) as Record<string, boolean>),
  }

  function toggle(key: string) {
    const updated = { ...prefs, [key]: !prefs[key] }
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
