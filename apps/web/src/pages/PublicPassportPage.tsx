import { useParams } from 'react-router-dom'
import {
  Award,
  ShieldCheck,
  Download,
  Briefcase,
  CreditCard,
  Users,
  Building2,
  TrendingUp,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useSharedPassport } from '@/hooks/useApi'
import { LogoWatermark } from '@/components/ui/Watermark'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export function PublicPassportPage() {
  const { token = '' } = useParams<{ token: string }>()
  const { data, isLoading, isError, error } = useSharedPassport(token)

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 dark:bg-[#252a3a] rounded-2xl" />
          <div className="h-40 bg-gray-200 dark:bg-[#252a3a] rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-32 bg-gray-200 dark:bg-[#252a3a] rounded-2xl" />
            <div className="h-32 bg-gray-200 dark:bg-[#252a3a] rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
        <Card>
          <CardContent className="py-10 text-center">
            <AlertCircle size={32} className="mx-auto text-red-500 mb-3" />
            <h2 className="text-lg font-bold text-primary-dark dark:text-white mb-1">
              Passport Unavailable
            </h2>
            <p className="text-sm text-muted">
              {error instanceof Error ? error.message : 'This share link is invalid or has expired.'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const downloadUrl = `${API_BASE}/tenant-passport/shared/${token}/pdf`

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Hero banner */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-[#1e3a5f] via-[#22467a] to-[#2d5a8e] text-white">
        <LogoWatermark tone="brand" className="-bottom-16 -right-6 size-56 rotate-[-8deg]" />
        <div className="relative z-10 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="rounded-xl bg-white/15 p-2.5">
              <Award size={22} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-blue-200 font-semibold">
                Tenant Financial Passport
              </p>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                {data.user
                  ? `${data.user.firstName} ${data.user.lastName}`
                  : 'Verified Tenant'}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {data.user?.isVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                    <ShieldCheck size={12} /> Ghana Card Verified
                  </span>
                )}
                {data.creditScore && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Credit Score {data.creditScore.score}/100
                  </span>
                )}
                {data.user?.memberSince && (
                  <span className="text-[11px] text-blue-100">
                    Member since{' '}
                    {new Date(data.user.memberSince).toLocaleDateString('en-GB', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download>
            <Button variant="secondary" size="md">
              <Download size={16} />
              Download PDF
            </Button>
          </a>
        </div>
      </Card>

      {/* Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp size={16} className="text-primary dark:text-blue-400" /> Credit Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.creditScore ? (
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
            <EmptyState preset="general" title="No credit score on record yet" description="This tenant has no credit score on record." compact />
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
            <Stat label="Lifetime Payments" value={String(data.payments.total)} />
            <Stat label="Completed" value={String(data.payments.completed)} />
            <Stat label="On-Time %" value={`${data.payments.onTimePct}%`} />
            <Stat
              label="Lifetime Total"
              value={`GHS ${data.payments.lifetimeTotalGhs.toLocaleString()}`}
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
            <Stat label="Active" value={String(data.agreements.active)} />
            <Stat label="Past" value={String(data.agreements.past)} />
            <Stat
              label="Eviction History"
              value={data.agreements.noEvictionHistory ? 'None' : 'Disclosed'}
            />
            <Stat label="On-Time Ratio" value={`${data.agreements.onTimePaymentRatio}%`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase size={16} className="text-primary dark:text-blue-400" /> Employment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {data.employment ? (
              <>
                <Stat label="Employer" value={data.employment.employer || 'Not disclosed'} />
                <Stat label="Tenure" value={data.employment.tenure || 'Not disclosed'} />
                <Stat
                  label="Salary Band"
                  value={data.employment.salaryBand || 'Not disclosed'}
                />
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
            <Stat label="Profile Completeness" value={`${data.profile.completionScore}%`} />
            <Stat label="Personal References" value={String(data.references.personal)} />
            <Stat
              label="Professional References"
              value={String(data.references.professional)}
            />
            {data.streak && (
              <>
                <Stat label="Current Streak" value={`${data.streak.current} months`} />
                <Stat label="Longest Streak" value={`${data.streak.longest} months`} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="text-center pt-4">
        <p className="text-[11px] text-muted max-w-2xl mx-auto">
          This passport is generated from RentOS records. Information is self-attested unless verified.
          Issuance does not constitute a guarantee of tenancy and is not legal advice.
        </p>
        <p className="text-[11px] text-muted mt-1">
          Generated by RentOS Ghana •{' '}
          {new Date(data.generatedAt).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </p>
      </div>
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
