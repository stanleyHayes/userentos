import { useMemo, useState, type ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'
import { useInsuranceClaims, useDecideInsuranceClaim, type InsuranceClaimReview } from '@/hooks/useApi'
import { useToastStore } from '@/stores/toastStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { DashboardMetricCard } from '@/components/dashboard/DashboardPrimitives'
import {
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react'

const STATUS_FILTERS: { label: string; value: 'pending' | 'approved' | 'rejected' | 'paid' | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Paid', value: 'paid' },
]

function statusVariant(status: InsuranceClaimReview['status']): 'success' | 'danger' | 'warning' | 'muted' {
  switch (status) {
    case 'approved': return 'success'
    case 'rejected': return 'danger'
    case 'pending': return 'warning'
    case 'paid': return 'muted'
    default: return 'muted'
  }
}

function StatCard({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub: string }) {
  return (
    <DashboardMetricCard
      label={label}
      value={value}
      sub={sub}
      icon={icon}
      accent="#2563eb"
    />
  )
}

function DetailTile({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-surface/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <p className="break-words text-sm font-semibold text-primary-dark dark:text-white">{value}</p>
    </div>
  )
}

export function InsuranceClaimsPage() {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'paid' | 'all'>('pending')
  const [search, setSearch] = useState('')
  const { attach: statusPillAttach, style: statusPillStyle, visible: statusPillVisible } = useSlidingIndicator<HTMLDivElement>(statusFilter)
  const queryParams = useMemo(() => statusFilter === 'all' ? undefined : { status: statusFilter }, [statusFilter])
  const activeClaimsQuery = useInsuranceClaims(queryParams)
  const allClaimsQuery = useInsuranceClaims()
  const decide = useDecideInsuranceClaim()
  const addToast = useToastStore((s) => s.addToast)

  const [decisionDraft, setDecisionDraft] = useState<Record<string, { notes: string; payoutAmount: string }>>({})

  const items = activeClaimsQuery.data?.items ?? []
  const allClaims = allClaimsQuery.data?.items ?? items
  const pendingCount = allClaims.filter((c) => c.status === 'pending').length
  const approvedCount = allClaims.filter((c) => c.status === 'approved').length
  const paidCount = allClaims.filter((c) => c.status === 'paid').length
  const totalClaimed = allClaims.reduce((sum, claim) => sum + claim.amount, 0)
  const paidTotal = allClaims.reduce((sum, claim) => sum + (claim.payoutAmount ?? 0), 0)

  const searchQuery = search.trim().toLowerCase()
  const visibleItems = searchQuery
    ? items.filter((claim) => [
      claim.id,
      claim.policyNumber,
      claim.policyHolderName,
      claim.policyHolderEmail,
      claim.productName,
      claim.providerName,
      claim.category,
      claim.description,
    ].some((value) => value?.toLowerCase().includes(searchQuery)))
    : items

  function getDraft(claimId: string, claim: InsuranceClaimReview) {
    return decisionDraft[claimId] ?? { notes: '', payoutAmount: String(claim.payoutAmount ?? claim.amount) }
  }

  function setDraft(claimId: string, patch: Partial<{ notes: string; payoutAmount: string }>) {
    setDecisionDraft((prev) => {
      const cur = prev[claimId] ?? { notes: '', payoutAmount: '' }
      return { ...prev, [claimId]: { ...cur, ...patch } }
    })
  }

  function decideClaim(claim: InsuranceClaimReview, decision: 'approved' | 'rejected') {
    const draft = getDraft(claim.id, claim)
    const payoutAmount = decision === 'approved'
      ? Number(draft.payoutAmount || claim.amount)
      : undefined
    if (decision === 'approved' && (Number.isNaN(payoutAmount as number) || (payoutAmount as number) < 0)) {
      addToast('Enter a valid payout amount', 'error')
      return
    }
    decide.mutate(
      {
        policyId: claim.policyId,
        claimId: claim.id,
        decision,
        notes: draft.notes || undefined,
        payoutAmount,
      },
      {
        onSuccess: () => {
          addToast(`Claim ${decision}`, decision === 'approved' ? 'success' : 'info')
          setDecisionDraft((prev) => {
            const next = { ...prev }
            delete next[claim.id]
            return next
          })
        },
        onError: (e) => addToast((e as Error).message, 'error'),
      },
    )
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amber-500/12 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
              <ShieldAlert size={26} />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-primary-dark dark:text-white">
                Insurance Claims Review
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                Review policy claims, set payout amounts, and keep decision notes close to the claim record.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="warning" className="px-3 py-1">{pendingCount} pending</Badge>
            <Badge variant="success" className="px-3 py-1">{approvedCount} approved</Badge>
            <Badge variant="muted" className="px-3 py-1">{paidCount} paid</Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Clock3 size={18} />} label="Pending Review" value={String(pendingCount)} sub={`${visibleItems.length} claims in current view`} />
        <StatCard icon={<CheckCircle2 size={18} />} label="Approved" value={String(approvedCount)} sub="Awaiting payout or closure" />
        <StatCard icon={<Banknote size={18} />} label="Claimed Value" value={formatCurrency(totalClaimed)} sub="Across the claims queue" />
        <StatCard icon={<CreditCard size={18} />} label="Paid Out" value={formatCurrency(paidTotal)} sub="Resolved payout total" />
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary dark:bg-sky-400/10 dark:text-sky-300">
              <SlidersHorizontal size={18} />
            </span>
            <div>
              <h2 className="text-sm font-bold text-primary-dark dark:text-white">Review Queue</h2>
              <p className="text-xs text-muted">Filter by status or search claim details.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div ref={statusPillAttach} className="relative isolate flex flex-wrap gap-2">
              <span
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-primary shadow-sm transition-[transform,width,height] duration-300 ease-out"
                style={{ ...statusPillStyle, opacity: statusPillVisible ? 1 : 0 }}
              />
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  data-tab-key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`relative z-10 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    statusFilter === f.value
                      ? 'text-white'
                      : 'border border-border/60 bg-surface text-muted hover:text-foreground dark:border-[#252a3a] dark:bg-[#161927] dark:text-white/60 dark:hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="min-w-0 lg:w-72">
              <Input
                id="claim-search"
                label="Search claims"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Policy, holder, product..."
              />
            </div>
          </div>
        </div>
      </Card>

      {activeClaimsQuery.isLoading ? (
        <Card className="flex min-h-[260px] items-center justify-center p-10 text-center text-sm text-muted">
          Loading claims...
        </Card>
      ) : visibleItems.length === 0 ? (
        <Card className="flex min-h-[260px] items-center justify-center p-10 text-center">
          <EmptyState preset="search" title="No claims found" description="Insurance claims matching your filters will appear here." />
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleItems.map((claim) => {
            const draft = getDraft(claim.id, claim)
            const isPending = claim.status === 'pending'
            const coveragePct = claim.coverageLimit
              ? Math.min(100, Math.round((claim.amount / claim.coverageLimit) * 100))
              : null

            return (
              <Card key={claim.id} className="overflow-hidden p-0">
                <div className="border-b border-border/70 bg-surface/60 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
                        <ShieldCheck size={20} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-xs font-bold uppercase tracking-wide text-muted">{claim.id}</p>
                          <Badge variant={statusVariant(claim.status)} className="capitalize">{claim.status}</Badge>
                        </div>
                        <h3 className="mt-1 truncate font-display text-lg font-extrabold text-primary-dark dark:text-white">
                          {claim.productName ?? 'Insurance claim'}
                        </h3>
                        <p className="mt-1 text-xs text-muted">{claim.providerName ?? 'Provider not listed'} / {claim.policyNumber}</p>
                      </div>
                    </div>
                    <div className="text-left lg:text-right">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted">Claim Amount</p>
                      <p className="mt-1 font-display text-2xl font-extrabold text-primary-dark dark:text-white">{formatCurrency(claim.amount)}</p>
                      {claim.payoutAmount !== undefined && (
                        <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          payout {formatCurrency(claim.payoutAmount)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <DetailTile icon={<UserRound size={14} />} label="Policy Holder" value={claim.policyHolderName ?? claim.policyHolderId.slice(0, 8)} />
                      <DetailTile icon={<FileText size={14} />} label="Category" value={claim.category ? claim.category.replace('_', ' ') : 'Not categorized'} />
                      <DetailTile icon={<CalendarDays size={14} />} label="Filed" value={formatDate(claim.filedAt).split(',')[0]} />
                    </div>

                    <div className="rounded-2xl border border-border/80 bg-surface/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-muted">Claim Description</p>
                        {coveragePct !== null && <Badge variant="muted">{coveragePct}% of cover</Badge>}
                      </div>
                      <p className="text-sm leading-relaxed text-primary-dark dark:text-white">{claim.description}</p>
                      {claim.policyHolderEmail && <p className="mt-3 text-xs text-muted">{claim.policyHolderEmail}</p>}
                    </div>
                  </div>

                  {isPending ? (
                    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
                      <div>
                        <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">Decision Panel</h4>
                        <p className="mt-1 text-xs leading-relaxed text-amber-800/75 dark:text-amber-200/70">Approve with a payout or reject with review notes.</p>
                      </div>
                      <Textarea
                        id={`notes-${claim.id}`}
                        label="Decision notes"
                        rows={4}
                        value={draft.notes}
                        onChange={(e) => setDraft(claim.id, { notes: e.target.value })}
                      />
                      <Input
                        id={`payout-${claim.id}`}
                        type="number"
                        label="Payout (GHS)"
                        value={draft.payoutAmount}
                        onChange={(e) => setDraft(claim.id, { payoutAmount: e.target.value })}
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button
                          onClick={() => decideClaim(claim, 'approved')}
                          disabled={decide.isPending}
                        >
                          <Check size={14} /> Approve
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => decideClaim(claim, 'rejected')}
                          disabled={decide.isPending}
                        >
                          <X size={14} /> Reject
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 rounded-2xl border border-border/80 bg-surface/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                      <div>
                        <h4 className="text-sm font-bold text-primary-dark dark:text-white">Resolution</h4>
                        <p className="mt-1 text-xs leading-relaxed text-muted">
                          {claim.decidedAt ? `Decided ${formatDate(claim.decidedAt).split(',')[0]}` : 'Decision date unavailable'}
                        </p>
                      </div>
                      {claim.notes ? (
                        <p className="rounded-xl bg-white/70 p-3 text-sm leading-relaxed text-primary-dark dark:bg-black/20 dark:text-white">{claim.notes}</p>
                      ) : (
                        <p className="rounded-xl bg-white/70 p-3 text-sm text-muted dark:bg-black/20">No review notes recorded.</p>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
