import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  AdminStatCard,
  AdminStatGrid,
  AdminTableCard,
  AdminToolbar,
} from '@/components/admin/AdminPagePrimitives'
import { adminTableClassName } from '@/components/admin/adminPageUtils'
import {
  promotionLifecycle,
  useAdminPromotions,
  useCreatePromotion,
  useDisablePromotion,
  useValidateCoupon,
  type AdminPromotion,
  type CreatePromotionBody,
  type PromotionLifecycle,
} from '@/hooks/useAdminPromotions'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import {
  Ban, BadgePercent, CalendarX2, CircleSlash2, Coins, FlaskConical,
  Hourglass, PauseCircle, Plus, Ticket, TicketPercent,
} from 'lucide-react'

type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'muted'

/**
 * How each lifecycle state reads in the table.
 *
 * The two families are kept deliberately far apart: a coupon that ran out
 * (expired, fully redeemed) fades into the background and carries a neutral
 * badge, while one an admin switched off is flagged in red and keeps its full
 * contrast. Both stop working, but only one of them is somebody's decision.
 */
const LIFECYCLE: Record<PromotionLifecycle, { label: string; tone: BadgeTone; icon: ReactNode; row: string }> = {
  active: { label: 'Live', tone: 'success', icon: <Ticket size={12} />, row: '' },
  scheduled: { label: 'Scheduled', tone: 'default', icon: <Hourglass size={12} />, row: '' },
  paused: { label: 'Paused', tone: 'warning', icon: <PauseCircle size={12} />, row: '' },
  expired: { label: 'Expired', tone: 'muted', icon: <CalendarX2 size={12} />, row: 'opacity-60' },
  exhausted: { label: 'Fully redeemed', tone: 'muted', icon: <CircleSlash2 size={12} />, row: 'opacity-60' },
  disabled: { label: 'Switched off', tone: 'danger', icon: <Ban size={12} />, row: 'bg-danger/[0.05] dark:bg-red-500/[0.07]' },
}

const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Live', value: 'active' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Paused', value: 'paused' },
  { label: 'Ran out', value: 'spent' },
  { label: 'Switched off', value: 'disabled' },
] as const

type FilterValue = (typeof FILTERS)[number]['value']

/** The one line that explains the badge — the answer to "why did it stop?". */
function lifecycleDetail(promotion: AdminPromotion, state: PromotionLifecycle): string {
  switch (state) {
    case 'disabled':
      return promotion.disabledReason ? `Reason: ${promotion.disabledReason}` : 'Switched off by an admin'
    case 'expired':
      return `Window closed ${formatDate(promotion.endAt)}`
    case 'exhausted':
      return `Cap of ${promotion.usageLimit} redemptions reached`
    case 'paused':
      return 'Paused — no new redemptions'
    case 'scheduled':
      return `Opens ${formatDate(promotion.startAt)}`
    default:
      return `Runs to ${formatDate(promotion.endAt)}`
  }
}

interface CreateForm {
  code: string
  type: 'percentage' | 'fixed'
  value: string
  startAt: string
  endAt: string
  usageLimit: string
  perUserLimit: string
  minimumSpend: string
  propertyIds: string
}

const EMPTY_FORM: CreateForm = {
  code: '', type: 'percentage', value: '', startAt: '', endAt: '',
  usageLimit: '', perUserLimit: '', minimumSpend: '', propertyIds: '',
}

type FormErrors = Partial<Record<keyof CreateForm, string>>

interface PreviewResult {
  ok: boolean
  message: string
  discountAmount?: number
  fundingSource?: 'platform' | 'seller'
}

/**
 * Promotions and coupons (spec §10).
 *
 * Everything a discount campaign can be is visible from one table, because the
 * support question this page answers — "why did my code stop working?" — has
 * five different answers and the stored `status` only covers two of them.
 */
export function AdminPromotionsPage() {
  const { data, isLoading } = useAdminPromotions()
  const create = useCreatePromotion()
  const disable = useDisablePromotion()
  const validate = useValidateCoupon()

  const [filter, setFilter] = useState<FilterValue>('all')
  const [search, setSearch] = useState('')

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [errors, setErrors] = useState<FormErrors>({})

  const [disabling, setDisabling] = useState<AdminPromotion | null>(null)
  const [reason, setReason] = useState('')

  const [test, setTest] = useState({ code: '', amount: '', sellerId: '', propertyId: '' })
  const [preview, setPreview] = useState<PreviewResult | null>(null)

  const items = useMemo(() => data?.items ?? [], [data?.items])

  // Half of the lifecycle is a comparison against the wall clock, so the clock
  // has to move: a console left open on a triage call would otherwise keep
  // calling a coupon "Live" long after its window shut.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const rows = useMemo(
    () => items.map((promotion) => ({ promotion, state: promotionLifecycle(promotion, now) })),
    [items, now],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(({ promotion, state }) => {
      if (q && !promotion.code.toLowerCase().includes(q)) return false
      if (filter === 'all') return true
      if (filter === 'spent') return state === 'expired' || state === 'exhausted'
      return state === filter
    })
  }, [rows, filter, search])

  const stats = useMemo(() => {
    const live = rows.filter((r) => r.state === 'active').length
    const spent = rows.filter((r) => r.state === 'expired' || r.state === 'exhausted').length
    const switchedOff = rows.filter((r) => r.state === 'disabled').length
    const redemptions = rows.reduce((sum, r) => sum + r.promotion.usedCount, 0)
    return { live, spent, switchedOff, redemptions }
  }, [rows])

  const total = data?.total ?? items.length

  function setField<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function closeCreate() {
    setCreating(false)
    setForm(EMPTY_FORM)
    setErrors({})
  }

  /** Mirrors the zod schema on POST /promotions plus its two follow-up checks. */
  function onCreate() {
    const next: FormErrors = {}

    const code = form.code.trim().toUpperCase()
    if (code.length < 3 || code.length > 40) next.code = 'A code is between 3 and 40 characters.'

    const value = Number(form.value)
    if (!form.value.trim() || !Number.isFinite(value) || value <= 0) {
      next.value = 'The discount must be greater than zero.'
    } else if (form.type === 'percentage' && value > 100) {
      next.value = 'A percentage discount cannot exceed 100%.'
    }

    if (!form.startAt) next.startAt = 'Pick a start date and time.'
    if (!form.endAt) next.endAt = 'Pick an end date and time.'
    if (form.startAt && form.endAt && new Date(form.endAt) <= new Date(form.startAt)) {
      next.endAt = 'The end date must be after the start date.'
    }

    const usageLimit = form.usageLimit.trim() ? Number(form.usageLimit) : undefined
    if (usageLimit !== undefined && (!Number.isInteger(usageLimit) || usageLimit < 1)) {
      next.usageLimit = 'A whole number of redemptions, or blank for no cap.'
    }

    const perUserLimit = form.perUserLimit.trim() ? Number(form.perUserLimit) : undefined
    if (perUserLimit !== undefined && (!Number.isInteger(perUserLimit) || perUserLimit < 1)) {
      next.perUserLimit = 'A whole number of redemptions, or blank for no cap.'
    }

    const minimumSpend = form.minimumSpend.trim() ? Number(form.minimumSpend) : undefined
    if (minimumSpend !== undefined && (!Number.isFinite(minimumSpend) || minimumSpend < 0)) {
      next.minimumSpend = 'A minimum spend cannot be negative.'
    }

    const eligiblePropertyIds = form.propertyIds.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean)
    if (eligiblePropertyIds.length > 200) next.propertyIds = 'Up to 200 listings can be attached.'

    if (Object.values(next).some(Boolean)) {
      setErrors(next)
      return
    }

    const body: CreatePromotionBody = {
      code,
      type: form.type,
      value,
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
      eligiblePropertyIds,
      ...(usageLimit !== undefined ? { usageLimit } : {}),
      ...(perUserLimit !== undefined ? { perUserLimit } : {}),
      ...(minimumSpend !== undefined ? { minimumSpend } : {}),
    }

    create.mutate(body, {
      onSuccess: () => {
        toast.success(`${code} created`)
        closeCreate()
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not create the promotion'),
    })
  }

  function onDisable() {
    if (!disabling || reason.trim().length < 3) return
    disable.mutate({ id: disabling.id, reason: reason.trim() }, {
      onSuccess: () => {
        toast.success(`${disabling.code} switched off`)
        setDisabling(null)
        setReason('')
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not switch the promotion off'),
    })
  }

  function onTest() {
    const amount = Number(test.amount)
    if (!test.code.trim()) { toast.error('Enter a coupon code to test'); return }
    if (!test.amount.trim() || !Number.isFinite(amount) || amount <= 0) { toast.error('Enter the order amount to test against'); return }

    validate.mutate({
      code: test.code.trim(),
      amount,
      ...(test.sellerId.trim() ? { sellerId: test.sellerId.trim() } : {}),
      ...(test.propertyId.trim() ? { propertyId: test.propertyId.trim() } : {}),
    }, {
      onSuccess: (result) => setPreview({
        ok: true,
        message: `Payable drops to ${formatCurrency(amount - result.discountAmount)}`,
        discountAmount: result.discountAmount,
        fundingSource: result.fundingSource,
      }),
      // A rejected coupon comes back as a 422 carrying the server's own reason.
      onError: (err) => setPreview({ ok: false, message: err instanceof Error ? err.message : 'This coupon cannot be used' }),
    })
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Marketplace"
        title="Promotions & Coupons"
        description="Discount campaigns across the platform: what each code is worth, how much of it is left, and who turned it off."
        icon={<TicketPercent size={22} />}
        accent="#8b5cf6"
        meta={`${total.toLocaleString()} campaign${total === 1 ? '' : 's'}`}
      >
        <Button onClick={() => setCreating(true)}>
          <Plus size={14} /> New promotion
        </Button>
      </AdminPageHeader>

      <AdminStatGrid>
        <AdminStatCard
          label="Live now"
          value={stats.live.toLocaleString()}
          description="Inside their window, under their cap, and redeemable today."
          icon={<Ticket size={18} />}
          accent="#10b981"
        />
        <AdminStatCard
          label="Redemptions"
          value={stats.redemptions.toLocaleString()}
          description="Coupons claimed across every campaign on the platform."
          icon={<BadgePercent size={18} />}
          accent="#60a5fa"
        />
        <AdminStatCard
          label="Ran out"
          value={stats.spent.toLocaleString()}
          description="Expired or fully redeemed — nobody switched these off."
          icon={<CircleSlash2 size={18} />}
          accent="#94a3b8"
        />
        <AdminStatCard
          label="Switched off"
          value={stats.switchedOff.toLocaleString()}
          description="Disabled by an admin, each with a reason on the record."
          icon={<Ban size={18} />}
          accent="#ef4444"
        />
      </AdminStatGrid>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary dark:bg-blue-500/15 dark:text-blue-400">
            <FlaskConical size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-primary-dark dark:text-white">Test a coupon</h2>
            <p className="text-xs leading-relaxed text-muted dark:text-gray-500">
              Runs the same check the checkout runs and shows the discount, without spending a redemption.
              Per-user limits are counted against your own account.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Input
            id="test-code"
            label="Coupon code"
            value={test.code}
            onChange={(e) => setTest((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
            placeholder="WELCOME10"
          />
          <Input
            id="test-amount"
            label="Order amount (GHS)"
            type="number"
            min="0"
            value={test.amount}
            onChange={(e) => setTest((prev) => ({ ...prev, amount: e.target.value }))}
            placeholder="1200"
          />
          <Input
            id="test-seller"
            label="Seller ID (optional)"
            value={test.sellerId}
            onChange={(e) => setTest((prev) => ({ ...prev, sellerId: e.target.value }))}
            placeholder="Checks seller-funded scope"
          />
          <Input
            id="test-property"
            label="Listing ID (optional)"
            value={test.propertyId}
            onChange={(e) => setTest((prev) => ({ ...prev, propertyId: e.target.value }))}
            placeholder="Checks eligible listings"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={onTest} disabled={validate.isPending}>
            {validate.isPending ? 'Checking…' : 'Check coupon'}
          </Button>
          {preview && (
            <div
              className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs ${
                preview.ok
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-danger/30 bg-danger/10 text-danger'
              }`}
            >
              {preview.ok ? (
                <span className="font-semibold">
                  Discount {formatCurrency(preview.discountAmount ?? 0)} · {preview.message}
                  {preview.fundingSource ? ` · ${preview.fundingSource}-funded` : ''}
                </span>
              ) : (
                <span className="font-semibold">{preview.message}</span>
              )}
            </div>
          )}
        </div>
      </Card>

      <AdminToolbar
        title="Campaigns"
        description="Filter by what a code is actually doing right now, not by the status stored against it."
        resultLabel={`${filtered.length.toLocaleString()} shown`}
      >
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`focus-ring rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                filter === tab.value
                  ? 'bg-primary text-white dark:bg-blue-600'
                  : 'bg-surface text-muted hover:text-primary dark:bg-white/[0.04] dark:text-gray-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-56">
          <Input
            id="promotion-search"
            placeholder="Search by code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </AdminToolbar>

      {isLoading ? (
        <AdminLoadingState title="Loading promotions" description="Fetching every discount campaign on the platform." rows={6} cols={6} />
      ) : filtered.length === 0 ? (
        <AdminEmptyState
          title="No promotions here"
          description={
            items.length === 0
              ? 'No discount campaign has been created yet. Start with a platform-funded coupon.'
              : 'No campaign matches this filter or code.'
          }
          icon={<TicketPercent size={22} />}
        />
      ) : (
        <AdminTableCard
          title="Discount campaigns"
          description="A faded row ran out on its own — the window closed or the cap filled. A red row was switched off by an admin, and carries their reason."
        >
          <table className={adminTableClassName('min-w-[1040px]')}>
            <thead>
              <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted dark:border-[#252a3a]/70 dark:text-gray-500">
                <th className="px-4 py-3 font-bold">Code</th>
                <th className="px-4 py-3 font-bold">Discount</th>
                <th className="px-4 py-3 font-bold">Usage</th>
                <th className="px-4 py-3 font-bold">Window</th>
                <th className="px-4 py-3 font-bold">Scope</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 dark:divide-[#252a3a]/50">
              {filtered.map(({ promotion, state }) => {
                const meta = LIFECYCLE[state]
                const capped = Boolean(promotion.usageLimit)
                const usedShare = promotion.usageLimit
                  ? Math.min(100, (promotion.usedCount / promotion.usageLimit) * 100)
                  : 0

                return (
                  <tr
                    key={promotion.id}
                    className={`align-top transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.03] ${meta.row}`}
                  >
                    <td className="px-4 py-4">
                      <div className="font-mono text-sm font-bold text-primary-dark dark:text-white">{promotion.code}</div>
                      <div className="mt-1 text-[11px] capitalize text-muted dark:text-gray-500">
                        {promotion.fundingSource}-funded
                      </div>
                      <div className="text-[11px] text-muted dark:text-gray-500">Created {formatDate(promotion.createdAt)}</div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5 font-bold text-primary-dark dark:text-white">
                        {promotion.type === 'percentage' ? <BadgePercent size={14} /> : <Coins size={14} />}
                        {promotion.type === 'percentage' ? `${promotion.value}%` : formatCurrency(promotion.value)}
                      </div>
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">
                        {promotion.minimumSpend ? `Min spend ${formatCurrency(promotion.minimumSpend)}` : 'No minimum spend'}
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="font-bold text-primary-dark dark:text-white">
                        {promotion.usedCount.toLocaleString()}
                        <span className="text-muted dark:text-gray-500">{capped ? ` / ${promotion.usageLimit?.toLocaleString()}` : ' / ∞'}</span>
                      </div>
                      {capped && (
                        <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-border/60 dark:bg-[#252a3a]">
                          <div
                            className={`h-full rounded-full ${state === 'exhausted' ? 'bg-amber-500' : 'bg-primary dark:bg-blue-500'}`}
                            style={{ width: `${usedShare}%` }}
                          />
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">
                        {promotion.perUserLimit ? `${promotion.perUserLimit} per user` : 'Unlimited per user'}
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="text-xs font-semibold text-primary-dark dark:text-white">{formatDate(promotion.startAt)}</div>
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">to {formatDate(promotion.endAt)}</div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="text-xs font-semibold text-primary-dark dark:text-white">
                        {promotion.eligiblePropertyIds.length
                          ? `${promotion.eligiblePropertyIds.length} listing${promotion.eligiblePropertyIds.length === 1 ? '' : 's'}`
                          : 'Every listing'}
                      </div>
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">
                        {promotion.fundingSource === 'seller' && promotion.ownerId ? 'Seller’s own listings only' : 'Platform-wide'}
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <Badge variant={meta.tone} className="gap-1 text-[10px]">
                        {meta.icon} {meta.label}
                      </Badge>
                      <div className={`mt-2 max-w-[220px] text-[11px] ${state === 'disabled' ? 'text-danger' : 'text-muted dark:text-gray-500'}`}>
                        {lifecycleDetail(promotion, state)}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-right">
                      {state === 'disabled' ? (
                        <span className="text-[11px] text-muted dark:text-gray-500">Already off</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setDisabling(promotion)}>
                          <Ban size={14} /> Switch off
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </AdminTableCard>
      )}

      <Modal open={creating} onClose={closeCreate} title="New promotion">
        <div className="space-y-4">
          <p className="text-sm text-muted dark:text-gray-400">
            An admin-created promotion is platform-funded, so the discount comes off RentOS rather than the seller.
          </p>

          <Input
            id="promotion-code"
            label="Coupon code"
            value={form.code}
            onChange={(e) => setField('code', e.target.value.toUpperCase())}
            error={errors.code}
            placeholder="WELCOME10"
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              id="promotion-type"
              label="Discount type"
              value={form.type}
              onChange={(e) => setField('type', e.target.value as CreateForm['type'])}
              options={[
                { value: 'percentage', label: 'Percentage off' },
                { value: 'fixed', label: 'Fixed amount off' },
              ]}
            />
            <Input
              id="promotion-value"
              label={form.type === 'percentage' ? 'Percentage (1–100)' : 'Amount (GHS)'}
              type="number"
              min="0"
              value={form.value}
              onChange={(e) => setField('value', e.target.value)}
              error={errors.value}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="promotion-start"
              label="Starts"
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setField('startAt', e.target.value)}
              error={errors.startAt}
              required
            />
            <Input
              id="promotion-end"
              label="Ends"
              type="datetime-local"
              min={form.startAt || undefined}
              value={form.endAt}
              onChange={(e) => setField('endAt', e.target.value)}
              error={errors.endAt}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="promotion-usage-limit"
              label="Total redemptions"
              type="number"
              min="1"
              value={form.usageLimit}
              onChange={(e) => setField('usageLimit', e.target.value)}
              error={errors.usageLimit}
              placeholder="No cap"
            />
            <Input
              id="promotion-per-user-limit"
              label="Per user"
              type="number"
              min="1"
              value={form.perUserLimit}
              onChange={(e) => setField('perUserLimit', e.target.value)}
              error={errors.perUserLimit}
              placeholder="No cap"
            />
            <Input
              id="promotion-minimum-spend"
              label="Minimum spend"
              type="number"
              min="0"
              value={form.minimumSpend}
              onChange={(e) => setField('minimumSpend', e.target.value)}
              error={errors.minimumSpend}
              placeholder="None"
            />
          </div>

          <Textarea
            id="promotion-properties"
            label="Eligible listing IDs (optional)"
            value={form.propertyIds}
            onChange={(e) => setField('propertyIds', e.target.value)}
            error={errors.propertyIds}
            placeholder="Leave blank to apply to every listing. Separate up to 200 IDs with commas or new lines."
            rows={3}
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeCreate}>Cancel</Button>
            <Button onClick={onCreate} disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create promotion'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(disabling)} onClose={() => setDisabling(null)} title="Switch this promotion off">
        <div className="space-y-4">
          <p className="text-sm text-muted dark:text-gray-400">
            {disabling
              ? `${disabling.code} stops working immediately and stays on the record as switched off, separate from a coupon that simply ran out. Redemptions already claimed are not reversed.`
              : ''}
          </p>
          <Textarea
            id="promotion-disable-reason"
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. abused by resellers on social media"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDisabling(null)}>Cancel</Button>
            <Button variant="danger" onClick={onDisable} disabled={reason.trim().length < 3 || disable.isPending}>
              {disable.isPending ? 'Switching off…' : 'Switch off'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
