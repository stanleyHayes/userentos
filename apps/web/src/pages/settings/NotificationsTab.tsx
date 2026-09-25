import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { useSettings, useUpdateSettings } from '@/hooks/useApi'
import { Bell, Mail, Phone, CreditCard, ChevronRight } from 'lucide-react'
import { parseNotificationPreferences, type NotificationPreferenceKey } from '../../../../../packages/shared/notificationPreferences'

const notificationPrefs: { key: NotificationPreferenceKey; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: 'email', label: 'Email Notifications', desc: 'Receive updates via email', icon: <Mail size={16} /> },
  { key: 'sms', label: 'SMS Notifications', desc: 'Get text message alerts', icon: <Phone size={16} /> },
  { key: 'push', label: 'Push Notifications', desc: 'Browser push alerts', icon: <Bell size={16} /> },
  { key: 'payment', label: 'Payment Reminders', desc: 'Rent due date reminders', icon: <CreditCard size={16} /> },
  { key: 'savings', label: 'Savings Alerts', desc: 'Goal progress & milestones', icon: <ChevronRight size={16} /> },
]

type PendingChange = { key: NotificationPreferenceKey; value: boolean }

export function NotificationsTab() {
  const settings = useSettings()
  const updateSettings = useUpdateSettings()
  const [failed, setFailed] = useState<PendingChange | null>(null)
  const [saved, setSaved] = useState(false)
  // Show only a complete saved snapshot; defaults would misrepresent choices the
  // user may already have turned off.
  const prefs = parseNotificationPreferences(settings.data)

  function save(change: PendingChange) {
    setFailed(null)
    setSaved(false)
    // Send only the changed channel so a stale snapshot cannot overwrite another save.
    updateSettings.mutate({ notifications: { [change.key]: change.value } }, {
      onSuccess: () => setSaved(true),
      onError: () => setFailed(change),
    })
  }

  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-2 mb-5">
          <Bell size={16} className="text-primary dark:text-blue-400" />
          <h3 className="text-sm font-bold text-primary-dark dark:text-white">Notification Preferences</h3>
        </div>
        {settings.isPending ? (
          <p className="text-sm text-muted dark:text-gray-400">Loading notification preferences…</p>
        ) : !prefs ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700 dark:text-red-400">
            <span>Could not load notification preferences.</span>
            <button
              type="button"
              aria-label="Retry notification preferences"
              disabled={settings.isFetching}
              onClick={() => { void settings.refetch() }}
              className="font-semibold text-primary dark:text-blue-400 underline disabled:opacity-60"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/30 dark:divide-[#252a3a]/30">
              {notificationPrefs.map((pref) => (
                <div key={pref.key} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    prefs[pref.key] ? 'bg-primary/10 dark:bg-blue-500/15 text-primary dark:text-blue-400' : 'bg-surface dark:bg-[#0c0e1a] text-muted dark:text-gray-500'
                  }`}>
                    {pref.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-primary-dark dark:text-white">{pref.label}</p>
                    <p id={`notification-pref-${pref.key}`} className="text-xs text-muted dark:text-gray-500">{pref.desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label={pref.label}
                    aria-describedby={`notification-pref-${pref.key}`}
                    aria-checked={prefs[pref.key]}
                    disabled={updateSettings.isPending}
                    onClick={() => save({ key: pref.key, value: !prefs[pref.key] })}
                    className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${
                      prefs[pref.key] ? 'bg-primary dark:bg-blue-500' : 'bg-gray-200 dark:bg-[#252a3a]'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      prefs[pref.key] ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
            {failed && (
              <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-red-700 dark:text-red-400">
                <span>Could not save notification preference.</span>
                <button
                  type="button"
                  aria-label="Retry saving preference"
                  disabled={updateSettings.isPending}
                  onClick={() => save(failed)}
                  className="font-semibold text-primary dark:text-blue-400 underline disabled:opacity-60"
                >
                  Retry
                </button>
              </div>
            )}
            {saved && <p role="status" className="mt-4 text-sm text-green-700 dark:text-green-400">Notification preference saved.</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
