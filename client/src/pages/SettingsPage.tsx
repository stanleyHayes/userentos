import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { User, Shield, Bell, Palette, Settings, ShieldCheck, Check, Wallet } from 'lucide-react'
import { DoodleStars } from '@/components/ui/Doodles'
import { IconWatermark } from '@/components/ui/Watermark'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ProfileTab } from './settings/ProfileTab'
import { SecurityTab } from './settings/SecurityTab'
import { PayoutTab } from './settings/PayoutTab'
import { AppearanceTab } from './settings/AppearanceTab'
import { NotificationsTab } from './settings/NotificationsTab'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'
import { useCurrentUser, useUpdateProfile } from '@/hooks/useApi'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { formatGhanaCard, GHANA_CARD_RE } from '@/lib/ghana'
import type { User as UserType } from '@/types'

type VerificationStatus = 'none' | 'pending' | 'verified'
// GET /users/me includes these account-review fields; keep the local extension
// until the public shared User contract intentionally exposes them.
type MeUser = UserType & { verificationStatus?: VerificationStatus; taxReportingConsent?: boolean }

const tabs = [
  { id: 'profile', label: 'Profile', icon: <User size={16} /> },
  { id: 'security', label: 'Security', icon: <Shield size={16} /> },
  { id: 'payouts', label: 'Payouts', icon: <Wallet size={16} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
] as const

type TabId = (typeof tabs)[number]['id']

export function SettingsPage() {
  const activeRole = useAuthStore((state) => state.user?.activeRole)
  const [searchParams] = useSearchParams()
  const initialTab = tabs.some((t) => t.id === searchParams.get('tab')) ? (searchParams.get('tab') as TabId) : 'profile'
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const { attach: pillAttach, style: pillStyle, visible: pillVisible } = useSlidingIndicator<HTMLDivElement>(activeTab)

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden">
        <DoodleStars className="absolute -top-1 -right-1 text-primary/10 dark:text-blue-400/10 w-12 h-12 pointer-events-none" />
        <IconWatermark icon={Settings} className="right-10 top-1/2 size-28 -translate-y-1/2 rotate-[-8deg]" />
        <h1 className="text-2xl font-extrabold font-display text-primary-dark dark:text-white tracking-tight">Settings</h1>
        <p className="text-sm text-muted dark:text-gray-400 mt-1">Manage your account preferences</p>
      </div>

      {/* Tab navigation */}
      <div ref={pillAttach} className="relative isolate flex gap-1.5 p-1 rounded-full bg-surface dark:bg-[#0c0e1a] border border-border/40 dark:border-[#252a3a]/40 w-fit">
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-white shadow-sm transition-[transform,width,height] duration-300 ease-out dark:bg-[#161927]"
          style={{ ...pillStyle, opacity: pillVisible ? 1 : 0 }}
        />
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-tab-key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative z-10 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'text-primary dark:text-blue-400'
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
        {activeTab === 'profile' && (
          <div className="space-y-5">
            <ProfileTab />
            <IdentityVerificationCard />
            {activeRole === 'service_provider' && <ProviderPortfolioCard />}
            {activeRole === 'landlord' && <TaxConsentCard />}
          </div>
        )}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'payouts' && <PayoutTab />}
        {activeTab === 'appearance' && <AppearanceTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
      </div>
    </div>
  )
}

function ProviderPortfolioCard() {
  const { data, refetch } = useQuery({
    queryKey: ['worker', 'me', 'portfolio'],
    queryFn: () => api.get<{ worker: { _id: string; portfolio?: string[] } | null }>('/workers/me'),
  })
  const [urls, setUrls] = useState('')
  const worker = data?.worker
  const save = useMutation({
    mutationFn: () => api.patch(`/workers/${worker!._id}`, { portfolio: urls.split('\n').map((value) => value.trim()).filter(Boolean) }),
    onSuccess: () => refetch(),
  })
  if (!worker) return null
  return <Card><CardContent className="space-y-3">
    <h3 className="text-sm font-bold">Work portfolio</h3>
    <p className="text-xs text-muted">Add up to 20 before/after image URLs, one per line.</p>
    <textarea className="neumorphic-inset min-h-28 w-full rounded-xl p-3 text-sm" value={urls || worker.portfolio?.join('\n') || ''} onChange={(event) => setUrls(event.target.value)} />
    <div className="flex justify-end"><Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save portfolio</Button></div>
  </CardContent></Card>
}

function TaxConsentCard() {
  const { data: me } = useCurrentUser()
  const qc = useQueryClient()
  const consent = Boolean((me as MeUser | undefined)?.taxReportingConsent)
  const save = useMutation({
    mutationFn: () => api.patch('/users/me/tax-reporting-consent', { consent: !consent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })
  return <Card><CardContent className="flex items-center justify-between gap-4">
    <div><h3 className="text-sm font-bold">Consented tax reporting</h3><p className="text-xs text-muted">Allow government dashboards to include your aggregated rent income. Tenant and property identities remain excluded.</p></div>
    <Button size="sm" variant={consent ? 'outline' : 'primary'} onClick={() => save.mutate()}>{consent ? 'Consent enabled' : 'Enable consent'}</Button>
  </CardContent></Card>
}

/**
 * Identity Verification — Ghana Card on file + admin-reviewed verification.
 * State comes fresh from GET /users/me (the auth store predates
 * verificationStatus); saving the card or requesting verification refreshes it.
 */
function IdentityVerificationCard() {
  const { user: authUser, updateUser } = useAuthStore()
  const { data: meData } = useCurrentUser()
  const updateProfile = useUpdateProfile()
  const qc = useQueryClient()
  const [ghanaCard, setGhanaCard] = useState('')
  const [cardSaved, setCardSaved] = useState(false)

  const me = (meData ?? authUser) as MeUser | null
  const status: VerificationStatus = me?.verificationStatus ?? (me?.isVerified ? 'verified' : 'none')
  const hasGhanaCard = !!me?.ghanaCardId

  const requestVerification = useMutation({
    mutationFn: () => api.post<{ verificationStatus: VerificationStatus }>('/users/me/request-verification', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })

  async function handleSaveCard() {
    try {
      const updated = await updateProfile.mutateAsync({ ghanaCardId: ghanaCard })
      updateUser(updated)
      setGhanaCard('')
      setCardSaved(true)
    } catch {
      // Error is displayed via mutation.isError
    }
  }

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary dark:text-blue-400" />
            <h3 className="text-sm font-bold text-primary-dark dark:text-white">Identity Verification</h3>
          </div>
          {status === 'verified' && <Badge variant="success">Verified</Badge>}
          {status === 'pending' && <Badge variant="warning">Under review</Badge>}
          {status === 'none' && <Badge variant="muted">Not verified</Badge>}
        </div>

        {!hasGhanaCard && (
          <div className="space-y-4">
            <p className="text-xs text-muted dark:text-gray-400 leading-relaxed">
              Add your Ghana Card ID to request identity verification. A verified badge builds
              trust with landlords and tenants.
            </p>
            <Input
              id="settings-ghana-card"
              label="Ghana Card ID"
              value={ghanaCard}
              onChange={(e) => { setGhanaCard(formatGhanaCard(e.target.value)); setCardSaved(false) }}
              placeholder="GHA-XXXXXXXXX-X"
            />
            {updateProfile.isError && (
              <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{(updateProfile.error as Error).message}</div>
            )}
            {cardSaved && (
              <div className="rounded-xl bg-accent/10 p-3 text-sm text-accent flex items-center gap-2">
                <Check size={14} /> Ghana Card saved — you can now request verification.
              </div>
            )}
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSaveCard}
                disabled={!GHANA_CARD_RE.test(ghanaCard) || updateProfile.isPending}
              >
                {updateProfile.isPending ? 'Saving...' : 'Save Ghana Card'}
              </Button>
            </div>
          </div>
        )}

        {hasGhanaCard && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 px-4 py-3">
              <span className="text-xs text-muted dark:text-gray-400">Ghana Card ID</span>
              <span className="text-sm font-semibold font-mono text-primary-dark dark:text-white">{me?.ghanaCardId}</span>
            </div>

            {status === 'none' && (
              <>
                <p className="text-xs text-muted dark:text-gray-400 leading-relaxed">
                  Your Ghana Card is on file. Request verification and our team will review it.
                </p>
                {requestVerification.isError && (
                  <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{(requestVerification.error as Error).message}</div>
                )}
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => requestVerification.mutate()}
                    disabled={requestVerification.isPending}
                  >
                    {requestVerification.isPending ? 'Requesting...' : 'Request verification'}
                  </Button>
                </div>
              </>
            )}

            {status === 'pending' && (
              <p className="text-xs text-muted dark:text-gray-400 leading-relaxed">
                Your verification request is under review — we'll notify you once our team has checked your Ghana Card.
              </p>
            )}

            {status === 'verified' && (
              <p className="text-xs text-muted dark:text-gray-400 leading-relaxed">
                Your identity is verified. The verified badge is shown on your profile across RentOS.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
