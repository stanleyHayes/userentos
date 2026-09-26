import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileCheck2, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { ensureLiveAccessToken, useAuthStore } from '@/stores/authStore'
import { useCurrentUser } from '@/hooks/useApi'
import { Button } from '@/components/ui/Button'
import { ConsentCheckbox } from './ConsentCheckbox'
import { buildAcceptance, type UserConsents } from '../../../../../packages/shared/legalVersions'

/**
 * Re-prompt for acceptance when the server says the stored Terms/Privacy
 * versions are out of date (a new version was published, or the account
 * predates consent capture). Deliberately a persistent banner rather than a
 * blocking modal: a tenant must still be able to pay rent or read an
 * agreement, and the notice stays until they accept.
 */
export function ConsentBanner() {
  const queryClient = useQueryClient()
  const storedUser = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)
  const { data: me } = useCurrentUser()
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const user = me ?? storedUser
  if (!user || user.suspendedAt || user.consentRequired !== true) return null

  async function accept() {
    setSaving(true)
    setError('')
    try {
      await ensureLiveAccessToken()
      const result = await api.post<{ consents: UserConsents; consentRequired: boolean }>('/auth/consents', buildAcceptance())
      updateUser({ consents: result.consents, consentRequired: result.consentRequired })
      queryClient.setQueryData(['me'], (prev: typeof me) => (prev ? { ...prev, consents: result.consents, consentRequired: result.consentRequired } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your acceptance. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section role="region" aria-label="Updated terms" className="m-4 rounded-2xl border border-primary/20 bg-white/90 p-4 shadow-sm dark:border-blue-400/20 dark:bg-[#161927]/90">
      <div className="flex items-start gap-3">
        <FileCheck2 size={18} className="mt-0.5 shrink-0 text-primary dark:text-blue-400" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-bold text-primary-dark dark:text-white">Please review our Terms of Service and Privacy Policy</p>
            <p className="mt-1 text-xs leading-relaxed text-muted dark:text-gray-400">
              {user.consents
                ? 'We have updated these documents since you last accepted them.'
                : 'We need your acceptance on record to continue providing your account.'}
            </p>
          </div>
          <ConsentCheckbox checked={checked} onChange={setChecked} disabled={saving} />
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          <Button type="button" size="sm" disabled={!checked || saving} onClick={() => void accept()}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Accept and continue'}
          </Button>
        </div>
      </div>
    </section>
  )
}
