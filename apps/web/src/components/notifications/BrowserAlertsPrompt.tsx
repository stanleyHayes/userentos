import { useState } from 'react'
import { buttonVariants } from '@/components/ui/buttonVariants'
import { BellRing, X } from 'lucide-react'
import { enableBrowserAlerts, useBrowserAlerts } from '@/lib/browserAlerts'

const DISMISS_KEY = 'rentos:browser-alerts-dismissed'

function dismissedBefore(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

/** "Get an alert when someone messages you": shown on Messages until turned on or dismissed. */
export function BrowserAlertsBanner() {
  const { permission } = useBrowserAlerts()
  const [dismissed, setDismissed] = useState(dismissedBefore)
  const [busy, setBusy] = useState(false)
  if (permission !== 'default' || dismissed) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* private mode */ }
    setDismissed(true)
  }

  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-2.5 text-sm dark:border-blue-400/20 dark:bg-blue-400/10">
      <BellRing size={18} className="flex-shrink-0 text-primary dark:text-blue-300" aria-hidden />
      <p className="min-w-0 flex-1 text-primary-dark dark:text-gray-200">Get a browser alert when someone messages you, even with RentOS in the background.</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => { setBusy(true); await enableBrowserAlerts(); setBusy(false) }}
        className={buttonVariants({ size: 'sm', className: 'flex-shrink-0' })}
      >
        Turn on
      </button>
      <button type="button" onClick={dismiss} aria-label="Not now" className="flex-shrink-0 rounded-md p-1 text-muted hover:bg-primary/10 dark:text-gray-400">
        <X size={14} />
      </button>
    </div>
  )
}

/** The Settings row: this browser's alert state, and the switch on. */
export function BrowserAlertsSetting() {
  const { permission, pushActive } = useBrowserAlerts()
  const [busy, setBusy] = useState(false)
  const status = permission === 'unsupported'
    ? 'This browser does not support notifications.'
    : permission === 'denied'
      ? 'Blocked in your browser settings. Allow notifications for this site to turn them on.'
      : permission === 'granted'
        ? pushActive ? 'On — including when RentOS is closed.' : 'On while RentOS is open in a tab.'
        : 'Off. Turn on to get an alert when someone messages you.'
  return (
    <div className="flex items-center gap-4 py-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${permission === 'granted' ? 'bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-400' : 'bg-surface text-muted dark:bg-[#0c0e1a] dark:text-gray-500'}`}>
        <BellRing size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary-dark dark:text-white">Alerts in this browser</p>
        <p className="text-xs text-muted dark:text-gray-500">{status}</p>
      </div>
      {permission === 'default' && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); await enableBrowserAlerts(); setBusy(false) }}
          className={buttonVariants({ size: 'sm', className: 'shrink-0' })}
        >
          Turn on
        </button>
      )}
    </div>
  )
}
