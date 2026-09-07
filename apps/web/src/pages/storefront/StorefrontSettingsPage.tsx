import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import TextField from '@mui/material/TextField'
import toast from 'react-hot-toast'
import { Store, Globe, Check, Copy, Trash2, ShieldCheck, Lock } from 'lucide-react'
import {
  useMyStorefront, useCreateStorefront, useUpdateStorefront, useMyEntitlements,
  useAddStorefrontDomain, useVerifyStorefrontDomain, useMakeDomainCanonical, useRemoveStorefrontDomain,
  type StorefrontRecord,
} from '@/hooks/useApi'

/**
 * Seller-facing storefront setup.
 *
 * Premium controls are shown but disabled when the plan does not include them,
 * with the reason stated. The server enforces the same rules — this is the
 * explanation, never the gate.
 */
export function StorefrontSettingsPage() {
  const { data: storefront, isLoading } = useMyStorefront()
  const { data: entitlements } = useMyEntitlements()
  const features = entitlements?.features ?? {}

  const canHaveStorefront = features['storefront.enabled'] === true
  const canBrand = features['storefront.custom_branding'] === true
  const canUseDomain = features['storefront.custom_domain'] === true

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Storefront"
        title="Your Storefront"
        description="Your own branded address on RentOS, showing only your listings."
        meta={entitlements ? `${entitlements.planName} plan` : undefined}
        icon={<Store size={22} />}
      />

      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : !canHaveStorefront && !storefront ? (
        <EmptyState
          preset="general"
          title="Storefronts are a paid feature"
          description="Upgrade your plan to publish a branded storefront with your own listings, blog and address."
        />
      ) : !storefront ? (
        <CreateStorefrontCard />
      ) : (
        <>
          <StorefrontDetailsCard storefront={storefront} canBrand={canBrand} />
          <DomainsCard storefront={storefront} canUseDomain={canUseDomain} />
        </>
      )}
    </div>
  )
}

function CreateStorefrontCard() {
  const create = useCreateStorefront()
  const [form, setForm] = useState({ slug: '', name: '', tagline: '' })
  const slugPreview = form.slug.trim().toLowerCase() || 'your-name'

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h2 className="font-bold text-primary-dark dark:text-white">Claim your address</h2>
          <p className="mt-1 text-sm text-muted dark:text-gray-400">
            Your storefront will live at{' '}
            <span className="font-mono text-primary dark:text-blue-400">{slugPreview}.userentos.com</span>
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Storefront address" size="small" value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            placeholder="homes-by-ama"
            helperText="Lowercase letters, numbers and hyphens"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Display name" size="small" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Homes by Ama"
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </div>
        <TextField
          label="Tagline (optional)" size="small" fullWidth value={form.tagline}
          onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
          placeholder="Verified rentals across Greater Accra"
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <Button
          disabled={form.slug.trim().length < 3 || form.name.trim().length < 2 || create.isPending}
          onClick={() => create.mutate(
            { slug: form.slug.trim().toLowerCase(), name: form.name.trim(), tagline: form.tagline.trim() || undefined },
            {
              onSuccess: () => toast.success('Storefront created'),
              onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not create the storefront'),
            },
          )}
        >
          {create.isPending ? 'Creating…' : 'Create storefront'}
        </Button>
      </CardContent>
    </Card>
  )
}

function StorefrontDetailsCard({ storefront, canBrand }: { storefront: StorefrontRecord; canBrand: boolean }) {
  const update = useUpdateStorefront()
  const [form, setForm] = useState({
    name: storefront.name,
    tagline: storefront.tagline ?? '',
    primaryColor: storefront.branding?.primaryColor ?? '',
  })

  const url = storefront.canonicalDomain
    ? `https://${storefront.canonicalDomain}`
    : `https://${storefront.slug}.userentos.com`

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-primary-dark dark:text-white">{storefront.name}</h2>
            <a href={url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline dark:text-blue-400">
              {url}
            </a>
          </div>
          <Badge variant={storefront.status === 'active' ? 'success' : 'danger'}>{storefront.status}</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Display name" size="small" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Tagline" size="small" value={form.tagline}
            onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Brand colour" size="small" value={form.primaryColor}
            onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
            placeholder="#1e3a5f"
            disabled={!canBrand}
            helperText={canBrand ? 'Used across your storefront' : 'Custom branding is not in your plan'}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </div>

        <Button
          disabled={update.isPending}
          onClick={() => update.mutate(
            {
              name: form.name,
              tagline: form.tagline,
              ...(canBrand ? { branding: { primaryColor: form.primaryColor || undefined } } : {}),
            },
            {
              onSuccess: () => toast.success('Storefront updated'),
              onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save'),
            },
          )}
        >
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </CardContent>
    </Card>
  )
}

function DomainsCard({ storefront, canUseDomain }: { storefront: StorefrontRecord; canUseDomain: boolean }) {
  const add = useAddStorefrontDomain()
  const verify = useVerifyStorefrontDomain()
  const canonical = useMakeDomainCanonical()
  const remove = useRemoveStorefrontDomain()
  const [domain, setDomain] = useState('')

  const domains = storefront.domains ?? []

  if (!canUseDomain) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3">
          <Lock size={18} className="mt-0.5 shrink-0 text-muted" />
          <div>
            <p className="font-semibold text-primary-dark dark:text-white">Custom domains</p>
            <p className="mt-1 text-sm text-muted dark:text-gray-400">
              Connect your own domain on a plan that includes it. Your storefront stays at{' '}
              <span className="font-mono">{storefront.slug}.userentos.com</span> until then.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-primary-dark dark:text-white">
            <Globe size={16} /> Custom domains
          </h2>
          <p className="mt-1 text-sm text-muted dark:text-gray-400">
            Point your own domain here. We verify ownership with a DNS record before it goes live.
          </p>
        </div>

        <div className="flex gap-2">
          <TextField
            fullWidth size="small" label="Domain" value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="homesbyama.com"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Button
            disabled={domain.trim().length < 4 || add.isPending}
            onClick={() => add.mutate(domain.trim(), {
              onSuccess: () => { toast.success('Domain added — publish the DNS records'); setDomain('') },
              onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not add the domain'),
            })}
          >
            Add
          </Button>
        </div>

        {domains.length === 0 ? (
          <p className="text-sm text-muted dark:text-gray-500">No custom domains yet.</p>
        ) : (
          <ul className="space-y-3">
            {domains.map((d) => (
              <li key={d.id} className="rounded-xl bg-surface/60 p-3 dark:bg-white/[0.03]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm text-primary-dark dark:text-white">{d.domain}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={d.status === 'active' ? 'success' : d.status === 'verified' ? 'default' : 'warning'}>
                      {d.status}
                    </Badge>
                    {storefront.canonicalDomain === d.domain && <Badge variant="success">canonical</Badge>}
                  </div>
                </div>

                {d.status === 'pending' && (
                  <div className="mt-2 space-y-1.5 rounded-lg bg-white p-2.5 text-xs dark:bg-[#0c0e1a]">
                    <p className="text-muted dark:text-gray-400">Add this TXT record at your DNS provider:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate font-mono text-[11px] text-primary-dark dark:text-white">{d.verificationToken}</code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(d.verificationToken); toast.success('Copied') }}
                        className="focus-ring rounded p-1 text-muted hover:text-primary"
                        aria-label="Copy TXT value"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                    {d.failureReason && <p className="text-warning">{d.failureReason}</p>}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {d.status === 'pending' && (
                    <Button size="sm" variant="outline" disabled={verify.isPending}
                      onClick={() => verify.mutate(d.id, {
                        onSuccess: () => toast.success('Verified — TLS is being provisioned'),
                        onError: (err) => toast.error(err instanceof Error ? err.message : 'Not verified yet'),
                      })}>
                      <ShieldCheck size={13} /> Verify
                    </Button>
                  )}
                  {(d.status === 'verified' || d.status === 'active') && storefront.canonicalDomain !== d.domain && (
                    <Button size="sm" variant="outline" disabled={canonical.isPending}
                      onClick={() => canonical.mutate(d.id, {
                        onSuccess: () => toast.success('Canonical domain updated'),
                        onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not update'),
                      })}>
                      <Check size={13} /> Make canonical
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={remove.isPending}
                    onClick={() => {
                      if (!confirm(`Remove ${d.domain}? Your storefront falls back to ${storefront.slug}.userentos.com.`)) return
                      remove.mutate(d.id, {
                        onSuccess: () => toast.success('Domain removed'),
                        onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not remove'),
                      })
                    }}>
                    <Trash2 size={13} /> Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
