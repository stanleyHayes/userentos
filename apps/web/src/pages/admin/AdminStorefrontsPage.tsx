import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
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
import {
  useAdminStorefronts,
  useSuspendStorefront,
  type AdminStorefront,
  type AdminStorefrontStatus,
} from '@/hooks/useAdminStorefronts'
import { formatDate } from '@/lib/utils'
import {
  AlertTriangle, Archive, CheckCircle2, ExternalLink, Globe, RotateCcw,
  ShieldOff, Store,
} from 'lucide-react'

const STATUS_OPTIONS: { value: AdminStorefrontStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'archived', label: 'Archived' },
]

const statusVariant: Record<AdminStorefrontStatus, 'success' | 'danger' | 'muted'> = {
  active: 'success', suspended: 'danger', archived: 'muted',
}

/** The address a visitor actually lands on: the custom domain wins when there is one. */
function liveHost(storefront: AdminStorefront) {
  return storefront.canonicalDomain ?? `${storefront.slug}.userentos.com`
}

function ownerLabel(storefront: AdminStorefront) {
  return storefront.ownerType === 'organization' ? 'Organization' : 'Individual seller'
}

/**
 * The storefront directory (spec §14).
 *
 * Every seller shopfront on the platform, with the one lever admins have over
 * them: suspension. A suspended storefront stops resolving publicly — the
 * by-slug, properties and posts endpoints all filter on `status: 'active'` —
 * so this is the page that takes a bad shopfront off the internet.
 */
export function AdminStorefrontsPage() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<AdminStorefrontStatus | ''>('')
  const [pending, setPending] = useState<{ storefront: AdminStorefront; suspend: boolean } | null>(null)
  const [reason, setReason] = useState('')

  // Search runs on the server (the API caps the directory at 100 rows, so
  // filtering the loaded page would hide matches); debounce keeps every
  // keystroke from becoming a request.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Unfiltered, so the stat row keeps describing the whole directory while the
  // table below is narrowed to one status or one search.
  const directory = useAdminStorefronts()
  const listing = useAdminStorefronts({ status, search: query })
  const suspend = useSuspendStorefront()

  const all = useMemo(() => directory.data?.items ?? [], [directory.data?.items])
  const rows = listing.data?.items ?? []

  const stats = useMemo(() => ({
    total: all.length,
    active: all.filter((s) => s.status === 'active').length,
    suspended: all.filter((s) => s.status === 'suspended').length,
    archived: all.filter((s) => s.status === 'archived').length,
    customDomains: all.filter((s) => Boolean(s.canonicalDomain)).length,
  }), [all])

  const reasonTooShort = reason.trim().length < 3

  function openAction(storefront: AdminStorefront, shouldSuspend: boolean) {
    setPending({ storefront, suspend: shouldSuspend })
    setReason('')
  }

  function submit() {
    // The server validates `reason` with min(3) on BOTH paths — a reinstatement
    // with no note is rejected too, so the form holds the same line.
    if (!pending || reasonTooShort) return

    suspend.mutate({ id: pending.storefront.id, reason: reason.trim(), suspend: pending.suspend }, {
      onSuccess: () => {
        toast.success(pending.suspend
          ? `${pending.storefront.name} is suspended and offline`
          : `${pending.storefront.name} is live again`)
        setPending(null)
        setReason('')
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not update the storefront'),
    })
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Marketplace"
        title="Storefronts"
        description="Every seller shopfront on the platform — who owns it, where it resolves, and whether it is still serving the public."
        icon={<Store size={22} />}
        accent="#0ea5e9"
        meta={`${stats.total.toLocaleString()} in the directory`}
      />

      <AdminStatGrid>
        <AdminStatCard
          label="Storefronts"
          value={stats.total.toLocaleString()}
          description={`${stats.customDomains.toLocaleString()} serving on a verified custom domain.`}
          icon={<Store size={18} />}
          accent="#60a5fa"
        />
        <AdminStatCard
          label="Active"
          value={stats.active.toLocaleString()}
          description="Resolving publicly and listing properties right now."
          icon={<CheckCircle2 size={18} />}
          accent="#10b981"
        />
        <AdminStatCard
          label="Suspended"
          value={stats.suspended.toLocaleString()}
          description="Taken offline by an admin; the public pages return 404."
          icon={<ShieldOff size={18} />}
          accent="#f43f5e"
        />
        <AdminStatCard
          label="Archived"
          value={stats.archived.toLocaleString()}
          description="Closed by their owner and no longer served."
          icon={<Archive size={18} />}
          accent="#94a3b8"
        />
      </AdminStatGrid>

      <AdminToolbar
        title="Directory search"
        description="Search runs on the server across storefront name and address. The directory returns the 100 most recent."
        resultLabel={`${rows.length.toLocaleString()} shown`}
      >
        <div className="w-full sm:w-72">
          <Input
            id="storefront-search"
            placeholder="Search name or address"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            id="storefront-status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => setStatus(e.target.value as AdminStorefrontStatus | '')}
          />
        </div>
      </AdminToolbar>

      {listing.isLoading ? (
        <AdminLoadingState
          title="Loading storefronts"
          description="Fetching the seller directory."
          cols={6}
        />
      ) : rows.length === 0 ? (
        <AdminEmptyState
          title="No storefronts here"
          description={query || status
            ? 'Nothing matches this search and status. Try a different address or clear the filter.'
            : 'No seller has published a storefront yet.'}
          icon={<Store size={22} />}
        />
      ) : (
        <AdminTableCard
          title="Seller storefronts"
          description="Address, owner, live domain and status — with the suspension reason in view so nothing has to be opened to be understood."
        >
          <table className={adminTableClassName('min-w-[1040px]')}>
            <thead>
              <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted dark:border-[#252a3a]/70 dark:text-gray-500">
                <th className="px-4 py-3 font-bold">Storefront</th>
                <th className="px-4 py-3 font-bold">Owner</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Domain</th>
                <th className="px-4 py-3 font-bold">Created</th>
                <th className="px-4 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 dark:divide-[#252a3a]/50">
              {rows.map((storefront) => (
                <tr key={storefront.id} className="align-top transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.03]">
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      {storefront.branding?.logoUrl ? (
                        <img
                          src={storefront.branding.logoUrl}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-bold uppercase text-primary dark:bg-blue-500/15 dark:text-blue-400">
                          {storefront.name.charAt(0)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-primary-dark dark:text-white">{storefront.name}</div>
                        <div className="mt-1 font-mono text-[11px] text-muted dark:text-gray-500">/{storefront.slug}</div>
                        {storefront.tagline && (
                          <div className="mt-1 text-[11px] text-muted dark:text-gray-500">{storefront.tagline}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-semibold text-primary-dark dark:text-white">{ownerLabel(storefront)}</div>
                    {storefront.contact?.email && (
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">{storefront.contact.email}</div>
                    )}
                    {storefront.contact?.phone && (
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">{storefront.contact.phone}</div>
                    )}
                    <div className="mt-1 font-mono text-[10px] text-muted dark:text-gray-600">{storefront.ownerId}</div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={statusVariant[storefront.status]} className="text-[10px] capitalize">
                      {storefront.status}
                    </Badge>
                    {storefront.status === 'suspended' && (
                      <div className="mt-2 flex max-w-[16rem] items-start gap-1 text-[11px] text-danger">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        <span>{storefront.suspendedReason ?? 'No reason was recorded.'}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-dark dark:text-white">
                      <Globe size={12} className="shrink-0 text-muted" />
                      <span className="break-all">{liveHost(storefront)}</span>
                    </div>
                    {/* A domain can only become canonical after its TXT record verifies,
                        so a canonical domain is proof the seller owns it. */}
                    {storefront.canonicalDomain ? (
                      <Badge variant="success" className="mt-2 text-[10px]">Verified custom domain</Badge>
                    ) : (
                      <Badge variant="muted" className="mt-2 text-[10px]">Platform subdomain</Badge>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-xs font-semibold text-primary-dark dark:text-white">{formatDate(storefront.createdAt)}</div>
                    <div className="mt-1 text-[11px] text-muted dark:text-gray-500">Updated {formatDate(storefront.updatedAt)}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link
                        to={`/s/${storefront.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-ring inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-primary hover:underline dark:text-blue-400"
                      >
                        View <ExternalLink size={11} />
                      </Link>
                      {storefront.status === 'suspended' ? (
                        <Button size="sm" variant="outline" onClick={() => openAction(storefront, false)}>
                          <RotateCcw size={13} /> Reinstate
                        </Button>
                      ) : (
                        <Button size="sm" variant="danger" onClick={() => openAction(storefront, true)}>
                          <ShieldOff size={13} /> Suspend
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableCard>
      )}

      <Modal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={pending?.suspend ? 'Suspend this storefront' : 'Reinstate this storefront'}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted dark:text-gray-400">
            {pending?.suspend
              ? `${liveHost(pending.storefront)} stops resolving immediately — the storefront, its listings and its posts all return 404 until it is reinstated.`
              : pending
                ? `${liveHost(pending.storefront)} goes back online with all of its listings.`
                : ''}
          </p>
          <Textarea
            id="storefront-suspend-reason"
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={pending?.suspend
              ? 'e.g. listings misrepresent properties the seller does not manage'
              : 'e.g. seller corrected the listings and the complaint was withdrawn'}
            rows={3}
          />
          <p className="text-xs text-muted dark:text-gray-500">
            {pending?.suspend
              ? 'Shown on this row and kept in the audit trail. At least 3 characters.'
              : 'Kept in the audit trail so the reversal is explained. At least 3 characters.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
            <Button
              variant={pending?.suspend ? 'danger' : 'primary'}
              onClick={submit}
              disabled={reasonTooShort || suspend.isPending}
            >
              {suspend.isPending
                ? 'Saving…'
                : pending?.suspend ? 'Suspend storefront' : 'Reinstate storefront'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
