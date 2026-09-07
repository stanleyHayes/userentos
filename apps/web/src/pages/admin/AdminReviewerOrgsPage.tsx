import { useMemo, useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
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
  REVIEWER_PERMISSIONS,
  useCreateReviewerOrganization,
  useReviewerOrganizations,
  useUpdateReviewerOrganization,
  type ReviewerOrgKind,
  type ReviewerOrgMode,
  type ReviewerOrganization,
  type ReviewerOrganizationInput,
  type ReviewerPermission,
} from '@/hooks/useReviewerOrganizations'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Building2, Gavel, Globe2, Landmark, MapPin, Pencil, Plus, ShieldCheck, X } from 'lucide-react'

const REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central', 'Northern', 'Volta', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Savannah', 'North East', 'Oti', 'Western North']

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'muted'

const KIND_META: Record<ReviewerOrgKind, { label: string; variant: BadgeVariant }> = {
  platform: { label: 'Platform', variant: 'default' },
  government: { label: 'Government', variant: 'warning' },
  partner: { label: 'Partner', variant: 'muted' },
}

const MODE_META: Record<ReviewerOrgMode, { label: string; hint: string; variant: BadgeVariant }> = {
  advisory: { label: 'Advisory', hint: 'Recorded, never blocks publishing.', variant: 'muted' },
  required: { label: 'Required', hint: 'Publishing waits for their decision.', variant: 'warning' },
  delegated: { label: 'Delegated', hint: 'They decide; RentOS keeps the override.', variant: 'danger' },
}

const PERMISSION_META: Record<ReviewerPermission, { label: string; hint: string; variant: BadgeVariant }> = {
  'property.review.read': { label: 'Read', hint: 'Open submitted listings and their review history.', variant: 'muted' },
  'property.review.approve': { label: 'Approve', hint: 'Let a listing go live.', variant: 'success' },
  'property.review.reject': { label: 'Reject', hint: 'Refuse a listing outright.', variant: 'danger' },
  'property.review.request_changes': { label: 'Request changes', hint: 'Send the listing back to the landlord to fix.', variant: 'warning' },
  'property.review.assign': { label: 'Assign', hint: 'Route a listing to a specific reviewer.', variant: 'default' },
}

const KIND_OPTIONS = (Object.keys(KIND_META) as ReviewerOrgKind[]).map((k) => ({ value: k, label: KIND_META[k].label }))
const MODE_OPTIONS = (Object.keys(MODE_META) as ReviewerOrgMode[]).map((m) => ({ value: m, label: `${MODE_META[m].label} — ${MODE_META[m].hint}` }))

const STATE_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
] as const

type StateFilter = (typeof STATE_TABS)[number]['value']

const KNOWN_PERMISSIONS: readonly string[] = REVIEWER_PERMISSIONS

/** A mode that makes the platform wait on — or defer to — the organization. */
function gatesPublishing(org: ReviewerOrganization) {
  return org.reviewMode === 'required' || org.reviewMode === 'delegated'
}

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

/**
 * Who, besides RentOS staff, may act on a listing under review (spec §5).
 *
 * The stakes are why the scope column lists one badge per permission instead of
 * a joined string: "approve" and "read" look alike in a sentence, and only one
 * of them puts a property in front of tenants.
 */
export function AdminReviewerOrgsPage() {
  const { data, isLoading } = useReviewerOrganizations()
  const create = useCreateReviewerOrganization()
  const update = useUpdateReviewerOrganization()

  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [kindFilter, setKindFilter] = useState<'all' | ReviewerOrgKind>('all')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ReviewerOrganization | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const organizations = useMemo(() => data?.items ?? [], [data?.items])

  const stats = useMemo(() => {
    const active = organizations.filter((o) => o.isActive)
    return {
      total: data?.total ?? organizations.length,
      active: active.length,
      gating: active.filter(gatesPublishing).length,
      nationwide: active.filter((o) => o.scope.regions.length === 0 && o.scope.cities.length === 0).length,
    }
  }, [organizations, data?.total])

  const visible = useMemo(() => organizations.filter((o) => {
    if (stateFilter === 'active' && !o.isActive) return false
    if (stateFilter === 'inactive' && o.isActive) return false
    return kindFilter === 'all' || o.kind === kindFilter
  }), [organizations, stateFilter, kindFilter])

  function onToggleActive(org: ReviewerOrganization, next: boolean) {
    // Switching on a required/delegated authority changes what happens to every
    // submission from that moment, so it gets a confirmation the way payouts do.
    if (next && gatesPublishing(org)) {
      const message = org.reviewMode === 'required'
        ? `${org.name} reviews as REQUIRED. Listings in their jurisdiction will not publish until they decide. Activate?`
        : `${org.name} reviews as DELEGATED. They will decide on listings in their jurisdiction. Activate?`
      if (!confirm(message)) return
    }

    setTogglingId(org.id)
    update.mutate({ id: org.id, isActive: next }, {
      onSuccess: () => toast.success(next ? `${org.name} is now reviewing` : `${org.name} deactivated`),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not change the organization'),
      onSettled: () => setTogglingId(null),
    })
  }

  async function onSubmit(body: ReviewerOrganizationInput) {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...body })
        toast.success('Organization updated')
      } else {
        await create.mutateAsync(body)
        toast.success('Organization created')
      }
      setCreating(false)
      setEditing(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the organization')
    }
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Platform admin"
        title="Reviewer Organizations"
        description="External authorities that may review property listings. With none active, every submission stays in the RentOS queue and publishing works exactly as before."
        icon={<ShieldCheck size={22} />}
        accent="#38bdf8"
        meta={`${stats.total} registered • ${stats.active} active`}
      >
        <Button onClick={() => { setEditing(null); setCreating(true) }}>
          <Plus size={16} /> New organization
        </Button>
      </AdminPageHeader>

      <AdminStatGrid>
        <AdminStatCard
          label="Registered"
          value={stats.total.toLocaleString()}
          description="Every authority on file, active or not."
          icon={<Building2 size={18} />}
          accent="#60a5fa"
        />
        <AdminStatCard
          label="Active"
          value={stats.active.toLocaleString()}
          description="Only active organizations are routed submissions."
          icon={<ShieldCheck size={18} />}
          accent="#10b981"
        />
        <AdminStatCard
          label="Gating publication"
          value={stats.gating.toLocaleString()}
          description="Active on required or delegated review — listings wait on them."
          icon={<Gavel size={18} />}
          accent="#f59e0b"
        />
        <AdminStatCard
          label="Unrestricted reach"
          value={stats.nationwide.toLocaleString()}
          description="Active with no region or city limit, so they see everything."
          icon={<Globe2 size={18} />}
          accent="#a78bfa"
        />
      </AdminStatGrid>

      <AdminToolbar
        title="Registry filters"
        description="Narrow the registry by activation state and organization type."
        resultLabel={`${visible.length} shown`}
      >
        <div className="flex flex-wrap gap-2">
          {STATE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStateFilter(tab.value)}
              className={`focus-ring rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                stateFilter === tab.value
                  ? 'bg-primary text-white dark:bg-blue-600'
                  : 'bg-surface text-muted hover:text-primary dark:bg-white/[0.04] dark:text-gray-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Select
          id="reviewer-org-kind-filter"
          label="Type"
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as 'all' | ReviewerOrgKind)}
          options={[{ value: 'all', label: 'All types' }, ...KIND_OPTIONS]}
          className="min-w-[180px]"
        />
      </AdminToolbar>

      {isLoading ? (
        <AdminLoadingState title="Loading reviewer organizations" description="Reading the authority registry." rows={5} cols={6} />
      ) : visible.length === 0 ? (
        <AdminEmptyState
          title={organizations.length === 0 ? 'No reviewer organizations' : 'Nothing matches these filters'}
          description={
            organizations.length === 0
              ? 'RentOS reviews every listing on its own until an authority is registered here.'
              : 'No organization matches the selected state and type.'
          }
          icon={<Landmark size={22} />}
        />
      ) : (
        <AdminTableCard
          title="Authority registry"
          description="Who may review, where they may review, and exactly which decisions they are allowed to make."
        >
          <table className={adminTableClassName('min-w-[1120px]')}>
            <thead>
              <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted dark:border-[#252a3a]/70 dark:text-gray-500">
                <th className="px-4 py-3 font-bold">Organization</th>
                <th className="px-4 py-3 font-bold">Type</th>
                <th className="px-4 py-3 font-bold">Jurisdiction</th>
                <th className="px-4 py-3 font-bold">Review scopes</th>
                <th className="px-4 py-3 font-bold">Mode</th>
                <th className="px-4 py-3 font-bold">State</th>
                <th className="px-4 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 dark:divide-[#252a3a]/50">
              {visible.map((org) => {
                const kind = KIND_META[org.kind] ?? { label: org.kind, variant: 'muted' as BadgeVariant }
                const mode = MODE_META[org.reviewMode] ?? { label: org.reviewMode, hint: '', variant: 'muted' as BadgeVariant }
                const unrestricted = org.scope.regions.length === 0 && org.scope.cities.length === 0

                return (
                  <tr key={org.id} className="align-top transition-colors hover:bg-primary/5 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-4">
                      <div className="font-bold text-primary-dark dark:text-white">{org.name}</div>
                      <div className="mt-1 font-mono text-[11px] text-muted dark:text-gray-500">{org.slug}</div>
                      <div className="mt-1 text-[11px] text-muted dark:text-gray-500">Added {formatDate(org.createdAt)}</div>
                    </td>

                    <td className="px-4 py-4">
                      <Badge variant={kind.variant} className="text-[10px]">{kind.label}</Badge>
                    </td>

                    <td className="px-4 py-4">
                      {unrestricted ? (
                        <span className="flex items-center gap-1 text-[11px] text-muted dark:text-gray-500">
                          <Globe2 size={12} /> Nationwide — no limit
                        </span>
                      ) : (
                        <div className="flex max-w-[240px] flex-wrap gap-1">
                          {org.scope.regions.map((region) => (
                            <Badge key={`r-${region}`} variant="default" className="text-[10px]">{region}</Badge>
                          ))}
                          {org.scope.cities.map((city) => (
                            <Badge key={`c-${city}`} variant="muted" className="text-[10px]">
                              <MapPin size={10} className="mr-1" />{city}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      {org.permissions.length === 0 ? (
                        <span className="text-[11px] text-danger">No permissions — cannot review anything</span>
                      ) : (
                        <div className="flex max-w-[280px] flex-wrap gap-1">
                          {org.permissions.map((permission) => {
                            const meta = PERMISSION_META[permission as ReviewerPermission]
                            return (
                              <Badge
                                key={permission}
                                variant={meta?.variant ?? 'muted'}
                                className="text-[10px]"
                                title={permission}
                              >
                                {meta?.label ?? permission}
                              </Badge>
                            )
                          })}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <Badge variant={mode.variant} className="text-[10px]">{mode.label}</Badge>
                      <div className="mt-1 max-w-[180px] text-[11px] leading-relaxed text-muted dark:text-gray-500">{mode.hint}</div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={org.isActive}
                          onChange={(next) => onToggleActive(org, next)}
                          disabled={togglingId === org.id}
                          size="sm"
                        />
                        <span className={`text-[11px] font-semibold ${org.isActive ? 'text-success' : 'text-muted dark:text-gray-500'}`}>
                          {org.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-right">
                      <Button size="sm" variant="outline" onClick={() => { setCreating(false); setEditing(org) }}>
                        <Pencil size={13} /> Edit
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </AdminTableCard>
      )}

      {(creating || editing) && (
        <OrgFormModal
          // Remount per target so the form always opens on that org's values.
          key={editing?.id ?? 'new'}
          organization={editing}
          submitting={create.isPending || update.isPending}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSubmit={onSubmit}
        />
      )}
    </div>
  )
}

interface OrgFormModalProps {
  organization: ReviewerOrganization | null
  submitting: boolean
  onClose: () => void
  onSubmit: (body: ReviewerOrganizationInput) => void
}

/**
 * Create/edit form. Every field here exists in the server's zod schema and
 * nothing else does, so a valid form is a valid request.
 */
function OrgFormModal({ organization, submitting, onClose, onSubmit }: OrgFormModalProps) {
  const [name, setName] = useState(organization?.name ?? '')
  const [slug, setSlug] = useState(organization?.slug ?? '')
  const [slugEdited, setSlugEdited] = useState(Boolean(organization))
  const [kind, setKind] = useState<ReviewerOrgKind>(organization?.kind ?? 'partner')
  const [reviewMode, setReviewMode] = useState<ReviewerOrgMode>(organization?.reviewMode ?? 'advisory')
  const [isActive, setIsActive] = useState(organization?.isActive ?? false)
  const [regions, setRegions] = useState<string[]>(organization?.scope.regions ?? [])
  const [cities, setCities] = useState<string[]>(organization?.scope.cities ?? [])
  const [cityDraft, setCityDraft] = useState('')
  const [permissions, setPermissions] = useState<string[]>(organization?.permissions ?? ['property.review.read'])
  const [errors, setErrors] = useState<{ name?: string; slug?: string; permissions?: string }>({})

  // Grants made outside this catalogue (an older seed, a future permission) are
  // shown read-only and carried through the save rather than silently dropped.
  const extraPermissions = permissions.filter((p) => !KNOWN_PERMISSIONS.includes(p))

  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }

  function onNameChange(value: string) {
    setName(value)
    if (!slugEdited) setSlug(slugify(value))
  }

  function addCity() {
    const value = cityDraft.trim()
    if (!value || cities.includes(value)) { setCityDraft(''); return }
    setCities([...cities, value])
    setCityDraft('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const trimmedName = name.trim()
    const trimmedSlug = slug.trim().toLowerCase()
    const next: typeof errors = {}

    if (trimmedName.length < 2 || trimmedName.length > 120) next.name = 'Between 2 and 120 characters'
    if (trimmedSlug.length < 2 || trimmedSlug.length > 60) next.slug = 'Between 2 and 60 characters'
    else if (!/^[a-z0-9-]+$/.test(trimmedSlug)) next.slug = 'Use lowercase letters, numbers and hyphens'
    // The schema would accept an empty array, but an organization that cannot
    // even read a submission has no reason to exist.
    if (permissions.length === 0) next.permissions = 'Grant at least one scope'

    setErrors(next)
    if (Object.keys(next).length > 0) return

    onSubmit({
      name: trimmedName,
      slug: trimmedSlug,
      kind,
      reviewMode,
      isActive,
      scope: { regions, cities },
      permissions,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={organization ? `Edit ${organization.name}` : 'New reviewer organization'}
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="org-name"
            label="Name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. Lands Commission"
            error={errors.name}
            required
          />
          <Input
            id="org-slug"
            label="Slug"
            value={slug}
            onChange={(e) => { setSlugEdited(true); setSlug(e.target.value) }}
            placeholder="lands-commission"
            error={errors.slug}
            required
          />
        </div>
        <p className="-mt-2 text-[11px] leading-relaxed text-muted dark:text-gray-500">
          The slug is the organization's stable identifier: lowercase letters, numbers and hyphens, unique across the registry.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="org-kind"
            label="Type"
            value={kind}
            onChange={(e) => setKind(e.target.value as ReviewerOrgKind)}
            options={KIND_OPTIONS}
          />
          <Select
            id="org-review-mode"
            label="Review mode"
            value={reviewMode}
            onChange={(e) => setReviewMode(e.target.value as ReviewerOrgMode)}
            options={MODE_OPTIONS}
          />
        </div>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-primary-dark dark:text-white">Review scopes</h3>
            {errors.permissions && <span className="text-xs font-semibold text-danger">{errors.permissions}</span>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {REVIEWER_PERMISSIONS.map((permission) => {
              const meta = PERMISSION_META[permission]
              const granted = permissions.includes(permission)
              return (
                <button
                  key={permission}
                  type="button"
                  onClick={() => setPermissions(toggle(permissions, permission))}
                  className={`focus-ring rounded-xl border p-3 text-left transition-colors ${
                    granted
                      ? 'border-primary/40 bg-primary/5 dark:border-blue-400/40 dark:bg-blue-500/10'
                      : 'border-border/70 bg-white/60 hover:border-primary/30 dark:border-[#252a3a] dark:bg-white/[0.03]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Badge variant={granted ? meta.variant : 'muted'} className="text-[10px]">{meta.label}</Badge>
                    {granted && <span className="text-[10px] font-bold uppercase tracking-wide text-success">Granted</span>}
                  </span>
                  <span className="mt-1.5 block text-[11px] leading-relaxed text-muted dark:text-gray-400">{meta.hint}</span>
                  <span className="mt-1 block font-mono text-[10px] text-muted dark:text-gray-500">{permission}</span>
                </button>
              )
            })}
          </div>
          {extraPermissions.length > 0 && (
            <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted dark:text-gray-500">
              Also granted, kept as-is:
              {extraPermissions.map((p) => <Badge key={p} variant="muted" className="text-[10px]">{p}</Badge>)}
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-muted dark:text-gray-500">
            property.review.override is not offered here — the server reserves it for super admins, so granting it would
            change nothing.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-bold text-primary-dark dark:text-white">Jurisdiction</h3>
          <p className="text-[11px] leading-relaxed text-muted dark:text-gray-500">
            Leave both empty for nationwide reach. Anything selected limits them to listings in that area.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {REGIONS.map((region) => {
              const on = regions.includes(region)
              return (
                <button
                  key={region}
                  type="button"
                  onClick={() => setRegions(toggle(regions, region))}
                  className={`focus-ring rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    on
                      ? 'bg-primary text-white dark:bg-blue-600'
                      : 'bg-surface text-muted hover:text-primary dark:bg-white/[0.04] dark:text-gray-400'
                  }`}
                >
                  {region}
                </button>
              )
            })}
          </div>

          <div className="flex items-start gap-2 pt-1">
            <Input
              id="org-city"
              label="Cities"
              value={cityDraft}
              onChange={(e) => setCityDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCity() } }}
              placeholder="Type a city and press Enter"
            />
            <Button type="button" variant="outline" onClick={addCity} className="mt-2 shrink-0">Add</Button>
          </div>
          {cities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {cities.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => setCities(cities.filter((c) => c !== city))}
                  className="focus-ring inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:text-danger dark:bg-white/[0.04] dark:text-gray-400"
                >
                  {city} <X size={11} />
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-surface/60 p-3 dark:border-[#252a3a] dark:bg-white/[0.03]">
          <Switch checked={isActive} onChange={setIsActive} />
          <div>
            <p className="text-sm font-semibold text-primary-dark dark:text-white">Active</p>
            <p className="text-[11px] leading-relaxed text-muted dark:text-gray-500">
              {isActive && (reviewMode === 'required' || reviewMode === 'delegated')
                ? `Submissions in their jurisdiction will route to them, and ${MODE_META[reviewMode].hint.toLowerCase()}`
                : 'Inactive organizations are never routed submissions.'}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : organization ? 'Save changes' : 'Create organization'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
