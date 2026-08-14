import { useState } from 'react'
import {
  Award,
  ShieldCheck,
  Download,
  Link as LinkIcon,
  Copy,
  CheckCircle2,
  Briefcase,
  CreditCard,
  Users,
  Building2,
  TrendingUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FormSkeleton } from '@/components/ui/Skeleton'
import { LogoWatermark } from '@/components/ui/Watermark'
import { useMyPassportPreview, useGenerateShareLink } from '@/hooks/useApi'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { api } from '@/lib/api'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface ShareEntry {
  url: string
  expiresAt: string
  createdAt: string
}

export function TenantPassportPage() {
  const user = useAuthStore((s) => s.user)
  const isTenant = user?.activeRole === 'tenant'
  const { data, isLoading } = useMyPassportPreview(isTenant)
  const generate = useGenerateShareLink()
  const [shareHistory, setShareHistory] = useState<ShareEntry[]>([])
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  if (!isTenant) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="py-10 text-center">
            <Award size={32} className="mx-auto text-muted mb-3" />
            <h2 className="text-lg font-bold text-primary-dark dark:text-white mb-1">Tenants Only</h2>
            <p className="text-sm text-muted">The Tenant Financial Passport is only available for tenant accounts.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Mint a short-lived, download-only token for the PDF — the session JWT must
  // never appear in a URL (server logs, browser history, referers).
  const handleDownload = async () => {
    setDownloading(true)
    try {
      const { token: downloadToken } = await api.post<{ token: string }>('/tenant-passport/me/document-link', {})
      window.open(`${API_BASE}/tenant-passport/me/pdf?token=${encodeURIComponent(downloadToken)}`, '_blank', 'noopener,noreferrer')
    } finally {
      setDownloading(false)
    }
  }

  const handleGenerateLink = async () => {
    try {
      const res = await generate.mutateAsync()
      const entry: ShareEntry = {
        url: res.url,
        expiresAt: res.expiresAt,
        createdAt: new Date().toISOString(),
      }
      setShareHistory((prev) => [entry, ...prev])
      try {
        await navigator.clipboard.writeText(res.url)
        setCopiedUrl(res.url)
        setTimeout(() => setCopiedUrl(null), 2500)
        useToastStore.getState().addToast('Share link copied to clipboard', 'success')
      } catch {
        useToastStore.getState().addToast('Share link generated', 'success')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate share link'
      useToastStore.getState().addToast(message, 'error')
    }
  }

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(url)
      setTimeout(() => setCopiedUrl(null), 2500)
      useToastStore.getState().addToast('Copied to clipboard', 'success')
    } catch {
      useToastStore.getState().addToast('Could not copy', 'error')
    }
  }

  if (isLoading) return <FormSkeleton fields={6} />

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Hero */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-[#1e3a5f] via-[#22467a] to-[#2d5a8e] text-white">
        <LogoWatermark tone="brand" className="-bottom-16 -right-6 size-56 rotate-[-8deg]" />
        <div className="relative z-10 p-6 sm:p-8">
          <div className="flex items-start gap-3 mb-3">
            <div className="rounded-xl bg-white/15 p-2.5">
              <Award size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                Your Tenant Financial Passport
              </h1>
              <p className="text-sm text-blue-100 mt-1 max-w-2xl">
                A portable record of your rental reputation. Share with future landlords to prove you pay
                on time, save consistently, and follow your agreements. Builds trust beyond a credit score.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-5">
            <Button variant="secondary" size="md" onClick={handleDownload} disabled={downloading}>
              <Download size={16} />
              Download PDF
            </Button>
            <Button
              variant="outline"
              size="md"
              className="!bg-white/10 !border-white/30 !text-white hover:!bg-white/20"
              onClick={handleGenerateLink}
              disabled={generate.isPending}
            >
              <LinkIcon size={16} />
              {generate.isPending ? 'Generating…' : 'Generate Share Link'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Identity */}
      {data?.user && (
        <Card>
          <CardContent className="py-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary-light dark:from-blue-600 dark:to-blue-400 flex items-center justify-center text-white text-lg font-extrabold flex-shrink-0">
                {data.user.firstName?.[0]}
                {data.user.lastName?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-primary-dark dark:text-white">
                    {data.user.firstName} {data.user.lastName}
                  </h2>
                  {data.user.isVerified && (
                    <Badge variant="success" className="gap-1">
                      <ShieldCheck size={12} /> Ghana Card Verified
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted">{data.user.email}</p>
                {data.user.memberSince && (
                  <p className="text-[11px] text-muted">
                    Member since{' '}
                    {new Date(data.user.memberSince).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credit Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp size={16} className="text-primary dark:text-blue-400" /> Credit Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.creditScore ? (
            <div className="flex flex-wrap items-center gap-6">
              <div className="text-center">
                <div className="text-5xl font-extrabold font-display text-primary dark:text-blue-400">
                  {data.creditScore.score}
                </div>
                <div className="text-[11px] text-muted">out of 100</div>
                <Badge variant="default" className="mt-1">
                  {scoreLabel(data.creditScore.score)}
                </Badge>
              </div>
              <div className="flex-1 min-w-[260px] space-y-2">
                {factorRows(data.creditScore.factors)}
              </div>
            </div>
          ) : (
            <EmptyState preset="general" title="No credit score on record yet" description="Your credit score will appear here once you build rental history." compact />
          )}
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard size={16} className="text-primary dark:text-blue-400" /> Payment History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Stat label="Lifetime Payments" value={String(data?.payments.total ?? 0)} />
            <Stat label="Completed" value={String(data?.payments.completed ?? 0)} />
            <Stat label="On-Time %" value={`${data?.payments.onTimePct ?? 0}%`} />
            <Stat
              label="Lifetime Total"
              value={`GHS ${(data?.payments.lifetimeTotalGhs ?? 0).toLocaleString()}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 size={16} className="text-primary dark:text-blue-400" /> Tenancy Agreements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Stat label="Active" value={String(data?.agreements.active ?? 0)} />
            <Stat label="Past" value={String(data?.agreements.past ?? 0)} />
            <Stat
              label="Eviction History"
              value={data?.agreements.noEvictionHistory ? 'None' : 'Disclosed'}
            />
            <Stat label="On-Time Ratio" value={`${data?.agreements.onTimePaymentRatio ?? 0}%`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase size={16} className="text-primary dark:text-blue-400" /> Employment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {data?.employment ? (
              <>
                <Stat label="Employer" value={data.employment.employer || 'Not disclosed'} />
                <Stat label="Tenure" value={data.employment.tenure || 'Not disclosed'} />
                <Stat label="Salary Band" value={data.employment.salaryBand || 'Not disclosed'} />
              </>
            ) : (
              <p className="text-sm text-muted">No employment record on file.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users size={16} className="text-primary dark:text-blue-400" /> Profile & References
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Stat label="Profile Completeness" value={`${data?.profile.completionScore ?? 0}%`} />
            <Stat label="Personal References" value={String(data?.references.personal ?? 0)} />
            <Stat
              label="Professional References"
              value={String(data?.references.professional ?? 0)}
            />
            {data?.streak && (
              <>
                <Stat label="Current Streak" value={`${data.streak.current} months`} />
                <Stat label="Longest Streak" value={`${data.streak.longest} months`} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Share history */}
      {shareHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon size={16} className="text-primary dark:text-blue-400" /> Recent Share Links
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {shareHistory.map((entry) => (
              <div
                key={entry.createdAt}
                className="flex items-center gap-2 rounded-lg border border-border dark:border-[#252a3a] p-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-primary-dark dark:text-white truncate">{entry.url}</p>
                  <p className="text-[10px] text-muted">
                    Expires{' '}
                    {new Date(entry.expiresAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleCopy(entry.url)}>
                  {copiedUrl === entry.url ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-muted text-center">
        Information shown is generated from your RentOS records. Self-attested details are marked unverified
        until validated. RentOS does not guarantee tenancy outcomes.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-semibold text-primary-dark dark:text-white text-sm">{value}</span>
    </div>
  )
}

function factorRows(
  factors: {
    paymentHistory: number
    savingsConsistency: number
    agreementCompliance: number
    disputeRecord: number
    accountAge: number
  } | null,
) {
  if (!factors) return <p className="text-sm text-muted">No factor data available.</p>
  const rows: { label: string; value: number; max: number }[] = [
    { label: 'Payment History', value: factors.paymentHistory, max: 40 },
    { label: 'Savings Discipline', value: factors.savingsConsistency, max: 20 },
    { label: 'Agreement Compliance', value: factors.agreementCompliance, max: 20 },
    { label: 'Dispute Record', value: factors.disputeRecord, max: 10 },
    { label: 'Account Tenure', value: factors.accountAge, max: 10 },
  ]
  return rows.map((r) => (
    <div key={r.label}>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted">{r.label}</span>
        <span className="text-primary-dark dark:text-white font-semibold">
          {r.value}/{r.max}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-[#252a3a] overflow-hidden">
        <div
          className="h-full bg-primary dark:bg-blue-500"
          style={{ width: `${Math.min(100, (r.value / r.max) * 100)}%` }}
        />
      </div>
    </div>
  ))
}

function scoreLabel(score: number) {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Fair'
  return 'Building'
}
