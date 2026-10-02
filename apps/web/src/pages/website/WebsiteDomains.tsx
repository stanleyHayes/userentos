import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import TextField from '@mui/material/TextField'
import toast from 'react-hot-toast'
import { Globe, Check, Copy, Trash2, ShieldCheck, Lock } from 'lucide-react'
import {
  useAddStorefrontDomain, useVerifyStorefrontDomain, useMakeDomainCanonical, useRemoveStorefrontDomain,
  type StorefrontRecord,
} from '@/hooks/useApi'

/** The owner's own domain (www.businessname.com): add, verify by DNS, make it the main address. */
export function DomainsCard({ storefront, canUseDomain }: { storefront: StorefrontRecord; canUseDomain: boolean }) {
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
              Connect your own domain on a plan that includes it. Your website stays at{' '}
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
              <li key={d.id} className="neumorphic-inset rounded-xl p-3">
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
                  <div className="surface-card mt-2 space-y-1.5 rounded-lg border p-2.5 text-xs">
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
                      if (!confirm(`Remove ${d.domain}? Your website falls back to ${storefront.slug}.userentos.com.`)) return
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
