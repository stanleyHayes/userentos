import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ListSkeleton } from '@/components/ui/Skeleton'
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  AdminPagination,
  AdminStatCard,
  AdminStatGrid,
  AdminTableCard,
  AdminToolbar,
} from '@/components/admin/AdminPagePrimitives'
import { adminTableClassName } from '@/components/admin/adminPageUtils'
import {
  useAdminAffiliate,
  useAdminAffiliates,
  useApproveCommission,
  useRejectCommission,
  type AdminAffiliate,
  type AffiliateCommission,
  type AffiliateStatus,
  type CommissionEvent,
  type CommissionStatus,
  type CommissionTotals,
} from '@/hooks/useAdminAffiliates'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Check, Coins, Copy, Hourglass, Link2, Share2, Users, Wallet, X } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: '', label: 'All affiliates' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
]

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'muted'

const COMMISSION_TONE: Record<CommissionStatus, Tone> = {
  pending: 'warning',
  approved: 'default',
  payable: 'default',
  paid: 'success',
  rejected: 'danger',
  reversed: 'muted',
}

const COMMISSION_LABEL: Record<CommissionStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  payable: 'Payable',
  paid: 'Paid',
  rejected: 'Rejected',
  reversed: 'Reversed',
}

const EVENT_LABEL: Record<CommissionEvent, string> = {
  qualified_signup: 'Qualified signup',
  subscription: 'Subscription',
  sponsorship: 'Sponsorship',
  transaction: 'Transaction',
}

/**
 * Approval is deliberately two clicks — review, then release — so the button
 * has to say which of the two this one is. null means the commission has
 * nowhere left to go.
 */
function approvalLabel(status: CommissionStatus): string | null {
  if (status === 'pending') return 'Approve'
  if (status === 'approved') return 'Release for payout'
  return null
}

/** Anything that has not paid out yet can still be refused. */
function canReject(status: CommissionStatus): boolean {
  return status === 'pending' || status === 'approved' || status === 'payable'
}

function ruleSummary(rule: AffiliateCommission['ruleSnapshot']): string {
  return rule.type === 'percentage' ? `${rule.value}% of the sale` : `${formatCurrency(rule.value)} flat`
}

function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`
}

/**
 * One money bucket. Pending, payable and paid never share a cell anywhere on
 * this screen — a single "total" would hide which of the three an amount is in,
 * and that is the only question an admin is here to answer.
 */
function MoneyCell({ amount, count }: { amount: number; count: number }) {
  return (
    <div className="text-right">
      <div className={`font-bold tabular-nums ${amount > 0 ? 'text-primary-dark dark:text-white' : 'text-muted dark:text-gray-600'}`}>
        {formatCurrency(amount)}
      </div>
      <div className="mt-0.5 text-[11px] text-muted dark:text-gray-500">{plural(count, 'commission')}</div>
    </div>
  )
}

function TotalsRow({ totals }: { totals: CommissionTotals }) {
  const buckets = [
    { label: 'Pending review', amount: totals.pendingAmount, count: totals.pendingCount, accent: 'text-amber-600 dark:text-amber-400' },
    { label: 'Payable', amount: totals.payableAmount, count: totals.payableCount, accent: 'text-primary dark:text-blue-400' },
    { label: 'Paid', amount: totals.paidAmount, count: totals.paidCount, accent: 'text-success' },
  ]

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {buckets.map((b) => (
        <div key={b.label} className="rounded-xl border border-border/60 bg-surface px-3 py-2.5 dark:border-[#252a3a] dark:bg-white/[0.03]">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted dark:text-gray-500">{b.label}</p>
          <p className={`mt-1 text-base font-extrabold tabular-nums ${b.accent}`}>{formatCurrency(b.amount)}</p>
          <p className="text-[11px] text-muted dark:text-gray-500">{plural(b.count, 'commission')}</p>
        </div>
      ))}
    </div>
  )
}

/**
 * The affiliate programme back office (spec §11).
 *
 * The roster is the entry point, but the work happens in the drawer: every
 * commission passes a manual gate before it can be paid, and a refusal has to
 * carry a reason because it lands in the audit trail.
 */
export function AdminAffiliatesPage() {
  const [status, setStatus] = useState<AffiliateStatus | ''>('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

  // Search hits a regex over the user collection, so wait for the typist to stop.
  useEffect(() => {
    const next = searchInput.trim()
    if (next === search) return
    const timer = window.setTimeout(() => {
      setSearch(next)
      setPage(1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchInput, search])

  const params = useMemo(() => ({ status, search, page }), [status, search, page])
  const { data, isLoading, isFetching } = useAdminAffiliates(params)

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1
  const summary = data?.summary
  const hasFilters = Boolean(status || search)

  function changeStatus(next: string) {
    setStatus(next as AffiliateStatus | '')
    setPage(1)
  }

  function resetFilters() {
    setStatus('')
    setSearchInput('')
    setPage(1)
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Marketplace"
        title="Affiliates"
        description="Who is referring business to RentOS, what they have earned, and the gate every commission passes before it can be paid."
        icon={<Share2 size={22} />}
        accent="#8b5cf6"
        meta={`${total.toLocaleString()} affiliates • Page ${page} of ${totalPages}`}
      />

      <AdminStatGrid>
        <AdminStatCard
          label="Affiliates"
          value={total.toLocaleString()}
          description={hasFilters ? 'Profiles matching the current filter.' : 'Every profile in the programme.'}
          icon={<Users size={18} />}
          accent="#8b5cf6"
        />
        <AdminStatCard
          label="Pending review"
          value={formatCurrency(summary?.pendingAmount ?? 0)}
          description={`${plural(summary?.pendingCount ?? 0, 'commission')} waiting on a decision.`}
          icon={<Hourglass size={18} />}
          accent="#f59e0b"
        />
        <AdminStatCard
          label="Payable"
          value={formatCurrency(summary?.payableAmount ?? 0)}
          description={`${plural(summary?.payableCount ?? 0, 'commission')} approved and not yet sent.`}
          icon={<Wallet size={18} />}
          accent="#2d5a8e"
        />
        <AdminStatCard
          label="Paid out"
          value={formatCurrency(summary?.paidAmount ?? 0)}
          description={`${plural(summary?.paidCount ?? 0, 'commission')} settled to date.`}
          icon={<Coins size={18} />}
          accent="#059669"
        />
      </AdminStatGrid>

      <AdminToolbar
        title="Roster"
        description="Search by referral code, name or email. Programme totals above always cover every affiliate, filtered or not."
        resultLabel={isFetching ? 'Updating…' : `${items.length.toLocaleString()} of ${total.toLocaleString()}`}
      >
        <div className="w-full sm:w-64">
          <Input
            id="affiliate-search"
            label="Search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Code, name or email"
          />
        </div>
        <div className="w-full sm:w-44">
          <Select id="affiliate-status" label="Status" value={status} onChange={(e) => changeStatus(e.target.value)} options={STATUS_OPTIONS} />
        </div>
        <Button variant="outline" size="sm" onClick={resetFilters} disabled={!hasFilters}>
          Reset
        </Button>
      </AdminToolbar>

      {isLoading ? (
        <AdminLoadingState title="Loading affiliates" description="Rolling up commissions for each profile." rows={8} cols={7} />
      ) : items.length === 0 ? (
        <AdminEmptyState
          title="No affiliates match"
          description={hasFilters ? 'Nothing under these filters. Clear the search or widen the status.' : 'Nobody has joined the affiliate programme yet.'}
          icon={<Share2 size={22} />}
        />
      ) : (
        <div className={isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={isFetching}>
          <AdminTableCard
            title="Affiliate roster"
            description="Newest first. Each money column is one bucket of the commission ledger — nothing is summed across them."
          >
            <table className={adminTableClassName('min-w-[1120px]')}>
              <thead>
                <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted dark:border-[#252a3a]/70 dark:text-gray-500">
                  <th className="px-4 py-3 font-bold">Affiliate</th>
                  <th className="px-4 py-3 font-bold">Code</th>
                  <th className="px-4 py-3 font-bold">Referrals</th>
                  <th className="px-4 py-3 text-right font-bold">Pending</th>
                  <th className="px-4 py-3 text-right font-bold">Payable</th>
                  <th className="px-4 py-3 text-right font-bold">Paid</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 dark:divide-[#252a3a]/50">
                {items.map((affiliate) => (
                  <AffiliateRow key={affiliate.id} affiliate={affiliate} onOpen={() => setOpenId(affiliate.id)} />
                ))}
              </tbody>
            </table>
          </AdminTableCard>
        </div>
      )}

      <AdminPagination
        page={page}
        totalPages={totalPages}
        onPrevious={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
      />

      {/* Keyed on the affiliate so opening the next one cannot inherit the
          previous drawer's half-typed rejection. */}
      <AffiliateDrawer key={openId ?? 'closed'} affiliateId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

function AffiliateRow({ affiliate, onOpen }: { affiliate: AdminAffiliate; onOpen: () => void }) {
  const { totals, referrals } = affiliate

  return (
    <tr className="align-top transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.03]">
      <td className="px-4 py-4">
        <button
          type="button"
          onClick={onOpen}
          className="focus-ring rounded-lg text-left font-semibold text-primary-dark hover:text-primary dark:text-white dark:hover:text-blue-400"
        >
          {affiliate.affiliateName ?? 'Account removed'}
        </button>
        <div className="mt-1 break-all text-[11px] text-muted dark:text-gray-500">
          {affiliate.affiliateEmail ?? `User ${affiliate.userId}`}
        </div>
        <div className="mt-1 text-[11px] text-muted dark:text-gray-600">Joined {formatDate(affiliate.createdAt)}</div>
      </td>
      <td className="px-4 py-4">
        <span className="rounded-lg border border-border/60 bg-surface px-2 py-1 font-mono text-[11px] font-bold text-primary-dark dark:border-[#252a3a] dark:bg-white/[0.03] dark:text-gray-300">
          {affiliate.code}
        </span>
      </td>
      <td className="px-4 py-4">
        <div className="font-semibold text-primary-dark dark:text-white">{referrals.total.toLocaleString()}</div>
        <div className="mt-0.5 text-[11px] text-muted dark:text-gray-500">{referrals.converted.toLocaleString()} signed up</div>
      </td>
      <td className="px-4 py-4"><MoneyCell amount={totals.pendingAmount} count={totals.pendingCount} /></td>
      <td className="px-4 py-4"><MoneyCell amount={totals.payableAmount} count={totals.payableCount} /></td>
      <td className="px-4 py-4"><MoneyCell amount={totals.paidAmount} count={totals.paidCount} /></td>
      <td className="px-4 py-4">
        <Badge variant={affiliate.status === 'active' ? 'success' : 'danger'}>{affiliate.status}</Badge>
        {affiliate.suspendedReason && (
          <p className="mt-1.5 max-w-[180px] text-[11px] leading-relaxed text-muted dark:text-gray-500">{affiliate.suspendedReason}</p>
        )}
      </td>
      <td className="px-4 py-4 text-right">
        <Button size="sm" variant="outline" onClick={onOpen}>
          Review
        </Button>
      </td>
    </tr>
  )
}

/** The drawer: one affiliate, their ledger, and the approve/reject gate. */
function AffiliateDrawer({ affiliateId, onClose }: { affiliateId: string | null; onClose: () => void }) {
  const { data, isLoading } = useAdminAffiliate(affiliateId)
  const approve = useApproveCommission()
  const reject = useRejectCommission()

  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copyLink(link: string) {
    try {
      // navigator.clipboard is undefined over plain http and throws when denied.
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      toast.error('Could not copy — select the link and copy it manually')
    }
  }

  function onApprove(commission: AffiliateCommission) {
    approve.mutate(commission.id, {
      onSuccess: (updated) => {
        toast.success(
          updated.status === 'payable'
            ? 'Commission released — it will be paid on the next run'
            : 'Commission approved. Release it when you are ready to pay.',
        )
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not approve the commission'),
    })
  }

  function onReject() {
    if (!rejectingId || reason.trim().length < 3) return
    reject.mutate({ id: rejectingId, reason: reason.trim() }, {
      onSuccess: () => {
        toast.success('Commission rejected')
        setRejectingId(null)
        setReason('')
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not reject the commission'),
    })
  }

  const commissions = data?.commissions ?? []
  const referrals = data?.referrals ?? []

  return (
    <Modal
      open={Boolean(affiliateId)}
      onClose={onClose}
      title={data ? `${data.affiliateName ?? 'Account removed'} · ${data.code}` : 'Affiliate'}
      className="max-w-4xl"
    >
      {isLoading || !data ? (
        <div aria-busy="true">
          <span className="sr-only">Loading this affiliate&apos;s ledger.</span>
          <ListSkeleton rows={6} />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={data.status === 'active' ? 'success' : 'danger'}>{data.status}</Badge>
                <span className="text-xs text-muted dark:text-gray-500">Joined {formatDate(data.createdAt)}</span>
              </div>
              <p className="mt-1.5 break-all text-sm text-muted dark:text-gray-400">
                {data.affiliateEmail ?? `User ${data.userId}`}
                {data.affiliatePhone ? ` · ${data.affiliatePhone}` : ''}
              </p>
              {data.suspendedReason && (
                <p className="mt-1 text-xs text-danger">Suspended: {data.suspendedReason}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => copyLink(data.referralLink)}
              title="Copy referral link"
              className="focus-ring inline-flex max-w-full items-center gap-2 rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-left font-mono text-[11px] text-primary-dark transition-colors hover:border-primary/40 hover:text-primary dark:border-[#252a3a] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:border-blue-400/40"
            >
              <Link2 size={12} className="shrink-0 opacity-60" />
              <span className="truncate">{data.referralLink}</span>
              {copied ? <Check size={12} className="shrink-0 text-success" /> : <Copy size={12} className="shrink-0 opacity-60" />}
            </button>
          </div>

          <TotalsRow totals={data.totals} />

          <section>
            <h3 className="text-sm font-extrabold text-primary-dark dark:text-white">Commissions</h3>
            <p className="mt-1 text-xs text-muted dark:text-gray-500">
              Newest 50. Approving moves a commission one step — pending to approved, approved to payable — so nothing reaches the payout queue on a single click.
            </p>

            {commissions.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted dark:border-[#252a3a] dark:text-gray-500">
                This affiliate has not earned a commission yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {commissions.map((commission) => {
                  const nextStep = approvalLabel(commission.status)
                  const isRejecting = rejectingId === commission.id

                  return (
                    <li
                      key={commission.id}
                      className="rounded-xl border border-border/60 bg-surface p-3 dark:border-[#252a3a] dark:bg-white/[0.03]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold tabular-nums text-primary-dark dark:text-white">{formatCurrency(commission.amount)}</span>
                            <Badge variant={COMMISSION_TONE[commission.status]}>{COMMISSION_LABEL[commission.status]}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted dark:text-gray-400">
                            {EVENT_LABEL[commission.event]} · {ruleSummary(commission.ruleSnapshot)} · {formatDate(commission.createdAt)}
                          </p>
                          {commission.sourceRef && (
                            <p className="mt-0.5 break-all font-mono text-[11px] text-muted dark:text-gray-500">{commission.sourceRef}</p>
                          )}
                          {commission.reason && (
                            <p className="mt-1 text-[11px] text-danger">Reason: {commission.reason}</p>
                          )}
                        </div>

                        {(nextStep || canReject(commission.status)) && !isRejecting && (
                          <div className="flex shrink-0 flex-wrap gap-2">
                            {nextStep && (
                              <Button size="sm" onClick={() => onApprove(commission)} disabled={approve.isPending}>
                                <Check size={14} /> {nextStep}
                              </Button>
                            )}
                            {canReject(commission.status) && (
                              <Button size="sm" variant="outline" onClick={() => { setRejectingId(commission.id); setReason('') }}>
                                <X size={14} /> Reject
                              </Button>
                            )}
                          </div>
                        )}
                      </div>

                      {isRejecting && (
                        // Inline rather than a second modal: the amount and the
                        // event being refused stay on screen while the reason
                        // that goes into the audit trail is written.
                        <div className="mt-3 space-y-3 border-t border-border/50 pt-3 dark:border-[#252a3a]/70">
                          <Textarea
                            id={`reject-reason-${commission.id}`}
                            label="Why is this being rejected?"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. the referred account was created by the affiliate themselves"
                            rows={2}
                          />
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setRejectingId(null); setReason('') }}>
                              Cancel
                            </Button>
                            <Button size="sm" variant="danger" onClick={onReject} disabled={reason.trim().length < 3 || reject.isPending}>
                              {reject.isPending ? 'Rejecting…' : 'Reject permanently'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-sm font-extrabold text-primary-dark dark:text-white">Referrals</h3>
            <p className="mt-1 text-xs text-muted dark:text-gray-500">
              Newest 50 accepted touches. A referral stays anonymous until the visitor signs up.
            </p>

            {referrals.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted dark:border-[#252a3a] dark:text-gray-500">
                Nobody has arrived on this code yet.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border/30 dark:divide-[#252a3a]/50">
                {referrals.map((referral) => (
                  <li key={referral.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-primary-dark dark:text-white">
                        {referral.referredUserName ?? 'Not signed up yet'}
                      </p>
                      <p className="text-[11px] text-muted dark:text-gray-500">
                        {referral.source ?? 'Direct'}
                        {referral.campaign ? ` · ${referral.campaign}` : ''} · {formatDate(referral.createdAt)}
                      </p>
                    </div>
                    <span className="text-[11px] text-muted dark:text-gray-500">
                      {referral.referredUserId ? 'Converted' : `Window closes ${formatDate(referral.expiresAt)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}
