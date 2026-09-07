import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
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
import { useSlidingIndicator } from '@/hooks/useSlidingIndicator'
import {
  useAdminSponsorshipCampaigns,
  usePauseSponsorship,
  useSponsorshipProducts,
  type SponsorshipCampaign,
  type SponsorshipStatus,
} from '@/hooks/useAdminSponsorships'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AlertTriangle, Eye, ExternalLink, Megaphone, PauseCircle, PlayCircle, Tag, Wallet } from 'lucide-react'

const STATUS_FILTERS: { label: string; value: SponsorshipStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
  { label: 'Awaiting payment', value: 'pending_payment' },
  { label: 'Expired', value: 'expired' },
  { label: 'Cancelled', value: 'cancelled' },
]

const statusVariant: Record<SponsorshipStatus, 'success' | 'warning' | 'danger' | 'muted' | 'default'> = {
  pending_payment: 'warning',
  active: 'success',
  paused: 'warning',
  expired: 'muted',
  cancelled: 'danger',
}

const DAY_MS = 86_400_000

function label(value: string) {
  return value.replaceAll('_', ' ')
}

/** Nothing on this route is populated, so ids are all we can show a human. */
function shortId(id: string) {
  return id.length > 10 ? `${id.slice(0, 10)}…` : id
}

function flightNote(endAt: string): string {
  const ms = new Date(endAt).getTime() - Date.now()
  if (!Number.isFinite(ms)) return 'No end date'
  const days = Math.round(Math.abs(ms) / DAY_MS)
  if (ms < 0) return days === 0 ? 'Ended today' : `Ended ${days} day${days === 1 ? '' : 's'} ago`
  return days === 0 ? 'Ends today' : `${days} day${days === 1 ? '' : 's'} left`
}

/**
 * Platform-wide view of paid placements (spec §9).
 *
 * Pausing is deliberately separate from listing moderation: a campaign can be
 * stopped from serving while its spend and flight dates stay on the record.
 */
export function AdminSponsorshipsPage() {
  const [statusFilter, setStatusFilter] = useState<SponsorshipStatus | 'all'>('all')
  const [pending, setPending] = useState<{ campaign: SponsorshipCampaign; resume: boolean } | null>(null)
  const [reason, setReason] = useState('')

  const { attach: pillAttach, style: pillStyle, visible: pillVisible } = useSlidingIndicator<HTMLDivElement>(statusFilter)
  const { data: campaignData, isLoading } = useAdminSponsorshipCampaigns()
  const { data: productData, isLoading: productsLoading } = useSponsorshipProducts()
  const pause = usePauseSponsorship()

  const campaigns = useMemo(() => campaignData?.items ?? [], [campaignData?.items])
  const products = useMemo(() => productData?.items ?? [], [productData?.items])
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const visible = useMemo(
    () => (statusFilter === 'all' ? campaigns : campaigns.filter((c) => c.status === statusFilter)),
    [campaigns, statusFilter],
  )

  // Totals cover every campaign the route returned, not the filtered slice —
  // an operator reading "total spend" wants the platform number.
  const stats = useMemo(() => {
    let active = 0
    let paused = 0
    let spend = 0
    let impressions = 0
    let clicks = 0
    for (const c of campaigns) {
      if (c.status === 'active') active += 1
      if (c.status === 'paused') paused += 1
      spend += c.spend
      impressions += c.metrics?.impressions ?? 0
      clicks += c.metrics?.clicks ?? 0
    }
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0
    return { active, paused, spend, impressions, clicks, ctr }
  }, [campaigns])

  function submit() {
    if (!pending || reason.trim().length < 3) return
    pause.mutate(
      { id: pending.campaign.id, reason: reason.trim(), resume: pending.resume },
      {
        onSuccess: () => {
          toast.success(pending.resume ? 'Campaign resumed' : 'Campaign paused')
          setPending(null)
          setReason('')
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not update the campaign'),
      },
    )
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Marketplace"
        title="Sponsorships"
        description="Every paid placement on the platform — who bought it, which listing it promotes, what it is delivering, and whether it is still serving."
        icon={<Megaphone size={22} />}
        accent="#8b5cf6"
        meta={`${campaigns.length} campaigns • newest 100`}
      />

      <AdminStatGrid>
        <AdminStatCard
          label="Active campaigns"
          value={stats.active.toLocaleString()}
          description="Currently serving in search and on the placements they bought."
          icon={<PlayCircle size={18} />}
          accent="#10b981"
        />
        <AdminStatCard
          label="Paused"
          value={stats.paused.toLocaleString()}
          description="Stopped by an admin. Spend and flight dates are preserved."
          icon={<PauseCircle size={18} />}
          accent="#f59e0b"
        />
        <AdminStatCard
          label="Total spend"
          value={formatCurrency(stats.spend)}
          description="Committed across every campaign in this view."
          icon={<Wallet size={18} />}
          accent="#60a5fa"
        />
        <AdminStatCard
          label="Impressions served"
          value={stats.impressions.toLocaleString()}
          description={`${stats.clicks.toLocaleString()} clicks • ${stats.ctr.toFixed(2)}% click-through`}
          icon={<Eye size={18} />}
          accent="#8b5cf6"
        />
      </AdminStatGrid>

      <AdminToolbar
        title="Campaign filters"
        description="Filter by campaign status. The route returns the newest 100 campaigns platform-wide."
        resultLabel={`${visible.length.toLocaleString()} visible`}
      >
        <div ref={pillAttach} className="relative isolate flex flex-wrap gap-2">
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-primary shadow-sm transition-[transform,width,height] duration-300 ease-out"
            style={{ ...pillStyle, opacity: pillVisible ? 1 : 0 }}
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
      </AdminToolbar>

      {isLoading ? (
        <AdminLoadingState title="Loading sponsorships" description="Pulling every paid placement on the platform." cols={6} />
      ) : visible.length === 0 ? (
        <AdminEmptyState
          title="No campaigns here"
          description={
            statusFilter === 'all'
              ? 'Nobody has bought a sponsorship yet.'
              : `No campaigns are ${label(statusFilter)} right now.`
          }
          icon={<Megaphone size={22} />}
        />
      ) : (
        <AdminTableCard
          title="Campaigns"
          description="Owner, sponsored listing, placement bought, spend, delivery and flight window."
        >
          <table className={adminTableClassName('min-w-[1080px]')}>
            <thead>
              <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted dark:border-[#252a3a]/70 dark:text-gray-500">
                <th className="px-4 py-3 font-bold">Owner</th>
                <th className="px-4 py-3 font-bold">Listing</th>
                <th className="px-4 py-3 font-bold">Product</th>
                <th className="px-4 py-3 text-right font-bold">Spend</th>
                <th className="px-4 py-3 font-bold">Flight</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 dark:divide-[#252a3a]/50">
              {visible.map((c) => {
                const product = productById.get(c.productId)
                const impressions = c.metrics?.impressions ?? 0
                const clicks = c.metrics?.clicks ?? 0

                return (
                  <tr key={c.id} className="align-top transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-4">
                      <div className="font-mono text-xs font-bold text-primary-dark dark:text-white" title={c.ownerId}>
                        {shortId(c.ownerId)}
                      </div>
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">Bought {formatDate(c.createdAt)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        to={`/properties/${c.propertyId}`}
                        className="focus-ring inline-flex items-center gap-1 rounded text-sm font-semibold text-primary hover:underline dark:text-blue-400"
                      >
                        Open listing <ExternalLink size={12} />
                      </Link>
                      <div className="mt-1 font-mono text-[11px] text-muted dark:text-gray-500" title={c.propertyId}>
                        {shortId(c.propertyId)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-primary-dark dark:text-white">
                        {product?.name ?? 'Retired product'}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted dark:text-gray-500">
                        <Badge variant="muted" className="text-[10px] capitalize">{label(c.placement)}</Badge>
                        {product && <span>{product.durationDays} days</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="font-bold text-primary-dark dark:text-white">{formatCurrency(c.spend)}</div>
                      <div className="text-[11px] text-muted dark:text-gray-500">
                        {product ? `${formatCurrency(product.price)} list price` : 'No longer on sale'}
                      </div>
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">
                        {impressions.toLocaleString()} impressions · {clicks.toLocaleString()} clicks
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-primary-dark dark:text-white">{formatDate(c.startAt)}</div>
                      <div className="text-[11px] text-muted dark:text-gray-500">to {formatDate(c.endAt)}</div>
                      <div className="mt-1 text-[11px] font-semibold text-muted dark:text-gray-500">{flightNote(c.endAt)}</div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={statusVariant[c.status]} className="text-[10px] capitalize">{label(c.status)}</Badge>
                      {c.status === 'paused' && c.pausedReason && (
                        <p className="mt-2 flex max-w-[220px] items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {c.pausedReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {c.status === 'paused' ? (
                        <Button size="sm" variant="outline" onClick={() => { setPending({ campaign: c, resume: true }); setReason('') }}>
                          <PlayCircle size={14} /> Resume
                        </Button>
                      ) : c.status === 'active' || c.status === 'pending_payment' ? (
                        <Button size="sm" variant="outline" onClick={() => { setPending({ campaign: c, resume: false }); setReason('') }}>
                          <PauseCircle size={14} /> Pause
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted dark:text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </AdminTableCard>
      )}

      {productsLoading ? (
        <AdminLoadingState title="Loading sponsorship products" description="Fetching what is currently on sale." rows={3} cols={4} />
      ) : products.length === 0 ? (
        <AdminEmptyState
          title="Nothing on sale"
          description="No active sponsorship products, so landlords cannot buy a placement right now."
          icon={<Tag size={22} />}
        />
      ) : (
        <AdminTableCard
          title="On sale"
          description="The active sponsorship products a landlord can buy today."
        >
          <table className={adminTableClassName('min-w-[640px]')}>
            <thead>
              <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted dark:border-[#252a3a]/70 dark:text-gray-500">
                <th className="px-4 py-3 font-bold">Product</th>
                <th className="px-4 py-3 font-bold">Placement</th>
                <th className="px-4 py-3 font-bold">Duration</th>
                <th className="px-4 py-3 text-right font-bold">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 dark:divide-[#252a3a]/50">
              {products.map((p) => {
                const targeting = [
                  ...(p.targeting?.cities ?? []),
                  ...(p.targeting?.regions ?? []),
                  ...(p.targeting?.propertyTypes ?? []),
                ]

                return (
                  <tr key={p.id} className="align-top transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-primary-dark dark:text-white">{p.name}</div>
                      {p.description && <div className="mt-1 text-[11px] text-muted dark:text-gray-500">{p.description}</div>}
                      {targeting.length > 0 && (
                        <div className="mt-1 text-[11px] text-muted dark:text-gray-500">Targets {targeting.join(', ')}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="muted" className="text-[10px] capitalize">{label(p.placement)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted dark:text-gray-400">{p.durationDays} days</td>
                    <td className="px-4 py-3 text-right font-bold text-primary-dark dark:text-white">{formatCurrency(p.price)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </AdminTableCard>
      )}

      <Modal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={pending?.resume ? 'Resume this campaign' : 'Pause this campaign'}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted dark:text-gray-400">
            {pending?.resume
              ? 'The campaign starts serving again immediately. Its flight dates do not move, so a paused stretch is time the sponsor loses.'
              : 'The campaign stops serving straight away. Spend and flight dates are kept, and the reason is shown against the campaign.'}
          </p>
          <Textarea
            id="sponsorship-pause-reason"
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={pending?.resume ? 'e.g. listing passed re-review' : 'e.g. listing is under moderation review'}
            rows={3}
            minLength={3}
          />
          <p className="text-xs text-muted dark:text-gray-500">Recorded in the audit log either way.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button
              variant={pending?.resume ? 'primary' : 'danger'}
              onClick={submit}
              disabled={reason.trim().length < 3 || pause.isPending}
            >
              {pause.isPending
                ? pending?.resume ? 'Resuming…' : 'Pausing…'
                : pending?.resume ? 'Resume campaign' : 'Pause campaign'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
